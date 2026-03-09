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

function parseDayFromMessage(message: string): { dayOfWeek: number; isToday: boolean; isTomorrow: boolean } | null {
  const lower = message.toLowerCase()
  if (lower.includes('danas')) return { dayOfWeek: new Date().getDay(), isToday: true, isTomorrow: false }
  if (lower.includes('sutra')) return { dayOfWeek: (new Date().getDay() + 1) % 7, isToday: false, isTomorrow: true }
  for (const [name, dayNum] of Object.entries(DAY_NAMES_SR)) {
    if (lower.includes(name)) return { dayOfWeek: dayNum, isToday: false, isTomorrow: false }
  }
  return null
}

function parseTimeFromMessage(message: string): string | null {
  const lower = message.toLowerCase()
  const timeMatch = lower.match(/(?:u\s+)?(\d{1,2})(?::(\d{2}))?(?:\s*(?:h|sata|sati))?/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
    }
  }
  return null
}

function getDayDate(dayOfWeek: number, isToday: boolean, isTomorrow: boolean): Date {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  if (isToday) return today
  if (isTomorrow) { const t = new Date(today); t.setDate(t.getDate() + 1); return t }
  const currentDay = today.getDay()
  let daysToAdd = dayOfWeek - currentDay
  if (daysToAdd <= 0) daysToAdd += 7
  const result = new Date(today)
  result.setDate(result.getDate() + daysToAdd)
  return result
}

// ==================== SESSION STATE ====================

interface SessionState {
  provider?: 'DENTIST' | 'ORTHODONTIST'
  serviceType?: ServiceType
  proposedDate?: string
  proposedTime?: string
  confirmed?: boolean
  timestamp?: number
}

function jsonResponse(response: string, state: SessionState, options: { buttons?: { text: string; value: string }[]; timeSlots?: string[] } = {}) {
  return NextResponse.json({ success: true, response, state: { ...state, timestamp: Date.now() }, ...options })
}

function getDateInfo(): string {
  const today = new Date()
  let info = `Danas je ${DAYS_SR[today.getDay()]}, ${formatDateSr(today)}.\n\nSlobodni dani:\n`
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i)
    if (d.getDay() !== 0 && d.getDay() !== 6) info += `• ${DAYS_SR[d.getDay()]} ${formatDateSr(d)}\n`
  }
  return info
}

// ==================== GLAVNA POST FUNKCIJA ====================

