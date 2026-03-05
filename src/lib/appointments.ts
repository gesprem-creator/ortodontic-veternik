import { db } from '@/lib/db'
import { ServiceType, ProviderType, AppointmentStatus } from '@prisma/client'

// ==================== KONFIGURACIJA ====================

// Radno vreme
export const WORKING_HOURS = {
  // Ponedeljak - Četvrtak: Stomatolog 14:00 - 20:00
  DENTIST_WEEKDAYS: { start: 14, end: 20 },
  // Petak: Ortodont 18:00 - 21:30
  ORTHODONTIST_FRIDAY: { start: 18, end: 21.5 }, // 21:30 = 21.5
  // Petak: Stomatolog 14:00 - 18:00 (pre ortodonta)
  DENTIST_FRIDAY: { start: 14, end: 18 },
} as const

// Trajanje usluga u minutama
export const SERVICE_DURATIONS: Record<ServiceType, number> = {
  REPAIR: 30,        // Popravka - stomatolog
  TREATMENT: 60,     // Lečenje - stomatolog
  ORTHO_CHECKUP: 15, // Ortodontska kontrola
  ORTHO_BONDING: 45, // Lepljenje fiksne
  ORTHO_REMOVAL: 45, // Skidanje fiksne
}

// Koja usluga pripada kom pruziocu
export const SERVICE_PROVIDERS: Record<ServiceType, ProviderType> = {
  REPAIR: 'DENTIST',
  TREATMENT: 'DENTIST',
  ORTHO_CHECKUP: 'ORTHODONTIST',
  ORTHO_BONDING: 'ORTHODONTIST',
  ORTHO_REMOVAL: 'ORTHODONTIST',
}

// Nazivi usluga na srpskom
export const SERVICE_NAMES: Record<ServiceType, string> = {
  REPAIR: 'Popravka zuba',
  TREATMENT: 'Lečenje zuba',
  ORTHO_CHECKUP: 'Ortodontska kontrola',
  ORTHO_BONDING: 'Lepljenje fiksne proteze',
  ORTHO_REMOVAL: 'Skidanje fiksne proteze',
}

// ==================== POMOĆNE FUNKCIJE ====================

