import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// DELETE - Obriši pacijenta
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    await db.patient.delete({
      where: { id },
    })

    return NextResponse.json({ success: true, message: 'Pacijent obrisan' })
  } catch (error) {
    console.error('Error deleting patient:', error)
    return NextResponse.json(
      { success: false, error: 'Greška prilikom brisanja pacijenta' },
      { status: 500 }
    )
  }
}

// GET - Dohvati pojedinačnog pacijenta
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const patient = await db.patient.findUnique({
      where: { id },
    })

    if (!patient) {
      return NextResponse.json(
        { success: false, error: 'Pacijent nije pronađen' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, patient })
  } catch (error) {
    console.error('Error fetching patient:', error)
    return NextResponse.json(
      { success: false, error: 'Greška prilikom dohvatanja pacijenta' },
      { status: 500 }
    )
  }
}

// PUT - Ažuriraj pacijenta
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const data = await request.json()
    const { name, phone, email, notes } = data

    const patient = await db.patient.update({
      where: { id },
      data: {
        name,
        phone,
        email,
        notes,
      },
    })

    return NextResponse.json({ success: true, patient })
  } catch (error) {
    console.error('Error updating patient:', error)
    return NextResponse.json(
      { success: false, error: 'Greška prilikom ažuriranja pacijenta' },
      { status: 500 }
    )
  }
}
