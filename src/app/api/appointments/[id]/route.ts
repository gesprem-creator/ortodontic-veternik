import { NextRequest, NextResponse } from 'next/server'
import {
  getAppointmentById,
  updateAppointment,
  deleteAppointment,
  cancelAppointment,
} from '@/lib/appointments'
import { AppointmentStatus, ServiceType } from '@prisma/client'

// GET - Dohvati termin po ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const appointment = await getAppointmentById(id)
    
    if (!appointment) {
      return NextResponse.json({
        success: false,
        error: 'Termin nije pronađen',
      }, { status: 404 })
    }
    
    return NextResponse.json({
      success: true,
      appointment,
    })
    
  } catch (error) {
    console.error('Error fetching appointment:', error)
    return NextResponse.json({
      success: false,
      error: 'Greška prilikom dohvatanja termina',
    }, { status: 500 })
  }
}

// PUT - Ažuriraj termin
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    const updateData: Partial<{
      date: Date
      timeSlot: string
      serviceType: ServiceType
      patientName: string
      patientPhone: string
      patientEmail: string
      notes: string
      status: AppointmentStatus
    }> = {}
    
    if (body.date) updateData.date = new Date(body.date)
    if (body.timeSlot) updateData.timeSlot = body.timeSlot
    if (body.serviceType) updateData.serviceType = body.serviceType as ServiceType
    if (body.patientName) updateData.patientName = body.patientName
    if (body.patientPhone) updateData.patientPhone = body.patientPhone
    if (body.patientEmail !== undefined) updateData.patientEmail = body.patientEmail
    if (body.notes !== undefined) updateData.notes = body.notes
    if (body.status) updateData.status = body.status as AppointmentStatus
    
    const appointment = await updateAppointment(id, updateData)
    
    return NextResponse.json({
      success: true,
      appointment,
    })
    
  } catch (error) {
    console.error('Error updating appointment:', error)
    return NextResponse.json({
      success: false,
      error: 'Greška prilikom ažuriranja termina',
    }, { status: 500 })
  }
}

// DELETE - Obriši termin
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteAppointment(id)
    
    return NextResponse.json({
      success: true,
      message: 'Termin je obrisan',
    })
    
  } catch (error) {
    console.error('Error deleting appointment:', error)
    return NextResponse.json({
      success: false,
      error: 'Greška prilikom brisanja termina',
    }, { status: 500 })
  }
}

// PATCH - Otkaži termin
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const appointment = await cancelAppointment(id)
    
    return NextResponse.json({
      success: true,
      appointment,
    })
    
  } catch (error) {
    console.error('Error cancelling appointment:', error)
    return NextResponse.json({
      success: false,
      error: 'Greška prilikom otkazivanja termina',
    }, { status: 500 })
  }
}