// Formatiranje datuma u srpskom formatu (npr. "15.01.2025")
export function formatDateSr(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

// Dan u nedelji (0 = Nedelja, 1 = Ponedeljak, ..., 5 = Petak, 6 = Subota)
export function getDayOfWeek(date: Date): number {
  return date.getDay()
}

// Da li je radni dan (Ponedeljak - Petak)
export function isWorkingDay(date: Date): boolean {
  const day = getDayOfWeek(date)
  return day >= 1 && day <= 5 // 1-5 = Ponedeljak-Petak
}

// Da li je petak
export function isFriday(date: Date): boolean {
  return getDayOfWeek(date) === 5
}

// Formatiranje vremena (npr. "14:00")
export function formatTime(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

// Parsiranje vremena (npr. "14:30" -> 14.5)
export function parseTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours + minutes / 60
}

// Generisanje slotova za dati vremenski opseg
export function generateTimeSlots(startHour: number, endHour: number, intervalMinutes: number): string[] {
  const slots: string[] = []
  let current = startHour

  while (current < endHour) {
    slots.push(formatTime(current))
    current += intervalMinutes / 60
  }

  return slots
}

// ==================== GLAVNA LOGIKA ZA SLOBODNE TERMINE ====================

interface AvailableSlot {
  time: string
  endTime: string
  available: boolean
}

interface DaySchedule {
  date: Date
  dayName: string
  dentistSlots: AvailableSlot[]
  orthodontistSlots: AvailableSlot[]
}

// Dohvatanje svih termina za dati dan
async function getAppointmentsForDate(date: Date): Promise<{
  timeSlot: string
  duration: number
  providerType: ProviderType
}[]> {
  const startOfDay = new Date(date)
  startOfDay.setHours(0, 0, 0, 0)

  const endOfDay = new Date(date)
  endOfDay.setHours(23, 59, 59, 999)

  const appointments = await db.appointment.findMany({
    where: {
      date: {
        gte: startOfDay,
        lte: endOfDay,
      },
      status: AppointmentStatus.SCHEDULED,
    },
    select: {
      timeSlot: true,
      duration: true,
      providerType: true,
    },
  })

  return appointments
}

// Provera da li je slot zauzet
function isSlotBooked(
  slotTime: number,
  duration: number,
  appointments: { timeSlot: string; duration: number; providerType: ProviderType }[],
  providerType: ProviderType
): boolean {
  const slotEndTime = slotTime + duration / 60

  for (const apt of appointments) {
    if (apt.providerType !== providerType) continue

    const aptStart = parseTime(apt.timeSlot)
    const aptEnd = aptStart + apt.duration / 60

    // Provera preklapanja
    if (slotTime < aptEnd && slotEndTime > aptStart) {
      return true
    }
  }

  return false
}

// Generisanje slobodnih termina za stomatologa
export async function getDentistAvailableSlots(date: Date, serviceType: ServiceType): Promise<string[]> {
  if (!isWorkingDay(date)) return []

  const duration = SERVICE_DURATIONS[serviceType]
  const appointments = await getAppointmentsForDate(date)

  // Odredi radno vreme
  let startHour: number
  let endHour: number

  if (isFriday(date)) {
    // Petak: stomatolog radi samo do 18:00 (pre ortodonta)
    startHour = WORKING_HOURS.DENTIST_FRIDAY.start
    endHour = WORKING_HOURS.DENTIST_FRIDAY.end
  } else {
    // Ponedeljak-Četvrtak: stomatolog 14:00-20:00
    startHour = WORKING_HOURS.DENTIST_WEEKDAYS.start
    endHour = WORKING_HOURS.DENTIST_WEEKDAYS.end
  }

  // Generiši slotove na 15 minuta (za fleksibilnost)
  const allSlots = generateTimeSlots(startHour, endHour, 15)
  const availableSlots: string[] = []

  for (const slot of allSlots) {
    const slotTime = parseTime(slot)
    const slotEndTime = slotTime + duration / 60

    // Proveri da li termin izlazi iz radnog vremena
    if (slotEndTime > endHour) continue

    // Proveri da li je slot zauzet
    if (!isSlotBooked(slotTime, duration, appointments, 'DENTIST')) {
      availableSlots.push(slot)
    }
  }

  // Primeni pravilo za poslednji termin
  // Ako je 19:00 slobodan, ne nudi 19:30 i 20:00
  // Ako je 19:00 zauzet, može da se ponudi kasnije
  const lastHour = endHour - 1 // 19:00 sati

  // Pronađi sve slotove pre 19:00
  const beforeLastHour = availableSlots.filter(s => parseTime(s) < lastHour)
  const afterLastHour = availableSlots.filter(s => parseTime(s) >= lastHour)

  // Proveri da li ima slobodnih termina u 19:00 ili kasnije
  if (afterLastHour.length > 0) {
    // Proveri da li je 19:00 zauzet
    const hasSlotAt19 = availableSlots.some(s => {
      const t = parseTime(s)
      return t >= 19 && t < 20
    })

    if (hasSlotAt19) {
      // Ako postoji slobodan termin u 19. satu, prikaži sve
      return [...beforeLastHour, ...afterLastHour]
    } else {
      // Ako je 19:00 zauzet, ponudi i kasnije termine
      return [...beforeLastHour, ...afterLastHour]
    }
  }

  return availableSlots
}

// Generisanje slobodnih termina za ortodonta (samo petak)
export async function getOrthodontistAvailableSlots(date: Date, serviceType: ServiceType): Promise<string[]> {
  // Ortodont radi samo petkom
  if (!isFriday(date)) return []

  const duration = SERVICE_DURATIONS[serviceType]
  const appointments = await getAppointmentsForDate(date)

  const startHour = WORKING_HOURS.ORTHODONTIST_FRIDAY.start
  let endHour = WORKING_HOURS.ORTHODONTIST_FRIDAY.end // 21:15

  // Za lepljenje/skidanje ne zakazujemo posle 20:30
  if (serviceType === 'ORTHO_BONDING' || serviceType === 'ORTHO_REMOVAL') {
    endHour = 20.5 // 20:30
  }

  // Generiši slotove na 15 minuta
  const allSlots = generateTimeSlots(startHour, endHour, 15)
  const availableSlots: string[] = []

  for (const slot of allSlots) {
    const slotTime = parseTime(slot)
    const slotEndTime = slotTime + duration / 60

    // Proveri da li termin izlazi iz dozvoljenog vremena
    if (serviceType === 'ORTHO_BONDING' || serviceType === 'ORTHO_REMOVAL') {
      // Završetak mora biti najkasnije 21:30
      if (slotEndTime > 21.5) continue
    } else {
      // Za kontrole, završetak do 21:30
      if (slotEndTime > 21.5) continue
    }

    // Proveri da li je slot zauzet
    if (!isSlotBooked(slotTime, duration, appointments, 'ORTHODONTIST')) {
      availableSlots.push(slot)
    }
  }

  // Primeni slično pravilo za poslednji termin kao kod stomatologa
  const lastHour = endHour - 1

  const beforeLastHour = availableSlots.filter(s => parseTime(s) < lastHour)
  const afterLastHour = availableSlots.filter(s => parseTime(s) >= lastHour)

  if (afterLastHour.length > 0) {
    const hasSlotInLastHour = afterLastHour.some(s => {
      const t = parseTime(s)
      return t >= lastHour
    })

    if (hasSlotInLastHour) {
      return [...beforeLastHour, ...afterLastHour]
    } else {
      return [...beforeLastHour, ...afterLastHour]
    }
  }

  return availableSlots
}

// Glavna funkcija za dobijanje slobodnih termina
export async function getAvailableSlots(
  date: Date,
  serviceType: ServiceType
): Promise<{ slots: string[]; providerType: ProviderType }> {
  const providerType = SERVICE_PROVIDERS[serviceType]

  if (providerType === 'DENTIST') {
    const slots = await getDentistAvailableSlots(date, serviceType)
    return { slots, providerType: 'DENTIST' }
  } else {
    const slots = await getOrthodontistAvailableSlots(date, serviceType)
    return { slots, providerType: 'ORTHODONTIST' }
  }
}

// ==================== KREIRANJE TERMINA ====================

interface CreateAppointmentData {
  date: Date
  timeSlot: string
  serviceType: ServiceType
  patientName: string
  patientPhone: string
  patientEmail?: string
  notes?: string
}

export async function createAppointment(data: CreateAppointmentData) {
  const duration = SERVICE_DURATIONS[data.serviceType]
  const providerType = SERVICE_PROVIDERS[data.serviceType]

  // Proveri dostupnost
  const { slots } = await getAvailableSlots(data.date, data.serviceType)
  if (!slots.includes(data.timeSlot)) {
    throw new Error('Termin nije dostupan')
  }

  const appointment = await db.appointment.create({
    data: {
      date: data.date,
      timeSlot: data.timeSlot,
      duration,
      serviceType: data.serviceType,
      providerType,
      patientName: data.patientName,
      patientPhone: data.patientPhone,
      patientEmail: data.patientEmail,
      notes: data.notes,
    },
  })

  return appointment
}

// ==================== DOHVATANJE TERMINA ZA ADMIN ====================

export async function getAppointmentsForWeek(startDate: Date) {
  const appointments: Array<{
    date: Date
    dateStr: string
    dayName: string
    dayOfWeek: number
    appointments: Array<{
      id: string
      date: Date
      timeSlot: string
      duration: number
      serviceType: string
      providerType: string
      status: string
      patientName: string
      patientPhone: string
    }>
  }> = []
  
  const days = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota']
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    date.setHours(12, 0, 0, 0) // Podne da bi se izbegli problemi sa vremenskom zonom
    
    const dayStart = new Date(date)
    dayStart.setHours(0, 0, 0, 0)
    
    const dayEnd = new Date(date)
    dayEnd.setHours(23, 59, 59, 999)
    
    const dayOfWeek = date.getDay()
    const dayName = days[dayOfWeek]
    
    const dayAppointments = await db.appointment.findMany({
      where: {
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
        status: { not: 'CANCELLED' }, // Ne prikazuj otkazane
      },
      orderBy: {
        timeSlot: 'asc',
      },
      select: {
        id: true,
        date: true,
        timeSlot: true,
        duration: true,
        serviceType: true,
        providerType: true,
        status: true,
        patientName: true,
        patientPhone: true,
      }
    })
    
    appointments.push({
      date,
      dateStr: formatDateSr(date),
      dayName,
      dayOfWeek,
      appointments: dayAppointments,
    })
  }
  
  return appointments
}

