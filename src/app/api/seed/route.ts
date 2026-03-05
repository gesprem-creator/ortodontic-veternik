import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hash } from 'bcryptjs'

export async function GET() {
  try {
    // Proveri da li admin već postoji
    const existingUser = await db.user.findUnique({
      where: { email: 'ortodontic.info@gmail.com' },
    })

    if (existingUser) {
      return NextResponse.json({
        message: 'Admin korisnik već postoji',
        user: { email: existingUser.email },
      })
    }

    // Kreiraj admin korisnika
    const hashedPassword = await hash('Ordinacija021', 12)

    const user = await db.user.create({
      data: {
        email: 'ortodontic.info@gmail.com',
        name: 'Admin',
        password: hashedPassword,
        role: 'admin',
      },
    })

    return NextResponse.json({
      message: 'Admin korisnik uspešno kreiran',
      user: { email: user.email, name: user.name },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json(
      { error: 'Greška prilikom kreiranja admin korisnika' },
      { status: 500 }
    )
  }
}
