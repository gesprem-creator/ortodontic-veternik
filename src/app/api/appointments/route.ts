import { NextRequest, NextResponse } from 'next/server'
import {
  getAppointmentsForWeek,
  createAppointment,
  getAvailableSlots,
  SERVICE_NAMES,
  isWorkingDay,
  isFriday,
} from '@/lib/appointments'
import { ServiceType } from '@prisma/client'
import { db } from '@/lib/db'

// GET - Dohvati termine za nedelju dana
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get('startDate')
    const checkDateParam = searchParams.get('checkDate')
    const serviceTypeParam = searchParams.get('serviceType') as ServiceType | null
    
    // Ako se traže slobodni termini za konkretan datum
    if (checkDateParam && serviceTypeParam) {
      const date = new Date(checkDateParam)
      
      if (!isWorkingDay(date)) {
        return NextResponse.json({
          success: false,
          error: 'Izabrani datum nije radni dan',
          slots: [],
        })
      }
      
      // Provera za ortodonta
      if (['ORTHO_CHECKUP', 'ORTHO_BONDING', 'ORTHO_REMOVAL'].includes(serviceTypeParam)) {
        if (!isFriday(date)) {
          return NextResponse.json({
            success: false,
            error: 'Ortodont je dostupan samo petkom',
            slots: [],
          })
        }
      }
      
      const { slots, providerType } = await getAvailableSlots(date, serviceTypeParam)
      
      return NextResponse.json({
        success: true,
        slots,
        providerType,
        serviceName: SERVICE_NAMES[serviceTypeParam],
      })
    }
    
    // Dohvati nedelju dana počevši od startDate ili danas
    let startDate: Date
    
    if (startDateParam) {
      startDate = new Date(startDateParam)
    } else {
      startDate = new Date()
      // Pronađi prvi radni dan (ponedeljak) tekuće nedelje
      const day = startDate.getDay()
      if (day === 0) { // Nedelja
        startDate.setDate(startDate.getDate() + 1)
      } else if (day > 1) { // Utorak-Subota
        startDate.setDate(startDate.getDate() - (day - 1))
      }
    }
    
    startDate.setHours(0, 0, 0, 0)
    
    const weekData = await getAppointmentsForWeek(startDate)
    
    return NextResponse.json({
      success: true,
      weekData,
    })
    
  } catch (error) {
    console.error('Error fetching appointments:', error)
    return NextResponse.json({
      success: false,
      error: 'Greška prilikom dohvatanja termina',
    }, { status: 500 })
  }
}

// POST - Kreiraj novi termin
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, timeSlot, serviceType, patientName, patientPhone, patientEmail, notes } = body
    
    // Validacija
    if (!date || !timeSlot || !serviceType || !patientName || !patientPhone) {
      return NextResponse.json({
        success: false,
        error: 'Svi obavezni podaci su potrebni: datum, vreme, usluga, ime pacijenta, telefon',
      }, { status: 400 })
    }
    
    const appointmentDate = new Date(date)
    
    // Provera radnog dana
    if (!isWorkingDay(appointmentDate)) {
      return NextResponse.json({
        success: false,
        error: 'Izabrani datum nije radni dan',
      }, { status: 400 })
    }
    
    // Provera za ortodonta
    if (['ORTHO_CHECKUP', 'ORTHO_BONDING', 'ORTHO_REMOVAL'].includes(serviceType)) {
      if (!isFriday(appointmentDate)) {
        return NextResponse.json({
          success: false,
          error: 'Ortodont je dostupan samo petkom',
        }, { status: 400 })
      }
    }
    
    // Normalizuj datum na podne
    appointmentDate.setHours(12, 0, 0, 0)
    
    const appointment = await createAppointment({
      date: appointmentDate,
      timeSlot,
      serviceType,
      patientName,
      patientPhone,
      patientEmail,
      notes,
    })
    
    // Dodaj ili ažuriraj pacijenta u imeniku
    try {
      const existingPatient = await db.patient.findFirst({
        where: { phone: patientPhone },
      })
      
      if (existingPatient) {
        // Ažuriraj broj poseta i poslednju posetu
        await db.patient.update({
          where: { id: existingPatient.id },
          data: {
            visitCount: { increment: 1 },
            lastVisit: appointmentDate,
          },
        })
      } else {
        // Kreiraj novog pacijenta
        await db.patient.create({
          data: {
            name: patientName,
            phone: patientPhone,
            email: patientEmail || null,
            notes: notes || null,
            visitCount: 1,
            lastVisit: appointmentDate,
          },
        })
      }
    } catch (patientError) {
      // Ne prekidaj ako ne uspe čuvanje pacijenta
      console.error('Error saving patient:', patientError)
    }
    
    return NextResponse.json({
      success: true,
      appointment,
    })
    
  } catch (error) {
    console.error('Error creating appointment:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Greška prilikom kreiranja termina',
    }, { status: 500 })
  }
}
