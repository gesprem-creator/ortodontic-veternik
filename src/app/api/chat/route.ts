import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

// Store conversations in memory
const conversations = new Map<string, Array<{ role: string; content: string }>>();

// Working hours configuration
const WORKING_HOURS = {
  stomatolog: {
    days: [1, 2, 3, 4, 5], // Monday to Friday
    startHour: 14,
    endHour: 21,
    lastAppointment: 20,
    slotDuration: 30, // 30 minutes
  },
  ortodont: {
    days: [5], // Friday only
    startHour: 18,
    endHour: 21.5,
    slotDuration: 15, // 15 minutes
  },
};

// Service durations
const SERVICE_DURATIONS: Record<string, Record<string, number>> = {
  stomatolog: {
    lecenje: 60,
    popravka: 60,
    skidanje_kamenca: 30,
    vadjenje_zuba: 30,
    konsultacija: 15,
  },
  ortodont: {
    kontrola: 15,
    lepljenje_proteze: 45,
    skidanje_proteze: 45,
  },
};

// Serbian day names
const DAY_NAMES_SR: Record<number, string> = {
  0: 'nedelja',
  1: 'ponedeljak',
  2: 'utorak',
  3: 'sreda',
  4: 'četvrtak',
  5: 'petak',
  6: 'subota',
};

const DAY_NAMES_SR_TO_NUM: Record<string, number> = {
  'ponedeljak': 1, 'ponedjeljak': 1, 'pon': 1, 'ponedeljka': 1,
  'utorak': 2, 'uto': 2, 'utorka': 2,
  'sreda': 3, 'sre': 3, 'srede': 3,
  'četvrtak': 4, 'cetvrtak': 4, 'čet': 4, 'cet': 4, 'četvrtka': 4, 'cetvrtka': 4,
  'petak': 5, 'pet': 5, 'petka': 5,
  'subota': 6, 'sub': 6, 'subote': 6,
  'nedelja': 0, 'nedjelja': 0, 'ned': 0, 'nedelje': 0,
};

function getNextDateForDay(dayOfWeek: number): Date {
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntil = dayOfWeek - currentDay;
  
  if (daysUntil <= 0) {
    daysUntil += 7;
  }
  
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);
  return targetDate;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseTimeFromText(text: string): number | null {
  // Match patterns like "17h", "17:00", "17 sati", "17"
  const patterns = [
    /(\d{1,2})[:\s]?h/i,
    /(\d{1,2}):(\d{2})/,
    /(\d{1,2})\s*(?:sata|sati|sat)/i,
    /u\s*(\d{1,2})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      if (hour >= 0 && hour <= 23) {
        return hour;
      }
    }
  }
  return null;
}

function parseDayFromText(text: string): number | null {
  const lowerText = text.toLowerCase();
  
  for (const [dayName, dayNum] of Object.entries(DAY_NAMES_SR_TO_NUM)) {
    if (lowerText.includes(dayName)) {
      return dayNum;
    }
  }
  
  // Check for "danas" (today) or "sutra" (tomorrow)
  if (lowerText.includes('danas')) {
    return new Date().getDay();
  }
  if (lowerText.includes('sutra')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.getDay();
  }
  
  return null;
}

