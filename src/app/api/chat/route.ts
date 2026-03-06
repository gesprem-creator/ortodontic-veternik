import { NextRequest, NextResponse } from 'next/server'
import { ServiceType } from '@prisma/client'
import {
  createAppointment,
  isSlotAvailable,
  findNextAvailableSlot,
  findAvailableDays,
  getAvailableSlots,
  SERVICE_NAMES,
  SERVICE_DURATIONS,
  formatTime,
  parseTime,
  formatDateSr,
  SERVICE_PROVIDERS,
} from '@/lib/appointments'
import { db } from '@/lib/db'

// ==================== PARSIRANJE DATUMA I VREMENA ====================

const DAY_NAMES_SR: Record<string, number> = {
  'ponedeljak': 1, 'ponedjeljak': 1, 'pon': 1,
  'utorak': 2, 'uto': 2, 'utor': 2,
  'sreda': 3, 'srijeda': 3, 'sre': 3,
  'četvrtak': 4, 'cetvrtak': 4, 'čet': 4, 'cet': 4,
  'petak': 5, 'pet': 5,
  'subota': 6, 'sub': 6,
  'nedelja': 0, 'nedjelja': 0, 'ned': 0,
}

const DAYS_SR = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota']

// Parsiranje dana iz poruke
function parseDayFromMessage(message: string): { dayOfWeek: number; isToday: boolean; isTomorrow: boolean } | null {
  const lower = message.toLowerCase()
  
  if (lower.includes('danas')) {
    const today = new Date().getDay()
    return { dayOfWeek: today, isToday: true, isTomorrow: false }
  }
  
  if (lower.includes('sutra')) {
    const tomorrow = (new Date().getDay() + 1) % 7
    return { dayOfWeek: tomorrow, isToday: false, isTomorrow: true }
  }
  
  for (const [name, dayNum] of Object.entries(DAY_NAMES_SR)) {
    if (lower.includes(name)) {
      return { dayOfWeek: dayNum, isToday: false, isTomorrow: false }
    }
  }
  
  return null
}

// Parsiranje vremena iz poruke - STROŽIJE
function parseTimeFromMessage(message: string): string | null {
  const trimmed = message.trim()
  
  // Format: "15:00" ili "15:30" - MORA biti u formatu HH:MM
  const exactTimeMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/)
  if (exactTimeMatch) {
    const hours = parseInt(exactTimeMatch[1])
    const minutes = parseInt(exactTimeMatch[2])
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }
  }
  
  // Format sa rečima: "u 15:00", "15 sati", "15h", "15:30"
  const lower = trimmed.toLowerCase()
  const timeWithColon = lower.match(/(?:u\s+)?(\d{1,2}):(\d{2})/)
  if (timeWithColon) {
    const hours = parseInt(timeWithColon[1])
    const minutes = parseInt(timeWithColon[2])
    
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }
  }
  
  // Format sa "h" ili "sati": "15h", "15 sati"
  const timeWithSuffix = lower.match(/(?:u\s+)?(\d{1,2})(?:\s*(?:h|sata|sati|časova|casova))/)
  if (timeWithSuffix) {
    const hours = parseInt(timeWithSuffix[1])
    
    if (hours >= 0 && hours <= 23) {
      return `${hours.toString().padStart(2, '0')}:00`
    }
  }
  
  return null
}

// Konverzija dana u nedelji u konkretan datum
function getDayDate(dayOfWeek: number, isToday: boolean, isTomorrow: boolean): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  if (isToday) return today
  if (isTomorrow) {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  }
  
  const currentDay = today.getDay()
  let daysToAdd = dayOfWeek - currentDay
  if (daysToAdd <= 0) daysToAdd += 7
  
  const result = new Date(today)
  result.setDate(result.getDate() + daysToAdd)
  return result
}

// ==================== STANJE SESIJE ====================

interface SessionState {
  provider?: 'DENTIST' | 'ORTHODONTIST'
  serviceType?: ServiceType
  proposedDate?: string
  proposedTime?: string
  confirmed?: boolean
}

const sessionState = new Map<string, SessionState>()

// ==================== POMOĆNE FUNKCIJE ZA ODGOVORE ====================

function getTodayDateStr(): string {
  const today = new Date()
  return formatDateSr(today)
}