export async function POST(request: NextRequest) {
  try {
    const { message, clientState } = await request.json()
    if (!message) return NextResponse.json({ error: 'Poruka je obavezna' }, { status: 400 })
    
    const state: SessionState = clientState || {}
    const lowerMessage = message.toLowerCase().trim()
    
    // Validacija
    if (state.confirmed && (!state.proposedDate || !state.proposedTime)) {
      state.confirmed = undefined; state.proposedDate = undefined; state.proposedTime = undefined
    }
    
    // POZDRAV
    if (lowerMessage.match(/zdravo|pozdrav|ćao|cao|dobar dan|dobro jutro|dobro vece/)) {
      return jsonResponse(`🦷 Dobar dan! Ja sam AI asistent ordinacije "Ortodontic".\n\n${getDateInfo()}\nDa li želite kod stomatologa ili ortodonta?`, state)
    }
    
    // ODABIR DOKTORA
    if (lowerMessage.includes('stomatolog')) {
      state.provider = 'DENTIST'; state.serviceType = undefined; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
      return jsonResponse('Izabrali ste stomatologa. Popravka ili lečenje zuba?', state)
    }
    if (lowerMessage.includes('ortodont')) {
      state.provider = 'ORTHODONTIST'; state.serviceType = undefined; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
      return jsonResponse('Izabrali ste ortodonta (samo petak 18-21:30h). Kontrola, lepljenje ili skidanje proteze?', state)
    }
    
    // USLUGE STOMATOLOG
    if (state.provider === 'DENTIST' && !state.serviceType) {
      if (lowerMessage.includes('popravk')) { state.serviceType = 'REPAIR'; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
        return jsonResponse('Popravka (60 min). Koji dan želite? (Pon-Čet 14-21h, Pet 14-18h)', state) }
      if (lowerMessage.includes('lečenje') || lowerMessage.includes('lecenje')) { state.serviceType = 'TREATMENT'; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
        return jsonResponse('Lečenje (60 min). Koji dan želite?', state) }
    }
    
    // USLUGE ORTODONT
    if (state.provider === 'ORTHODONTIST' && !state.serviceType) {
      if (lowerMessage.includes('kontrol')) { state.serviceType = 'ORTHO_CHECKUP'; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
        return jsonResponse('Kontrola (15 min). Koji petak?', state) }
      if (lowerMessage.includes('lepljenje')) { state.serviceType = 'ORTHO_BONDING'; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
        return jsonResponse('Lepljenje (45 min). Koji petak?', state) }
      if (lowerMessage.includes('skidanje')) { state.serviceType = 'ORTHO_REMOVAL'; state.proposedDate = undefined; state.proposedTime = undefined; state.confirmed = undefined
        return jsonResponse('Skidanje (45 min). Koji petak?', state) }
    }
    
    // DATUM I VREME
    if (state.serviceType) {
      const dayInfo = parseDayFromMessage(message)
      const timeStr = parseTimeFromMessage(message)
      
      // Vreme sa datumom
      if (!dayInfo && timeStr && state.proposedDate) {
        const date = new Date(state.proposedDate)
        if (state.provider === 'DENTIST' && date.getDay() === 5 && parseInt(timeStr.split(':')[0]) >= 18) {
          return jsonResponse('Petkom posle 18h radi ortodont. Izaberite ranije vreme.', state)
        }
        const result = await isSlotAvailable(date, timeStr, state.serviceType)
        if (result.available) {
          state.proposedTime = timeStr
          return jsonResponse(`✅ ${DAYS_SR[date.getDay()]}, ${formatDateSr(date)} u ${timeStr}. Odgovara?`, state, { buttons: [{ text: '✅ Da', value: 'Da' }, { text: '❌ Ne', value: 'Ne' }] })
        }
        const next = await findNextAvailableSlot(date, state.serviceType, timeStr)
        if (next) { state.proposedDate = next.dateISO; state.proposedTime = next.timeSlot
          return jsonResponse(`Zauzeto. Prvi slobodan: ${next.dayName} u ${next.timeSlot}. Odgovara?`, state, { buttons: [{ text: '✅ Da', value: 'Da' }, { text: '❌ Ne', value: 'Ne' }] }) }
        return jsonResponse('Nema slobodnih termina.', state)
      }
      
      // Dan i vreme zajedno
      if (dayInfo && timeStr) {
        const date = getDayDate(dayInfo.dayOfWeek, dayInfo.isToday, dayInfo.isTomorrow)
        if (state.provider === 'ORTHODONTIST' && date.getDay() !== 5) return jsonResponse('Ortodont radi samo petkom.', state)
        if (state.provider === 'DENTIST' && date.getDay() === 5 && parseInt(timeStr.split(':')[0]) >= 18) return jsonResponse('Petkom posle 18h radi ortodont.', state)
        const result = await isSlotAvailable(date, timeStr, state.serviceType)
        if (result.available) {
          state.proposedDate = date.toISOString().split('T')[0]; state.proposedTime = timeStr
          return jsonResponse(`✅ ${DAYS_SR[date.getDay()]} u ${timeStr}. Odgovara?`, state, { buttons: [{ text: '✅ Da', value: 'Da' }, { text: '❌ Ne', value: 'Ne' }] })
        }
        const next = await findNextAvailableSlot(date, state.serviceType, timeStr)
        if (next) { state.proposedDate = next.dateISO; state.proposedTime = next.timeSlot
          return jsonResponse(`Zauzeto. Prvi slobodan: ${next.dayName} u ${next.timeSlot}?`, state, { buttons: [{ text: '✅ Da', value: 'Da' }, { text: '❌ Ne', value: 'Ne' }] }) }
        return jsonResponse('Nema termina.', state)
      }
      
      // Samo dan
      if (dayInfo && !timeStr) {
        const date = getDayDate(dayInfo.dayOfWeek, dayInfo.isToday, dayInfo.isTomorrow)
        if (state.provider === 'ORTHODONTIST' && date.getDay() !== 5) return jsonResponse('Ortodont radi samo petkom.', state)
        const { slots } = await getAvailableSlots(date, state.serviceType)
        if (slots.length > 0) {
          state.proposedDate = date.toISOString().split('T')[0]
          return jsonResponse(`📅 ${DAYS_SR[date.getDay()]}, ${formatDateSr(date)}\n\nSlobodno:\n${slots.slice(0,8).join(', ')}\n\nIzaberite vreme.`, state, { timeSlots: slots.slice(0, 10) })
        }
        return jsonResponse(`Nema termina za ${DAYS_SR[date.getDay()]}.`, state)
      }
      
      // Samo vreme bez datuma
      if (!dayInfo && timeStr && !state.proposedDate) return jsonResponse(`Vreme ${timeStr}. Koji dan?`, state)
    }
    
    // POTVRDA
    if (state.proposedDate && state.proposedTime && state.serviceType && !state.confirmed) {
      if (lowerMessage.includes('da') || lowerMessage.includes('odgovara') || lowerMessage.includes('može')) {
        state.confirmed = true
        return jsonResponse('Ime i broj telefona?', state)
      }
      if (lowerMessage.includes('ne')) {
        state.proposedDate = undefined; state.proposedTime = undefined
        return jsonResponse('Drugi dan i vreme?', state)
      }
    }
    
    // IME I TELEFON
    if (state.proposedDate && state.proposedTime && state.serviceType && state.confirmed) {
      const digits = message.match(/\d/g); const phone = digits ? digits.join('') : ''
      const name = message.replace(/\d+/g, '').replace(/[^a-zA-ZšđčćžŠĐČĆŽ\s]/g, '').trim()
      if (name.length >= 2 && phone.length >= 6) {
        try {
          const aptDate = new Date(state.proposedDate); aptDate.setHours(12, 0, 0, 0)
          await createAppointment({ date: aptDate, timeSlot: state.proposedTime, serviceType: state.serviceType, patientName: name, patientPhone: phone })
          try {
            const existing = await db.patient.findFirst({ where: { phone } })
            if (existing) await db.patient.update({ where: { id: existing.id }, data: { visitCount: { increment: 1 }, lastVisit: aptDate } })
            else await db.patient.create({ data: { name, phone, visitCount: 1, lastVisit: aptDate } })
          } catch {}
          return jsonResponse(`✅ ZAKAZANO!\n\n📅 ${formatDateSr(new Date(state.proposedDate))}\n🕐 ${state.proposedTime}\n👤 ${name}\n📞 ${phone}\n\nHvala!`, {})
        } catch (e) { return jsonResponse(`Greška: ${e}`, state) }
      }
      return jsonResponse('Ime i telefon? (npr. "Petar 0612345678")', state)
    }
    
    // FALLBACK
    if (!state.provider) return jsonResponse(`🦷 Dobar dan! Ordinacija "Ortodontic".\n\n${getDateInfo()}\nStomatolog ili ortodont?`, state)
    if (state.provider && !state.serviceType) return jsonResponse(state.provider === 'DENTIST' ? 'Popravka ili lečenje?' : 'Kontrola, lepljenje ili skidanje?', state)
    return jsonResponse('Koji dan?', state)
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Greška' }, { status: 500 })
  }
}