async function getAvailableSlots(doctorType: string, date: string, serviceDuration: number = 30): Promise<string[]> {
  const config = WORKING_HOURS[doctorType as keyof typeof WORKING_HOURS];
  if (!config) return [];

  const slots: string[] = [];
  const dateObj = new Date(date);
  const dayOfWeek = dateObj.getDay();

  // Check if doctor works on this day
  if (!config.days.includes(dayOfWeek)) {
    return [];
  }

  // Determine end time based on doctor type and day
  let endHour: number;
  if (dayOfWeek === 5) {
    // Friday special schedule
    if (doctorType === 'stomatolog') {
      endHour = 18; // Stomatolog works until 18h on Friday
    } else if (doctorType === 'ortodont') {
      endHour = 21; // Ortodont works until 21:30
    } else {
      return [];
    }
  } else {
    // Regular day
    if (doctorType === 'stomatolog') {
      endHour = config.lastAppointment; // 20h
    } else {
      return []; // Ortodont only works on Friday
    }
  }

  // Generate slots
  const slotDuration = doctorType === 'ortodont' ? 15 : 30;
  
  if (doctorType === 'ortodont') {
    for (let hour = 18; hour < 21; hour++) {
      for (let min = 0; min < 60; min += slotDuration) {
        const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        slots.push(time);
      }
    }
    slots.push('21:00');
    slots.push('21:15');
  } else {
    for (let hour = config.startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += slotDuration) {
        const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        slots.push(time);
      }
    }
  }

  // Get booked appointments for this date
  const bookedAppointments = await db.appointment.findMany({
    where: {
      date,
      doctorType,
      status: 'active',
    },
  });

  console.log(`[getAvailableSlots] Date: ${date}, Doctor: ${doctorType}, Duration: ${serviceDuration}min`);
  console.log(`[getAvailableSlots] Total slots: ${slots.length}`);
  console.log(`[getAvailableSlots] Booked appointments: ${bookedAppointments.length}`);
  
  if (bookedAppointments.length > 0) {
    console.log(`[getAvailableSlots] Booked times:`, bookedAppointments.map(a => `${a.time} (${a.duration}min)`));
  }
  
  // Build list of unavailable time slots
  const unavailableSlots = new Set<string>();
  
  // Mark slots that would overlap with existing appointments
  for (const booked of bookedAppointments) {
    const [bookedHour, bookedMin] = booked.time.split(':').map(Number);
    const bookedStartMinutes = bookedHour * 60 + bookedMin;
    const bookedEndMinutes = bookedStartMinutes + booked.duration;
    
    // Mark all slots that would overlap
    for (const slot of slots) {
      const [slotHour, slotMin] = slot.split(':').map(Number);
      const slotMinutes = slotHour * 60 + slotMin;
      const slotEndMinutes = slotMinutes + serviceDuration;
      
      // Check if there's any overlap
      if (slotMinutes < bookedEndMinutes && slotEndMinutes > bookedStartMinutes) {
        unavailableSlots.add(slot);
      }
    }
  }
  
  // Also filter slots that would extend beyond working hours
  let maxEndMinutes: number;
  if (doctorType === 'ortodont') {
    maxEndMinutes = 21 * 60 + 30; // 21:30
  } else if (dayOfWeek === 5) {
    maxEndMinutes = 18 * 60; // Friday: 18:00
  } else {
    maxEndMinutes = 21 * 60; // Regular day: 21:00
  }
  
  // Filter out unavailable slots and slots that would extend beyond working hours
  const availableSlots = slots.filter(slot => {
    if (unavailableSlots.has(slot)) return false;
    
    const [slotHour, slotMin] = slot.split(':').map(Number);
    const slotMinutes = slotHour * 60 + slotMin;
    const slotEndMinutes = slotMinutes + serviceDuration;
    
    // Check if appointment would end after working hours
    if (slotEndMinutes > maxEndMinutes) {
      return false;
    }
    
    return true;
  });
  
  console.log(`[getAvailableSlots] Available slots: ${availableSlots.length}`);

  return availableSlots;
}