function getDayName(date: Date): string {
  const days = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota']
  return days[date.getDay()]
}

// ==================== OTKAZIVANJE TERMINA ====================

export async function cancelAppointment(appointmentId: string) {
  return db.appointment.update({
    where: { id: appointmentId },
    data: { status: AppointmentStatus.CANCELLED },
  })
}

// ==================== DOHVATANJE TERMINA PO ID ====================

export async function getAppointmentById(id: string) {
  return db.appointment.findUnique({
    where: { id },
  })
}

// ==================== AŽURIRANJE TERMINA ====================

export async function updateAppointment(
  id: string,
  data: Partial<{
    date: Date
    timeSlot: string
    serviceType: ServiceType
    patientName: string
    patientPhone: string
    patientEmail: string
    notes: string
    status: AppointmentStatus
  }>
) {
  let updateData: any = { ...data }

  if (data.serviceType) {
    updateData.duration = SERVICE_DURATIONS[data.serviceType]
    updateData.providerType = SERVICE_PROVIDERS[data.serviceType]
  }

  return db.appointment.update({
    where: { id },
    data: updateData,
  })
}

// ==================== BRISANJE TERMINA ====================

export async function deleteAppointment(id: string) {
  return db.appointment.delete({
    where: { id },
  })
}

// ==================== PROVERA SPECIFIČNOG TERMINA ====================

