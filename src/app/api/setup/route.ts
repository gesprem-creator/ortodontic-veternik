import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    // Kreiraj tabele direktno sa SQL
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        "emailVerified" TIMESTAMP(3),
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Account" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" TEXT NOT NULL,
        type TEXT NOT NULL,
        provider TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        "refresh_token" TEXT,
        "access_token" TEXT,
        "expires_at" INTEGER,
        "token_type" TEXT,
        scope TEXT,
        "id_token" TEXT,
        "session_state" TEXT,
        CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `)
    
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionToken" TEXT NOT NULL UNIQUE,
        "userId" TEXT NOT NULL,
        expires TIMESTAMP(3) NOT NULL,
        CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"(id) ON DELETE CASCADE
      );
    `)
    
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "VerificationToken" (
        identifier TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        expires TIMESTAMP(3) NOT NULL
      );
    `)
    
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Appointment" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        date TIMESTAMP(3) NOT NULL,
        "timeSlot" TEXT NOT NULL,
        duration INTEGER NOT NULL,
        "serviceType" TEXT NOT NULL,
        "providerType" TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'SCHEDULED',
        "patientName" TEXT NOT NULL,
        "patientPhone" TEXT NOT NULL,
        "patientEmail" TEXT,
        notes TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ChatSession" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        "sessionId" TEXT NOT NULL UNIQUE,
        messages TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Patient" (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        notes TEXT,
        "visitCount" INTEGER NOT NULL DEFAULT 0,
        "lastVisit" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)
    
    // Kreiraj indekse
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Appointment_date_idx" ON "Appointment"(date)`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Appointment_date_providerType_idx" ON "Appointment"(date, "providerType")`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Appointment_date_status_idx" ON "Appointment"(date, status)`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Patient_name_idx" ON "Patient"(name)`)
    await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Patient_phone_idx" ON "Patient"(phone)`)
    
    return NextResponse.json({ 
      success: true, 
      message: 'Tabele uspešno kreirane!' 
    })
  } catch (error) {
    console.error('Setup error:', error)
    return NextResponse.json(
      { error: 'Greška prilikom kreiranja tabela', details: String(error) },
      { status: 500 }
    )
  }
}
