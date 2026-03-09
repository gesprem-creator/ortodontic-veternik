import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET - Dohvati sve pacijente sa pretragom
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    let patients

    if (search && search.trim()) {
      // Pretraga po imenu ili telefonu
      patients = await db.patient.findMany({
        where: {
          OR: [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { phone: { contains: search.trim() } },
          ],
        },
        orderBy: { name: 'asc' },
      })
    } else {
      // Svi pacijenti
      patients = await db.patient.findMany({
        orderBy: { name: 'asc' },
      })
    }

    return NextResponse.json({ success: true, patients })
  } catch (error) {
    console.error('Error fetching patients:', error)
    return NextResponse.json(
      { success: false, error: 'Greška prilikom dohvatanja pacijenata' },
      { status: 500 }
    )
  }
}

// POST - Dodaj novog pacijenta
export async function POST(request: NextRequest) {
  try {
    const data = await request.json()
    const { name, phone, email, notes } = data

    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: 'Ime i telefon su obavezni' },
        { status: 400 }
      )
    }

    // Proveri da li pacijent već postoji po telefonu
    const existing = await db.patient.findFirst({
      where: { phone },
    })

    if (existing) {
      // Ažuriraj broj poseta
      const updated = await db.patient.update({
        where: { id: existing.id },
        data: {
          visitCount: { increment: 1 },
          lastVisit: new Date(),
        },
      })
      return NextResponse.json({ success: true, patient: updated, exists: true })
    }

    const patient = await db.patient.create({
      data: {
        name,
        phone,
        email,
        notes,
        visitCount: 1,
        lastVisit: new Date(),
      },
    })

    return NextResponse.json({ success: true, patient })
  } catch (error) {
    console.error('Error creating patient:', error)
    return NextResponse.json(
      { success: false, error: 'Greška prilikom kreiranja pacijenta' },
      { status: 500 }
    )
  }
}