// Proverava da li je određeni termin slobodan
export async function isSlotAvailable(
  date: Date,
  timeSlot: string,
  serviceType: ServiceType
): Promise<{ available: boolean; reason?: string }> {
  // Provera da li je radni dan
  if (!isWorkingDay(date)) {
    return { available: false, reason: 'Izabrani datum nije radni dan (ponedeljak-petak)' }
  }

  // Provera za ortodonta
  if (['ORTHO_CHECKUP', 'ORTHO_BONDING', 'ORTHO_REMOVAL'].includes(serviceType)) {
    if (!isFriday(date)) {
      return { available: false, reason: 'Ortodont radi samo petkom od 18:00 do 21:30h' }
    }
  }

  const { slots } = await getAvailableSlots(date, serviceType)
  
  if (slots.includes(timeSlot)) {
    return { available: true }
  }
  
  return { available: false, reason: 'Termin je zauzet' }
}

// ==================== PRONALAŽENJE SLEDEĆEG SLOBODNOG TERMINA ====================

export interface NextAvailableSlot {
  date: Date
  dateStr: string
  dateISO: string
  timeSlot: string
  dayName: string
}

// Pronalazi sledeći slobodni termin počevši od datog datuma/vremena
export async function findNextAvailableSlot(
  startDate: Date,
  serviceType: ServiceType,
  preferredTime?: string
): Promise<NextAvailableSlot | null> {
  const days = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota']
  
  // Pretraži sledećih 14 dana
  for (let i = 0; i < 14; i++) {
    const checkDate = new Date(startDate)
    checkDate.setDate(checkDate.getDate() + i)
    checkDate.setHours(0, 0, 0, 0)
    
    // Preskoči vikend
    if (!isWorkingDay(checkDate)) continue
    
    // Za ortodonta proveri samo petak
    if (['ORTHO_CHECKUP', 'ORTHO_BONDING', 'ORTHO_REMOVAL'].includes(serviceType)) {
      if (!isFriday(checkDate)) continue
    }
    
    const { slots } = await getAvailableSlots(checkDate, serviceType)
    
    if (slots.length > 0) {
      // Ako je i==0 (isti dan) i korisnik ima preferirano vreme, pokušaj da nađeš posle tog vremena
      let selectedSlot = slots[0]
      
      if (i === 0 && preferredTime) {
        const prefTimeNum = parseTime(preferredTime)
        const laterSlots = slots.filter(s => parseTime(s) >= prefTimeNum)
        if (laterSlots.length > 0) {
          selectedSlot = laterSlots[0]
        }
      }
      
      return {
        date: checkDate,
        dateStr: formatDateSr(checkDate),
        dateISO: checkDate.toISOString().split('T')[0],
        timeSlot: selectedSlot,
        dayName: days[checkDate.getDay()]
      }
    }
  }
  
  return null
}

// Pronalazi sve slobodne dane u narednih 14 dana
export async function findAvailableDays(
  serviceType: ServiceType
): Promise<Array<{ date: Date; dateStr: string; dayName: string; slotsCount: number }>> {
  const days = ['Nedelja', 'Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak', 'Subota']
  const result: Array<{ date: Date; dateStr: string; dayName: string; slotsCount: number }> = []
  
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  for (let i = 0; i < 14; i++) {
    const checkDate = new Date(today)
    checkDate.setDate(checkDate.getDate() + i)
    checkDate.setHours(0, 0, 0, 0)
    
    // Preskoči vikend
    if (!isWorkingDay(checkDate)) continue
    
    // Za ortodonta proveri samo petak
    if (['ORTHO_CHECKUP', 'ORTHO_BONDING', 'ORTHO_REMOVAL'].includes(serviceType)) {
      if (!isFriday(checkDate)) continue
    }
    
    const { slots } = await getAvailableSlots(checkDate, serviceType)
    
    if (slots.length > 0) {
      result.push({
        date: checkDate,
        dateStr: formatDateSr(checkDate),
        dayName: days[checkDate.getDay()],
        slotsCount: slots.length
      })
    }
  }
  
  return result
}