function getSystemPrompt(): string {
  return `Ti si prijateljski chatbot za stomatološku ordinaciju "Ortodontic" iz Veternika. 
Tvoj zadatak je da pomažeš pacijentima da zakažu termine.

RADNO VREME:
- Stomatolog: ponedeljak - petak od 14h do 21h (zadnji termin u 20h)
- Ortodont: samo petkom od 18h do 21:30h
- VAŽNO: Petkom stomatolog radi samo do 18h jer tada počinje ortodont!

USLUGE I TRAJANjE:
Stomatolog:
- Lečenje: 60 minuta
- Popravka: 60 minuta  
- Skidanje kamenca: 30 minuta

Ortodont:
- Kontrola: 15 minuta
- Lepljenje proteze: 45 minuta
- Skidanje proteze: 45 minuta

TOK RAZGOVORA:
1. Prvo pitaj da li želi da zakaže kod stomatologa ili ortodonta, ili da otkaže termin
2. Ako bira doktora - pitaj koju uslugu želi
3. Pitaj za dan (može navesti i vreme)
4. Ako nije naveo vreme - ponudi slobodne termine
5. Na kraju zatraži ime, prezime i broj telefona

Odgovaraj kratko i jasno na srpskom jeziku. Budi ljubazan i profesionalan.

Kada korisnik završi sa odabirom, pozovi funkciju za zakazivanje ili otkazivanje.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, action, data } = body;

    if (action === 'get_slots') {
      const { doctorType, date, duration } = data;
      const slots = await getAvailableSlots(doctorType, date, duration);
      return NextResponse.json({ success: true, slots });
    }

    if (action === 'book_appointment') {
      try {
        const { firstName, lastName, phone, doctorType, serviceType, date, time, duration } = data;
        
        // Check if slot is available
        const existingAppointment = await db.appointment.findFirst({
          where: {
            date,
            time,
            doctorType,
            status: 'active',
          },
        });
        
        if (existingAppointment) {
          return NextResponse.json({
            success: false,
            error: 'Termin je zauzet. Molim vas izaberite drugo vreme.',
          });
        }
        
        // Check for overlapping appointments
        const [hour, min] = time.split(':').map(Number);
        const slotMinutes = hour * 60 + min;
        
        const allAppointments = await db.appointment.findMany({
          where: {
            date,
            doctorType,
            status: 'active',
          },
        });
        
        for (const appt of allAppointments) {
          const [apptHour, apptMin] = appt.time.split(':').map(Number);
          const apptStart = apptHour * 60 + apptMin;
          const apptEnd = apptStart + appt.duration;
          
          // Check if new appointment overlaps with existing
          if (slotMinutes < apptEnd && slotMinutes + duration > apptStart) {
            return NextResponse.json({
              success: false,
              error: 'Termin se preklapa sa postojećim. Molim vas izaberite drugo vreme.',
            });
          }
        }
        
        // Find or create patient - always keep the most complete info
        let patient = await db.patient.findUnique({
          where: { phone },
        });
        
        if (patient) {
          // Update patient info if we have more complete data
          const updateData: { firstName?: string; lastName?: string } = {};
          
          // If current firstName is empty and we have new one, update
          if (!patient.firstName && firstName) {
            updateData.firstName = firstName;
          }
          // If current lastName is empty and we have new one, update
          if (!patient.lastName && lastName) {
            updateData.lastName = lastName;
          }
          
          // Only update if we have new data
          if (Object.keys(updateData).length > 0) {
            patient = await db.patient.update({
              where: { id: patient.id },
              data: updateData,
            });
          }
        } else {
          // Create new patient
          patient = await db.patient.create({
            data: {
              firstName: firstName || '',
              lastName: lastName || '',
              phone,
            },
          });
        }
        
        // Create appointment
        const dateObj = new Date(date);
        const appointment = await db.appointment.create({
          data: {
            patientId: patient.id,
            doctorType,
            serviceType,
            duration,
            date,
            time,
            dayOfWeek: dateObj.getDay(),
          },
        });
        
        return NextResponse.json({
          success: true,
          appointment: {
            id: appointment.id,
            patient: `${patient.firstName} ${patient.lastName}`,
            date,
            time,
            serviceType,
            doctorType,
          },
        });
      } catch (error) {
        // Handle unique constraint error (P2002)
        if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
          return NextResponse.json({
            success: false,
            error: 'Termin je zauzet. Molim vas izaberite drugo vreme.',
          });
        }
        throw error;
      }
    }

    if (action === 'cancel_appointment') {
      const { phone } = data;
      
      const appointment = await db.appointment.findFirst({
        where: {
          patient: { phone },
          status: 'active',
        },
        include: { patient: true },
        orderBy: { createdAt: 'desc' },
      });
      
      if (!appointment) {
        return NextResponse.json({
          success: false,
          message: 'Nema aktivnih termina za dati broj telefona.',
        });
      }
      
      return NextResponse.json({
        success: true,
        appointment: {
          id: appointment.id,
          patient: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          date: appointment.date,
          time: appointment.time,
          serviceType: appointment.serviceType,
          doctorType: appointment.doctorType,
        },
      });
    }

    if (action === 'confirm_cancel') {
      const { appointmentId } = data;
      
      await db.appointment.update({
        where: { id: appointmentId },
        data: { status: 'cancelled' },
      });
      
      return NextResponse.json({
        success: true,
        message: 'Termin je uspešno otkazan.',
      });
    }

    // Chat action
    const zai = await ZAI.create();
    
    let history = conversations.get(sessionId) || [
      { role: 'assistant', content: getSystemPrompt() },
    ];

    // Add user message
    history.push({ role: 'user', content: message });

    // Get completion
    const completion = await zai.chat.completions.create({
      messages: history as Array<{ role: 'assistant' | 'user'; content: string }>,
      thinking: { type: 'disabled' },
    });

    const aiResponse = completion.choices[0]?.message?.content || 'Izvinite, nisam razumeo. Molim vas pokušajte ponovo.';

    // Add AI response to history
    history.push({ role: 'assistant', content: aiResponse });

    // Keep history manageable
    if (history.length > 20) {
      history = [history[0], ...history.slice(-19)];
    }

    conversations.set(sessionId, history);

    // Parse context from conversation
    const context: Record<string, unknown> = {};
    const lowerHistory = history.map(h => h.content.toLowerCase()).join(' ');
    
    // Detect doctor type
    if (lowerHistory.includes('stomatolog') && !lowerHistory.includes('ortodont')) {
      context.doctorType = 'stomatolog';
    } else if (lowerHistory.includes('ortodont') && !lowerHistory.includes('stomatolog')) {
      context.doctorType = 'ortodont';
    }
    
    // Detect service type
    if (lowerHistory.includes('lečenje') || lowerHistory.includes('lecenje')) {
      context.serviceType = 'lečenje';
    } else if (lowerHistory.includes('popravka')) {
      context.serviceType = 'popravka';
    } else if (lowerHistory.includes('kamenca')) {
      context.serviceType = 'skidanje_kamenca';
    } else if (lowerHistory.includes('kontrola')) {
      context.serviceType = 'kontrola';
    } else if (lowerHistory.includes('lepljenje')) {
      context.serviceType = 'lepljenje_proteze';
    } else if (lowerHistory.includes('skidanje proteze')) {
      context.serviceType = 'skidanje_proteze';
    }

    // Detect day
    const parsedDay = parseDayFromText(message);
    if (parsedDay !== null) {
      context.dayOfWeek = parsedDay;
      context.dayName = DAY_NAMES_SR[parsedDay];
      const date = getNextDateForDay(parsedDay);
      context.date = formatDate(date);
    }

    // Detect time
    const parsedTime = parseTimeFromText(message);
    if (parsedTime !== null) {
      context.time = `${parsedTime.toString().padStart(2, '0')}:00`;
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      context,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Došlo je do greške. Pokušajte ponovo.' },
      { status: 500 }
    );
  }
}
