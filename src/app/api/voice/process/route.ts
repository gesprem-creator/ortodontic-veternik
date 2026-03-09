import { NextRequest, NextResponse } from 'next/server'
import { ServiceType } from '@prisma/client'
import {
  createAppointment,
  isSlotAvailable,
  findNextAvailableSlot,
  getAvailableSlots,
  SERVICE_NAMES,
  SERVICE_DURATIONS,
  formatTime,
  parseTime,
  formatDateSr,
} from '@/lib/appointments'
import { db } from '@/lib/db'

// Session storage for phone calls (in production use Redis)
const phoneSessions = new Map<string, PhoneSession>()

interface PhoneSession {
  provider?: 'DENTIST' | 'ORTHODONTIST'
  serviceType?: ServiceType
  proposedDate?: string
  proposedTime?: string
  confirmed?: boolean
  step: number
}

const DAYS_SR = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota']

const DAY_NAMES_SR: Record<string, number> = {
  'ponedeljak': 1, 'ponedjeljak': 1, 'pon': 1,
  'utorak': 2, 'uto': 2, 'utor': 2,
  'sreda': 3, 'srijeda': 3, 'sre': 3,
  'četvrtak': 4, 'cetvrtak': 4, 'čet': 4, 'cet': 4,
  'petak': 5, 'pet': 5,
  'subota': 6, 'sub': 6,
  'nedelja': 0, 'nedjelja': 0, 'ned': 0,
}

function parseDayFromSpeech(speech: string): { dayOfWeek: number; isToday: boolean; isTomorrow: boolean } | null {
  const lower = speech.toLowerCase()
  
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

function parseTimeFromSpeech(speech: string): string | null {
  const trimmed = speech.trim()
  
  // Format: "15:00" ili "15:30"
  const exactTimeMatch = trimmed.match(/(\d{1,2}):(\d{2})/)
  if (exactTimeMatch) {
    const hours = parseInt(exactTimeMatch[1])
    const minutes = parseInt(exactTimeMatch[2])
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }
  }
  
  // Format: "15 sati", "petnaest sati"
  const hourWords: Record<string, number> = {
    'jedanaest': 11, 'dvanaest': 12, 'trinaest': 13, 'četrnaest': 14, 'cetrnaest': 14,
    'petnaest': 15, 'šesnaest': 16, 'sesnaest': 16, 'sedamnaest': 17, 'osamnaest': 18,
    'devetnaest': 19, 'dvadeset': 20, 'dvadeset jedan': 21,
    'jedan': 1, 'dva': 2, 'tri': 3, 'četiri': 4, 'cetiri': 4, 'pet': 5, 'šest': 6, 'sest': 6,
    'sedam': 7, 'osam': 8, 'devet': 9, 'deset': 10,
  }
  
  for (const [word, hour] of Object.entries(hourWords)) {
    if (trimmed.toLowerCase().includes(word)) {
      return `${hour.toString().padStart(2, '0')}:00`
    }
  }
  
  // Format with number: "u 15", "15"
  const numberMatch = trimmed.match(/(\d{1,2})(?:\s|$)/)
  if (numberMatch) {
    const hour = parseInt(numberMatch[1])
    if (hour >= 8 && hour <= 21) {
      return `${hour.toString().padStart(2, '0')}:00`
    }
  }
  
  return null
}

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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function createTwimlResponse(message: string, nextAction?: string, gatherForInput: boolean = true): string {
  const encodedMessage = encodeURIComponent(message)
  
  if (!gatherForInput) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>/api/voice/audio?text=${encodedMessage}</Play>
</Response>`
  }
  
  if (nextAction) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${nextAction}" method="POST" timeout="5" speechTimeout="auto" language="sr-RS">
    <Play>/api/voice/audio?text=${encodedMessage}</Play>
  </Gather>
  <Play>/api/voice/audio?text=${encodeURIComponent('Nisam čuo vaš odgovor. Molim vas pokušajte ponovo.')}</Play>
  <Redirect>/api/voice/incoming</Redirect>
</Response>`
  }
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/api/voice/process" method="POST" timeout="5" speechTimeout="auto" language="sr-RS">
    <Play>/api/voice/audio?text=${encodedMessage}</Play>
  </Gather>
  <Play>/api/voice/audio?text=${encodeURIComponent('Nisam čuo vaš odgovor. Molim vas pokušajte ponovo.')}</Play>
  <Redirect>/api/voice/incoming</Redirect>
