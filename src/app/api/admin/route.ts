import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Admin credentials
const ADMIN_EMAIL = 'ortodontic.info@gmail.com';
const ADMIN_PASSWORD = 'Ordinacija021';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    if (action === 'login') {
      const { email, password } = data;
      
      if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        return NextResponse.json({
          success: true,
          message: 'Uspešno ste se prijavili.',
        });
      }
      
      return NextResponse.json({
        success: false,
        message: 'Pogrešan email ili lozinka.',
      });
    }

    if (action === 'get_appointments') {
      const appointments = await db.appointment.findMany({
        include: { patient: true },
        orderBy: { date: 'asc' },
      });
      
      return NextResponse.json({
        success: true,
        appointments: appointments.map((a) => ({
          id: a.id,
          patientId: a.patientId,
          patient: `${a.patient.firstName} ${a.patient.lastName}`,
          phone: a.patient.phone,
          doctorType: a.doctorType,
          serviceType: a.serviceType,
          duration: a.duration,
          date: a.date,
          time: a.time,
          dayOfWeek: a.dayOfWeek,
          status: a.status,
          createdAt: a.createdAt,
        })),
      });
    }

    if (action === 'get_patients') {
      const patients = await db.patient.findMany({
        orderBy: { createdAt: 'desc' },
      });
      
      return NextResponse.json({
        success: true,
        patients: patients.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone,
          createdAt: p.createdAt,
        })),
      });
    }

    if (action === 'get_week_schedule') {
      const { startDate } = data;
      
      // Get appointments for the week
      const start = new Date(startDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      
      const appointments = await db.appointment.findMany({
        where: {
          date: {
            gte: start.toISOString().split('T')[0],
            lt: end.toISOString().split('T')[0],
          },
          status: 'active',
        },
        include: { patient: true },
      });
      
      // Build schedule grid
      const schedule: Record<string, Array<{
        time: string;
        doctorType: string;
        appointment: {
          id: string;
          patient: string;
          phone: string;
          serviceType: string;
          duration: number;
        } | null;
      }>> = {};
      
      for (let i = 0; i < 7; i++) {
        const date = new Date(start);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();
        
        schedule[dateStr] = [];
        
        // Stomatolog slots (Monday-Friday 14h-20h, Friday 14h-18h)
        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          const endHour = dayOfWeek === 5 ? 18 : 20;
          
          // Helper function to check if a slot is covered by an appointment
          const getAppointmentForSlot = (slotTime: string) => {
            const [slotHour, slotMin] = slotTime.split(':').map(Number);
            const slotMinutes = slotHour * 60 + slotMin;
            
            for (const appt of appointments) {
              if (appt.date !== dateStr || appt.doctorType !== 'stomatolog') continue;
              
              const [apptHour, apptMin] = appt.time.split(':').map(Number);
              const apptStartMinutes = apptHour * 60 + apptMin;
              const apptEndMinutes = apptStartMinutes + appt.duration;
              
              // Only return appointment if this is the START slot
              if (slotMinutes === apptStartMinutes) {
                return { appt, isStart: true };
              }
              // Check if slot falls within appointment duration (but not start)
              if (slotMinutes > apptStartMinutes && slotMinutes < apptEndMinutes) {
                return { appt, isStart: false };
              }
            }
            return null;
          };
          
          for (let hour = 14; hour < endHour; hour++) {
            for (let min = 0; min < 60; min += 30) {
              const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
              const result = getAppointmentForSlot(time);
              
              schedule[dateStr].push({
                time,
                doctorType: 'stomatolog',
                // Only show appointment details on the start slot
                appointment: result?.isStart ? {
                  id: result.appt.id,
                  patient: `${result.appt.patient.firstName} ${result.appt.patient.lastName}`,
                  phone: result.appt.patient.phone,
                  serviceType: result.appt.serviceType,
                  duration: result.appt.duration,
                } : null,
                // Mark as blocked if covered by another appointment
                blocked: result && !result.isStart,
              });
            }
          }
        }
        
        // Ortodont slots (Friday 18h-21:15)
        if (dayOfWeek === 5) {
          // Helper function to check if a slot is covered by an appointment
          const getAppointmentForSlot = (slotTime: string) => {
            const [slotHour, slotMin] = slotTime.split(':').map(Number);
            const slotMinutes = slotHour * 60 + slotMin;
            
            for (const appt of appointments) {
              if (appt.date !== dateStr || appt.doctorType !== 'ortodont') continue;
              
              const [apptHour, apptMin] = appt.time.split(':').map(Number);
              const apptStartMinutes = apptHour * 60 + apptMin;
              const apptEndMinutes = apptStartMinutes + appt.duration;
              
              // Only return appointment if this is the START slot
              if (slotMinutes === apptStartMinutes) {
                return { appt, isStart: true };
              }
              // Check if slot falls within appointment duration (but not start)
              if (slotMinutes > apptStartMinutes && slotMinutes < apptEndMinutes) {
                return { appt, isStart: false };
              }
            }
            return null;
          };
          
          for (let hour = 18; hour < 21; hour++) {
            for (let min = 0; min < 60; min += 15) {
              const time = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
              const result = getAppointmentForSlot(time);
              
              schedule[dateStr].push({
                time,
                doctorType: 'ortodont',
                // Only show appointment details on the start slot
                appointment: result?.isStart ? {
                  id: result.appt.id,
                  patient: `${result.appt.patient.firstName} ${result.appt.patient.lastName}`,
                  phone: result.appt.patient.phone,
                  serviceType: result.appt.serviceType,
                  duration: result.appt.duration,
                } : null,
                // Mark as blocked if covered by another appointment
                blocked: result && !result.isStart,
              });
            }
          }
          // Add 21:00 and 21:15
          ['21:00', '21:15'].forEach(time => {
            const result = getAppointmentForSlot(time);
            schedule[dateStr].push({
              time,
              doctorType: 'ortodont',
              appointment: result?.isStart ? {
                id: result.appt.id,
                patient: `${result.appt.patient.firstName} ${result.appt.patient.lastName}`,
                phone: result.appt.patient.phone,
                serviceType: result.appt.serviceType,
                duration: result.appt.duration,
              } : null,
              blocked: result && !result.isStart,
            });
          });
        }
      }
      
      return NextResponse.json({
        success: true,
        schedule,
      });
    }

    if (action === 'get_available_slots') {
      const { doctorType, date, serviceType } = data;
      
      // Service durations
      const DURATIONS: Record<string, Record<string, number>> = {
        stomatolog: { lecenje: 60, popravka: 60, skidanje_kamenca: 30, vadjenje_zuba: 30, konsultacija: 15 },
        ortodont: { kontrola: 15, lepljenje_proteze: 45, skidanje_proteze: 45 },
      };
      
      const duration = DURATIONS[doctorType]?.[serviceType] || 30;
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      
      // Get existing appointments for this date and doctor
      const existingAppointments = await db.appointment.findMany({
        where: {
          date,
          doctorType,
          status: 'active',
        },
      });
      
      // Generate available slots
      const availableSlots: string[] = [];
      
      // Determine working hours
      let startHour = 14;
      let endHour: number;
      let slotDuration: number;
      
      if (doctorType === 'stomatolog') {
        endHour = dayOfWeek === 5 ? 18 : 20;
        slotDuration = 30;
      } else {
        // Ortodont only Friday
        if (dayOfWeek !== 5) {
          return NextResponse.json({ success: true, slots: [] });
        }
        startHour = 18;
        endHour = 21;
        slotDuration = 15;
      }
      
      // Calculate max end time in minutes
      let maxEndMinutes: number;
      if (doctorType === 'ortodont') {
        maxEndMinutes = 21 * 60 + 30; // 21:30
      } else if (dayOfWeek === 5) {
        maxEndMinutes = 18 * 60; // Friday: 18:00
      } else {
        maxEndMinutes = 21 * 60; // Regular day: 21:00
      }
      
      // Generate all possible slots
      const allSlots: string[] = [];
      if (doctorType === 'ortodont') {
        for (let hour = 18; hour < 21; hour++) {
          for (let min = 0; min < 60; min += slotDuration) {
            allSlots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
          }
        }
        allSlots.push('21:00', '21:15');
      } else {
        for (let hour = startHour; hour < endHour; hour++) {
          for (let min = 0; min < 60; min += slotDuration) {
            allSlots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);
          }
        }
      }
      
      // Filter slots - check if slot has enough time for the service
      for (const slot of allSlots) {
        const [slotHour, slotMin] = slot.split(':').map(Number);
        const slotMinutes = slotHour * 60 + slotMin;
        const slotEndMinutes = slotMinutes + duration;
        
        // Check if appointment would end after working hours
        if (slotEndMinutes > maxEndMinutes) {
          continue;
        }
        
        // Check for overlap with existing appointments
        let hasOverlap = false;
        for (const appt of existingAppointments) {
          const [apptHour, apptMin] = appt.time.split(':').map(Number);
          const apptStartMinutes = apptHour * 60 + apptMin;
          const apptEndMinutes = apptStartMinutes + appt.duration;
          
          // Check if new appointment overlaps with existing
          if (slotMinutes < apptEndMinutes && slotEndMinutes > apptStartMinutes) {
            hasOverlap = true;
            break;
          }
        }
        
        if (!hasOverlap) {
          availableSlots.push(slot);
        }
      }
      
      return NextResponse.json({ success: true, slots: availableSlots });
    }

    if (action === 'get_available_services') {
      const { doctorType, date, time } = data;
      
      // Service durations
      const DURATIONS: Record<string, Record<string, number>> = {
        stomatolog: { lecenje: 60, popravka: 60, skidanje_kamenca: 30, vadjenje_zuba: 30, konsultacija: 15 },
        ortodont: { kontrola: 15, lepljenje_proteze: 45, skidanje_proteze: 45 },
      };
      
      const services = DURATIONS[doctorType] || {};
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      
      // Get existing appointments for this date and doctor
      const existingAppointments = await db.appointment.findMany({
        where: {
          date,
          doctorType,
          status: 'active',
        },
      });
      
      // Calculate max end time in minutes
      let maxEndMinutes: number;
      if (doctorType === 'ortodont') {
        maxEndMinutes = 21 * 60 + 30; // 21:30
      } else if (dayOfWeek === 5) {
        maxEndMinutes = 18 * 60; // Friday: 18:00
      } else {
        maxEndMinutes = 21 * 60; // Regular day: 21:00
      }
      
      const [slotHour, slotMin] = time.split(':').map(Number);
      const slotStartMinutes = slotHour * 60 + slotMin;
      
      // Check which services can fit
      const availableServices: string[] = [];
      
      for (const [serviceType, duration] of Object.entries(services)) {
        const slotEndMinutes = slotStartMinutes + duration;
        
        // Check if appointment would end after working hours
        if (slotEndMinutes > maxEndMinutes) {
          continue;
        }
        
        // Check for overlap with existing appointments
        let hasOverlap = false;
        for (const appt of existingAppointments) {
          const [apptHour, apptMin] = appt.time.split(':').map(Number);
          const apptStartMinutes = apptHour * 60 + apptMin;
          const apptEndMinutes = apptStartMinutes + appt.duration;
          
          // Check if new appointment overlaps with existing
          if (slotStartMinutes < apptEndMinutes && slotEndMinutes > apptStartMinutes) {
            hasOverlap = true;
            break;
          }
        }
        
        if (!hasOverlap) {
          availableServices.push(serviceType);
        }
      }
      
      return NextResponse.json({ success: true, services: availableServices });
    }

    if (action === 'create_appointment') {
      const { firstName, lastName, phone, doctorType, serviceType, date, time } = data;
      
      // Service durations
      const DURATIONS: Record<string, Record<string, number>> = {
        stomatolog: { lecenje: 60, popravka: 60, skidanje_kamenca: 30, vadjenje_zuba: 30, konsultacija: 15 },
        ortodont: { kontrola: 15, lepljenje_proteze: 45, skidanje_proteze: 45 },
      };
      
      const duration = DURATIONS[doctorType]?.[serviceType] || 30;
      
      // Check for overlapping appointments
      const existingAppointments = await db.appointment.findMany({
        where: {
          date,
          doctorType,
          status: 'active',
        },
      });
      
      const [newHour, newMin] = time.split(':').map(Number);
      const newStartMinutes = newHour * 60 + newMin;
      const newEndMinutes = newStartMinutes + duration;
      
      for (const appt of existingAppointments) {
        const [apptHour, apptMin] = appt.time.split(':').map(Number);
        const apptStartMinutes = apptHour * 60 + apptMin;
        const apptEndMinutes = apptStartMinutes + appt.duration;
        
        // Check if new appointment overlaps with existing
        if (newStartMinutes < apptEndMinutes && newEndMinutes > apptStartMinutes) {
          return NextResponse.json({
            success: false,
            error: `Termin se preklapa sa postojećim terminom u ${appt.time} (${appt.duration} min). Za ovu intervenciju treba ${duration} minuta.`,
          });
        }
      }
      
      // Check if appointment would end after working hours
      const dateObj = new Date(date);
      const dayOfWeek = dateObj.getDay();
      let maxEndMinutes: number;
      
      if (doctorType === 'ortodont') {
        maxEndMinutes = 21 * 60 + 30; // 21:30
      } else if (dayOfWeek === 5) {
        maxEndMinutes = 18 * 60; // Friday: 18:00
      } else {
        maxEndMinutes = 21 * 60; // Regular day: 21:00
      }
      
      if (newEndMinutes > maxEndMinutes) {
        return NextResponse.json({
          success: false,
          error: `Termin bi završio posle radnog vremena. Za ovu intervenciju treba ${duration} minuta.`,
        });
      }
      
      // Find or create patient - always keep the most complete info
      let patient = await db.patient.findUnique({ where: { phone } });
      
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
          data: { firstName: firstName || '', lastName: lastName || '', phone },
        });
      }
      
      const appointment = await db.appointment.create({
        data: {
          patientId: patient.id,
          doctorType,
          serviceType,
          duration,
          date,
          time,
          dayOfWeek: dayOfWeek,
        },
      });
      
      return NextResponse.json({
        success: true,
        appointment: {
          id: appointment.id,
          patient: `${patient.firstName} ${patient.lastName}`.trim() || phone,
          date,
          time,
          serviceType,
          doctorType,
        },
      });
    }

    if (action === 'cancel_appointment_admin') {
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

    if (action === 'search_patients') {
      const { query } = data;
      
      const patients = await db.patient.findMany({
        where: {
          OR: [
            { firstName: { contains: query } },
            { lastName: { contains: query } },
            { phone: { contains: query } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      
      return NextResponse.json({
        success: true,
        patients: patients.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone,
          createdAt: p.createdAt,
        })),
      });
    }

    return NextResponse.json({ success: false, message: 'Nepoznata akcija.' });
  } catch (error) {
    console.error('Admin API error:', error);
    return NextResponse.json(
      { success: false, error: 'Došlo je do greške.' },
      { status: 500 }
    );
  }
}