function getDateInfo(): string {
  const today = new Date()
  const day = today.getDate().toString().padStart(2, '0')
  const month = (today.getMonth() + 1).toString().padStart(2, '0')
  const year = today.getFullYear()
  
  let info = `Danas je ${DAYS_SR[today.getDay()]}, ${day}.${month}.${year}.\n\n`
  info += 'Slobodni dani ove nedelje:\n'
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() + i)
    const dDay = d.getDay()
    if (dDay === 0 || dDay === 6) continue // Preskoči vikend
    
    info += `• ${DAYS_SR[dDay]} ${formatDateSr(d)}\n`
  }
  
  return info
}

// ==================== GLAVNA POST FUNKCIJA ====================

export async function POST(request: NextRequest) {
  try {
    const { sessionId, message } = await request.json()
    
    if (!message) {
      return NextResponse.json({ error: 'Poruka je obavezna' }, { status: 400 })
    }
    
    const state = sessionState.get(sessionId) || {}
    const lowerMessage = message.toLowerCase().trim()
    
    // DEBUG logovanje
    console.log('📩 Message:', message)
    console.log('📊 Current state:', JSON.stringify(state))
    console.log('🕐 Parsed time:', parseTimeFromMessage(message))
    console.log('📅 Parsed day:', parseDayFromMessage(message))
    
    // 1. POZDRAV / POCETAK
    if (lowerMessage.includes('zdravo') || lowerMessage.includes('pozdrav') || lowerMessage.includes('ćao') || lowerMessage.includes('cao') || lowerMessage.includes('dobar dan') || lowerMessage.includes('dobro jutro') || lowerMessage.includes('dobro vece')) {
      return NextResponse.json({
        success: true,
        response: `🦷 Dobar dan! Ja sam AI asistent stomatološke ordinacije "Ortodontic" iz Veternika.\n\n${getDateInfo()}\nDa li želite da zakažete kod stomatologa ili ortodonta?\n\n**Izaberite jednu od opcija:**`,
      })
    }
    
    // 2. ODABIR DOKTORA
    if (lowerMessage.includes('stomatolog')) {
      state.provider = 'DENTIST'
      sessionState.set(sessionId, state)
      return NextResponse.json({
        success: true,
        response: 'Izabrali ste stomatologa. Da li želite popravku ili lečenje zuba?',
      })
    }
    
    if (lowerMessage.includes('ortodont')) {
      state.provider = 'ORTHODONTIST'
      sessionState.set(sessionId, state)
      return NextResponse.json({
        success: true,
        response: 'Izabrali ste ortodonta. Ortodont radi samo petkom od 18:00 do 21:30h. Da li želite kontrolu, lepljenje proteze ili skidanje proteze?',
      })
    }
    
    // 3. ODABIR USLUGE ZA STOMATOLOGA
    if (state.provider === 'DENTIST' && !state.serviceType) {
      if (lowerMessage.includes('popravk')) {
        state.serviceType = 'REPAIR'
        sessionState.set(sessionId, state)
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste popravku zuba (60 minuta). Koji dan i koliko sati želite da zakazete?\n\nRadno vreme stomatologa:\n• Ponedeljak-Četvrtak: 14:00-21:00\n• Petak: 14:00-18:00',
        })
      }
      if (lowerMessage.includes('lečenje') || lowerMessage.includes('lecenje')) {
        state.serviceType = 'TREATMENT'
        sessionState.set(sessionId, state)
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste lečenje zuba (60 minuta). Koji dan i koliko sati želite da zakazete?\n\nRadno vreme stomatologa:\n• Ponedeljak-Četvrtak: 14:00-21:00\n• Petak: 14:00-18:00',
        })
      }
    }
    
    // 4. ODABIR USLUGE ZA ORTODONTA
    if (state.provider === 'ORTHODONTIST' && !state.serviceType) {
      if (lowerMessage.includes('kontrol')) {
        state.serviceType = 'ORTHO_CHECKUP'
        sessionState.set(sessionId, state)
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste kontrolu (15 minuta). Koji dan i koliko sati želite da zakazete?\n\nNapomena: Ortodont radi samo petkom od 18:00 do 21:30h.',
        })
      }
      if (lowerMessage.includes('lepljenje') || lowerMessage.includes('fiksna')) {
        state.serviceType = 'ORTHO_BONDING'
        sessionState.set(sessionId, state)
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste lepljenje fiksne proteze (45 minuta). Koji dan i koliko sati želite da zakazete?\n\nNapomena: Ortodont radi samo petkom od 18:00 do 21:30h.',
        })
      }
      if (lowerMessage.includes('skidanje')) {
        state.serviceType = 'ORTHO_REMOVAL'
        sessionState.set(sessionId, state)
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste skidanje fiksne proteze (45 minuta). Koji dan i koliko sati želite da zakazete?\n\nNapomena: Ortodont radi samo petkom od 18:00 do 21:30h.',
        })
      }
    }
    
    // 5. UNOS DATUMA I VREMENA (nakon odabira usluge)
    if (state.serviceType) {
      const dayInfo = parseDayFromMessage(message)
      const timeStr = parseTimeFromMessage(message)
      
      console.log('🔍 Checking date/time input:', { dayInfo, timeStr, proposedDate: state.proposedDate })
      
      // PRVO: Ako imamo samo vreme (klik na dugme) i imamo zapamćen datum
      if (!dayInfo && timeStr && state.proposedDate) {
        console.log('⏰ Processing time with saved date:', timeStr, state.proposedDate)
        const date = new Date(state.proposedDate)
        
        // Provera za stomatologa - petak posle 18h ne radi (tu je ortodont)
        if (state.provider === 'DENTIST' && date.getDay() === 5) {
          const requestedHour = parseInt(timeStr.split(':')[0])
          if (requestedHour >= 18) {
            return NextResponse.json({
              success: true,
              response: '❌ U tim terminima radi ortodont. Izaberite neki raniji termin u petak, npr. 17:00 ili ranije.\n\nRadno vreme stomatologa petkom je od 14:00 do 18:00.',
            })
          }
        }
        
        // Proveri dostupnost
        const result = await isSlotAvailable(date, timeStr, state.serviceType)
        
        if (result.available) {
          state.proposedTime = timeStr
          sessionState.set(sessionId, state)
          
          const serviceName = SERVICE_NAMES[state.serviceType]
          const duration = SERVICE_DURATIONS[state.serviceType]
          const endTime = formatTime(parseTime(timeStr) + duration / 60)
          
          return NextResponse.json({
            success: true,
            response: `✅ Termin je slobodan!\n\n📅 **${serviceName}**\n🗓️ ${DAYS_SR[date.getDay()]}, ${formatDateSr(date)}\n🕐 ${timeStr} - ${endTime} (${duration} min)\n\nDa li vam odgovara ovaj termin? Odgovorite sa "da" ili "ne".`,
            buttons: [
              { text: '✅ Da', value: 'Da' },
              { text: '❌ Ne', value: 'Ne' },
            ],
          })
        } else {
          // Traži sledeći slobodan
          const nextSlot = await findNextAvailableSlot(date, state.serviceType, timeStr)
          
          if (nextSlot) {
            state.proposedDate = nextSlot.dateISO
            state.proposedTime = nextSlot.timeSlot
            sessionState.set(sessionId, state)
            
            const serviceName = SERVICE_NAMES[state.serviceType]
            const duration = SERVICE_DURATIONS[state.serviceType]
            const endTime = formatTime(parseTime(nextSlot.timeSlot) + duration / 60)
            
            return NextResponse.json({
              success: true,
              response: `❌ Nažalost, termin u ${timeStr} je zauzet.\n\n💡 **Prvi slobodni termin:**\n📅 ${nextSlot.dayName}, ${nextSlot.dateStr}\n🕐 ${nextSlot.timeSlot} - ${endTime}\n\nDa li vam odgovara ovaj termin? Odgovorite sa "da" ili "ne".`,
              buttons: [
                { text: '✅ Da', value: 'Da' },
                { text: '❌ Ne', value: 'Ne' },
              ],
            })
          } else {
            return NextResponse.json({
              success: true,
              response: '❌ Nažalost, nema slobodnih termina u narednih 14 dana za ovu uslugu. Molimo pokušajte kasnije.',
            })
          }
        }
      }
      
      // DRUGO: Ako su i dan i vreme uneti zajedno
      if (dayInfo && timeStr) {
        const date = getDayDate(dayInfo.dayOfWeek, dayInfo.isToday, dayInfo.isTomorrow)
        
        // Provera za ortodonta - mora biti petak
        if (state.provider === 'ORTHODONTIST' && date.getDay() !== 5) {
          return NextResponse.json({
            success: true,
            response: '❌ Ortodont radi samo petkom od 18:00 do 21:30h.\n\nDa li želite da zakažete za petak? Recite "petak" i vreme kada želite da dođete.',
          })
        }
        
        // Provera za stomatologa - petak posle 18h ne radi (tu je ortodont)
        if (state.provider === 'DENTIST' && date.getDay() === 5) {
          const requestedHour = parseInt(timeStr.split(':')[0])
          if (requestedHour >= 18) {
            return NextResponse.json({
              success: true,
              response: '❌ U tim terminima radi ortodont. Izaberite neki raniji termin u petak, npr. 17:00 ili ranije.\n\nRadno vreme stomatologa petkom je od 14:00 do 18:00.',
            })
          }
        }
        
        // Proveri dostupnost
        const result = await isSlotAvailable(date, timeStr, state.serviceType)
        
        if (result.available) {
          state.proposedDate = date.toISOString().split('T')[0]
          state.proposedTime = timeStr
          sessionState.set(sessionId, state)
          
          const serviceName = SERVICE_NAMES[state.serviceType]
          const duration = SERVICE_DURATIONS[state.serviceType]
          const endTime = formatTime(parseTime(timeStr) + duration / 60)
          
          return NextResponse.json({
            success: true,
            response: `✅ Termin je slobodan!\n\n📅 **${serviceName}**\n🗓️ ${DAYS_SR[date.getDay()]}, ${formatDateSr(date)}\n🕐 ${timeStr} - ${endTime} (${duration} min)\n\nDa li vam odgovara ovaj termin? Odgovorite sa "da" ili "ne".`,
          })
        } else {
          // Traži sledeći slobodan
          const nextSlot = await findNextAvailableSlot(date, state.serviceType, timeStr)
          
          if (nextSlot) {
            state.proposedDate = nextSlot.dateISO
            state.proposedTime = nextSlot.timeSlot
            sessionState.set(sessionId, state)
            
            const serviceName = SERVICE_NAMES[state.serviceType]
            const duration = SERVICE_DURATIONS[state.serviceType]
            const endTime = formatTime(parseTime(nextSlot.timeSlot) + duration / 60)
            
            return NextResponse.json({
              success: true,
              response: `❌ Nažalost, termin ${formatDateSr(date)} u ${timeStr} je zauzet.\n\n💡 **Prvi slobodni termin:**\n📅 ${nextSlot.dayName}, ${nextSlot.dateStr}\n🕐 ${nextSlot.timeSlot} - ${endTime}\n\nDa li vam odgovara ovaj termin? Odgovorite sa "da" ili "ne".`,
            })
          } else {
            return NextResponse.json({
              success: true,
              response: '❌ Nažalost, nema slobodnih termina u narednih 14 dana za ovu uslugu. Molimo pokušajte kasnije.',
            })
          }
        }
      }
      
      // Ako je samo dan ili samo vreme
      if (dayInfo && !timeStr) {
        const date = getDayDate(dayInfo.dayOfWeek, dayInfo.isToday, dayInfo.isTomorrow)
        
        // Provera za ortodonta
        if (state.provider === 'ORTHODONTIST' && date.getDay() !== 5) {
          return NextResponse.json({
            success: true,
            response: '❌ Ortodont radi samo petkom od 18:00 do 21:30h.\n\nDa li želite da zakažete za petak?',
          })
        }
        
        // Prikaži slobodne termine za taj dan
        const { slots } = await getAvailableSlots(date, state.serviceType)
        
        if (slots.length > 0) {
          // ZAPAMTI datum u state da bi kad korisnik klikne na vreme znao koji je dan
          state.proposedDate = date.toISOString().split('T')[0]
          sessionState.set(sessionId, state)
          
          // Vrati slotove kao posebno polje za klikabilne dugmiće
          return NextResponse.json({
            success: true,
            response: `📅 ${DAYS_SR[date.getDay()]}, ${formatDateSr(date)}\n\nSlobodni termini:\n${slots.map(s => `• ${s}`).join('\n')}\n\nIzaberite vreme kada želite da dođete.`,
            timeSlots: slots, // Dodaj slotove kao posebno polje za klikabilne dugmiće
          })
        } else {
          return NextResponse.json({
            success: true,
            response: `❌ Nažalost, nema slobodnih termina za ${DAYS_SR[date.getDay()]}, ${formatDateSr(date)}. Izaberite drugi dan.`,
          })
        }
      }
      
      // TREĆE: Ako je samo vreme a NEMAMO zapamćen datum
      if (!dayInfo && timeStr && !state.proposedDate) {
        return NextResponse.json({
          success: true,
          response: `Izabrali ste vreme ${timeStr}. Molimo recite i koji dan želite da dođete (npr. "ponedeljak", "sutra", "petak").`,
        })
      }
    }
    
    // 6. POTVRDA TERMINA
    if (state.proposedDate && state.proposedTime && state.serviceType && !state.confirmed) {
      if (lowerMessage.includes('da') || lowerMessage.includes('odgovara') || lowerMessage.includes('potvrđujem') || lowerMessage.includes('potvrdjujem') || lowerMessage.includes('u redu') || lowerMessage.includes('može') || lowerMessage.includes('moze')) {
        state.confirmed = true
        sessionState.set(sessionId, state)
        
        return NextResponse.json({
          success: true,
          response: 'Vaše ime i prezime i broj telefona?',
        })
      }
      
      if (lowerMessage.includes('ne') || lowerMessage.includes('ne odgovara') || lowerMessage.includes('drugi')) {
        // Resetuj predloženi termin
        state.proposedDate = undefined
        state.proposedTime = undefined
        sessionState.set(sessionId, state)
        
        return NextResponse.json({
          success: true,
          response: 'U redu. Koji drugi dan i vreme želite da zakazete?',
        })
      }
    }
    
    // 7. UNOS IMENA I TELEFONA
    if (state.proposedDate && state.proposedTime && state.serviceType && state.confirmed) {
      const hasPhone = /\d{6,}/.test(message)
      const hasName = message.length > 3 && message.includes(' ')
      
      if (hasPhone && hasName) {
        const phoneMatch = message.match(/\d{6,}/)
        const phone = phoneMatch ? phoneMatch[0] : ''
        const name = message.replace(/\d+/g, '').replace(/[^\wšđčćžŠĐČĆŽ\s]/g, '').trim()
        
        if (name && phone) {
          try {
            // Normalizuj datum na podne da bi se izbegli problemi sa vremenskom zonom
            const appointmentDate = new Date(state.proposedDate)
            appointmentDate.setHours(12, 0, 0, 0)
            
            console.log('🔍 NEW CODE - Date normalized to noon:', appointmentDate.toISOString())
            console.log('📅 Creating appointment:', {
              date: appointmentDate.toISOString(),
              timeSlot: state.proposedTime,
              serviceType: state.serviceType,
              patientName: name,
              patientPhone: phone,
            })
            
            // Prvo kreiraj termin
            const appointment = await createAppointment({
              date: appointmentDate,
              timeSlot: state.proposedTime,
              serviceType: state.serviceType!,
              patientName: name,
              patientPhone: phone,
            })
            
            console.log('✅ Appointment created:', appointment.id)
            
            // Sačuvaj pacijenta u imeniku (samo ako Patient model postoji)
            try {
              if (db.patient) {
                const existingPatient = await db.patient.findFirst({
                  where: { phone: phone },
                })
                
                if (existingPatient) {
                  console.log('📝 Updating existing patient:', existingPatient.id)
                  await db.patient.update({
                    where: { id: existingPatient.id },
                    data: {
                      visitCount: { increment: 1 },
                      lastVisit: appointmentDate,
                    },
                  })
                } else {
                  console.log('➕ Creating new patient:', name, phone)
                  const newPatient = await db.patient.create({
                    data: {
                      name: name,
                      phone: phone,
                      visitCount: 1,
                      lastVisit: appointmentDate,
                    },
                  })
                  console.log('✅ Patient created:', newPatient.id)
                }
              } else {
                console.log('⚠️ Patient model not available, skipping patient save')
              }
            } catch (patientError) {
              console.error('❌ Error saving patient to directory:', patientError)
            }
            
            const serviceName = SERVICE_NAMES[state.serviceType!]
            const duration = SERVICE_DURATIONS[state.serviceType!]
            const endTime = formatTime(parseTime(state.proposedTime) + duration / 60)
            const formattedDate = formatDateSr(new Date(state.proposedDate))
            
            // Očisti stanje
            sessionState.delete(sessionId)
            
            return NextResponse.json({
              success: true,
              response: `✅ **USPEŠNO ZAKAZANO!**\n\n📋 Detalji rezervacije:\n• Usluga: ${serviceName}\n• Datum: ${formattedDate}\n• Vreme: ${state.proposedTime} - ${endTime}\n• Trajanje: ${duration} minuta\n• Pacijent: ${name}\n• Telefon: ${phone}\n\n🦷 Hvala što ste izabrali našu ordinaciju!`,
            })
          } catch (error) {
            return NextResponse.json({
              success: true,
              response: `❌ Greška prilikom zakazivanja: ${error instanceof Error ? error.message : 'Nepoznata greška'}. Molimo pokušajte ponovo sa drugim terminom.`,
            })
          }
        }
      }
      
      return NextResponse.json({
        success: true,
        response: 'Molimo unesite vaše ime i prezime i broj telefona (npr. "Petar Petrović 0612345678").',
      })
    }
    
    // 8. POMOĆ / INFO
    if (lowerMessage.includes('pomoć') || lowerMessage.includes('pomoc') || lowerMessage.includes('info') || lowerMessage.includes('informacije')) {
      return NextResponse.json({
        success: true,
        response: `🦷 **Stomatološka ordinacija "Ortodontic" - Veternik**

📅 **Radno vreme:**
• Stomatolog: Ponedeljak-Četvrtak 14:00-21:00 (Petak do 18:00)
• Ortodont: Samo Petak 18:00-21:30

📋 **Usluge:**
• Stomatolog: Popravka zuba (60 min), Lečenje zuba (60 min)
• Ortodont: Kontrola (15 min), Lepljenje proteze (45 min), Skidanje proteze (45 min)

Da biste zakazali termin, recite da li želite stomatologa ili ortodonta.`,
      })
    }
    
    // 9. DEFAULT - ako ništa ne prepozna
    if (!state.provider) {
      return NextResponse.json({
        success: true,
        response: `🦷 Dobar dan! Ja sam AI asistent stomatološke ordinacije "Ortodontic" iz Veternika.\n\n${getDateInfo()}\nDa li želite da zakažete kod stomatologa ili ortodonta?`,
      })
    }
    
    if (state.provider && !state.serviceType) {
      if (state.provider === 'DENTIST') {
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste stomatologa. Da li želite popravku ili lečenje zuba?',
        })
      } else {
        return NextResponse.json({
          success: true,
          response: 'Izabrali ste ortodonta. Ortodont radi samo petkom od 18:00 do 21:30h. Da li želite kontrolu, lepljenje proteze ili skidanje proteze?',
        })
      }
    }
    
    if (state.serviceType && !state.proposedDate) {
      return NextResponse.json({
        success: true,
        response: `Koji dan i koliko sati želite da zakazete?\n\nPrimer: "petak u 18:30" ili "sutra u 15:00"`,
      })
    }
    
    return NextResponse.json({
      success: true,
      response: `Nisam razumeo "${message}". 

${!state.provider ? 'Da li želite da zakažete kod stomatologa ili ortodonta?' : state.serviceType ? 'Molimo unesite dan i vreme (npr. "ponedeljak u 15:00" ili "sutra u 16:30").' : 'Molimo izaberite uslugu.'}`,
    })
    
  } catch (error) {
    console.error('Chat error:', error)
    return NextResponse.json({
      success: false,
      error: 'Došlo je do greške. Molimo pokušajte ponovo.',
    }, { status: 500 })
  }
}

// Brisanje sesije
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId')
  
  if (sessionId) {
    sessionState.delete(sessionId)
  }
  
  return NextResponse.json({ success: true })
}
// Force recompile