</Response>`
}

// Main Twilio webhook for processing speech
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const speechResult = formData.get('SpeechResult') as string || ''
    const callSid = formData.get('CallSid') as string || 'default'
    
    console.log('📞 Speech received:', speechResult)
    console.log('📞 CallSid:', callSid)
    
    // Get or create session
    let session = phoneSessions.get(callSid) || { step: 1 }
    const lowerSpeech = speechResult.toLowerCase()
    
    console.log('📊 Current session:', session)
    
    // STEP 1: Choose provider (stomatolog/ortodont)
    if (session.step === 1 || !session.provider) {
      if (lowerSpeech.includes('stomatolog')) {
        session.provider = 'DENTIST'
        session.step = 2
        phoneSessions.set(callSid, session)
        return new NextResponse(
          createTwimlResponse('Izabrali ste stomatologa. Da li želite popravku ili lečenje zuba?'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
      
      if (lowerSpeech.includes('ortodont')) {
        session.provider = 'ORTHODONTIST'
        session.step = 2
        phoneSessions.set(callSid, session)
        return new NextResponse(
          createTwimlResponse('Izabrali ste ortodonta. Ortodont radi samo petkom od 18 do 21 i 30. Da li želite kontrolu, lepljenje proteze ili skidanje proteze?'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
      
      return new NextResponse(
        createTwimlResponse('Molim vas recite da li želite stomatologa ili ortodonta.'),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      )
    }
    
    // STEP 2: Choose service type
    if (session.step === 2 || (session.provider && !session.serviceType)) {
      if (session.provider === 'DENTIST') {
        if (lowerSpeech.includes('popravk')) {
          session.serviceType = 'REPAIR'
          session.step = 3
          phoneSessions.set(callSid, session)
          return new NextResponse(
            createTwimlResponse('Izabrali ste popravku zuba. Koji dan želite da dođete?'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        if (lowerSpeech.includes('lečenje') || lowerSpeech.includes('lecenje')) {
          session.serviceType = 'TREATMENT'
          session.step = 3
          phoneSessions.set(callSid, session)
          return new NextResponse(
            createTwimlResponse('Izabrali ste lečenje zuba. Koji dan želite da dođete?'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        return new NextResponse(
          createTwimlResponse('Molim vas recite da li želite popravku ili lečenje zuba.'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
      
      if (session.provider === 'ORTHODONTIST') {
        if (lowerSpeech.includes('kontrol')) {
          session.serviceType = 'ORTHO_CHECKUP'
          session.step = 3
          phoneSessions.set(callSid, session)
          return new NextResponse(
            createTwimlResponse('Izabrali ste kontrolu. Koji petak želite da dođete?'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        if (lowerSpeech.includes('lepljenje')) {
          session.serviceType = 'ORTHO_BONDING'
          session.step = 3
          phoneSessions.set(callSid, session)
          return new NextResponse(
            createTwimlResponse('Izabrali ste lepljenje proteze. Koji petak želite da dođete?'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        if (lowerSpeech.includes('skidanje')) {
          session.serviceType = 'ORTHO_REMOVAL'
          session.step = 3
          phoneSessions.set(callSid, session)
          return new NextResponse(
            createTwimlResponse('Izabrali ste skidanje proteze. Koji petak želite da dođete?'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        return new NextResponse(
          createTwimlResponse('Molim vas recite da li želite kontrolu, lepljenje proteze ili skidanje proteze.'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
    }
    
    // STEP 3: Choose day
    if (session.step === 3 || (session.serviceType && !session.proposedDate)) {
      const dayInfo = parseDayFromSpeech(speechResult)
      
      if (dayInfo) {
        const date = getDayDate(dayInfo.dayOfWeek, dayInfo.isToday, dayInfo.isTomorrow)
        
        // Check if orthodontist - must be Friday
        if (session.provider === 'ORTHODONTIST' && date.getDay() !== 5) {
          return new NextResponse(
            createTwimlResponse('Ortodont radi samo petkom. Molim vas recite koji petak želite da dođete.'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
        
        // Get available slots
        const { slots } = await getAvailableSlots(date, session.serviceType!)
        
        if (slots.length > 0) {
          session.proposedDate = date.toISOString().split('T')[0]
          session.step = 4
          phoneSessions.set(callSid, session)
          
          // Speak available times
          const timesStr = slots.slice(0, 5).join(', ')
          return new NextResponse(
            createTwimlResponse(`Za ${DAYS_SR[date.getDay()]} slobodni termini su: ${timesStr}. Recite koje vreme želite.`),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        } else {
          return new NextResponse(
            createTwimlResponse(`Nažalost, za ${DAYS_SR[date.getDay()]} nema slobodnih termina. Molim vas izaberite drugi dan.`),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
      }
      
      return new NextResponse(
        createTwimlResponse('Molim vas recite koji dan želite da dođete, na primer ponedeljak, utorak, ili sutra.'),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      )
    }
    
    // STEP 4: Choose time
    if (session.step === 4 || (session.proposedDate && !session.proposedTime)) {
      const timeStr = parseTimeFromSpeech(speechResult)
      
      if (timeStr) {
        const date = new Date(session.proposedDate!)
        const result = await isSlotAvailable(date, timeStr, session.serviceType!)
        
        if (result.available) {
          session.proposedTime = timeStr
          session.step = 5
          phoneSessions.set(callSid, session)
          
          const serviceName = SERVICE_NAMES[session.serviceType!]
          const duration = SERVICE_DURATIONS[session.serviceType!]
          const endTime = formatTime(parseTime(timeStr) + duration / 60)
          
          return new NextResponse(
            createTwimlResponse(`Termin u ${timeStr} je slobodan. ${serviceName}, ${DAYS_SR[date.getDay()]}, od ${timeStr} do ${endTime}. Da li vam odgovara? Recite da ili ne.`),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        } else {
          // Find next available
          const nextSlot = await findNextAvailableSlot(date, session.serviceType!, timeStr)
          if (nextSlot) {
            session.proposedDate = nextSlot.dateISO
            session.proposedTime = nextSlot.timeSlot
            phoneSessions.set(callSid, session)
            
            return new NextResponse(
              createTwimlResponse(`Termin u ${timeStr} je zauzet. Prvi slobodni termin je ${nextSlot.dayName} u ${nextSlot.timeSlot}. Da li vam odgovara? Recite da ili ne.`),
              { status: 200, headers: { 'Content-Type': 'text/xml' } }
            )
          }
          
          return new NextResponse(
            createTwimlResponse('Nažalost, nema slobodnih termina u bliskoj budućnosti. Molim vas pokušajte kasnije.'),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
      }
      
      return new NextResponse(
        createTwimlResponse('Molim vas recite koje vreme želite, na primer 15 sati ili 15 i 30.'),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      )
    }
    
    // STEP 5: Confirm
    if (session.step === 5 || (session.proposedTime && !session.confirmed)) {
      if (lowerSpeech.includes('da') || lowerSpeech.includes('odgovara') || lowerSpeech.includes('može') || lowerSpeech.includes('moze')) {
        session.confirmed = true
        session.step = 6
        phoneSessions.set(callSid, session)
        
        return new NextResponse(
          createTwimlResponse('Vaše ime i broj telefona?'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
      
      if (lowerSpeech.includes('ne')) {
        session.proposedDate = undefined
        session.proposedTime = undefined
        session.step = 3
        phoneSessions.set(callSid, session)
        
        return new NextResponse(
          createTwimlResponse('U redu. Koji drugi dan želite da zakazete?'),
          { status: 200, headers: { 'Content-Type': 'text/xml' } }
        )
      }
      
      return new NextResponse(
        createTwimlResponse('Da li vam odgovara ovaj termin? Recite da ili ne.'),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      )
    }
    
    // STEP 6: Get name and phone
    if (session.step === 6 || session.confirmed) {
      // Extract phone number
      const digits = speechResult.match(/\d/g)
      const phone = digits ? digits.join('') : ''
      
      // Extract name
      const name = speechResult
        .replace(/\d+/g, '')
        .replace(/[^a-zA-ZšđčćžŠĐČĆŽ\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      
      if (name.length >= 2 && phone.length >= 6) {
        try {
          // Create appointment
          const appointmentDate = new Date(session.proposedDate!)
          appointmentDate.setHours(12, 0, 0, 0)
          
          const appointment = await createAppointment({
            date: appointmentDate,
            timeSlot: session.proposedTime!,
            serviceType: session.serviceType!,
            patientName: name,
            patientPhone: phone,
          })
          
          // Save patient to directory
          try {
            const existingPatient = await db.patient.findFirst({
              where: { phone: phone },
            })
            
            if (existingPatient) {
              await db.patient.update({
                where: { id: existingPatient.id },
                data: {
                  visitCount: { increment: 1 },
                  lastVisit: appointmentDate,
                },
              })
            } else {
              await db.patient.create({
                data: {
                  name: name,
                  phone: phone,
                  visitCount: 1,
                  lastVisit: appointmentDate,
                },
              })
            }
          } catch (e) {
            console.log('Could not save patient to directory')
          }
          
          // Clear session
          phoneSessions.delete(callSid)
          
          const serviceName = SERVICE_NAMES[session.serviceType!]
          const duration = SERVICE_DURATIONS[session.serviceType!]
          const endTime = formatTime(parseTime(session.proposedTime!) + duration / 60)
          const formattedDate = formatDateSr(new Date(session.proposedDate!))
          
          return new NextResponse(
            createTwimlResponse(`Uspešno ste zakazali! ${serviceName}, ${formattedDate} u ${session.proposedTime}. Hvala na pozivu, do viđenja!`, undefined, false),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        } catch (error) {
          console.error('Error creating appointment:', error)
          return new NextResponse(
            createTwimlResponse('Došlo je do greške prilikom zakazivanja. Molim vas pokušajte ponovo kasnije.', undefined, false),
            { status: 200, headers: { 'Content-Type': 'text/xml' } }
          )
        }
      }
      
      return new NextResponse(
        createTwimlResponse('Molim vas recite vaše ime i broj telefona.'),
        { status: 200, headers: { 'Content-Type': 'text/xml' } }
      )
    }
    
    // Fallback
    return new NextResponse(
      createTwimlResponse('Molim vas pokušajte ponovo.'),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
    
  } catch (error) {
    console.error('Voice process error:', error)
    return new NextResponse(
      createTwimlResponse('Došlo je do greške. Molim vas pokušajte ponovo.', undefined, false),
      { status: 200, headers: { 'Content-Type': 'text/xml' } }
    )
  }
}
