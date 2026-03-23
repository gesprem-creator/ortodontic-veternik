'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Phone, 
  MapPin, 
  Send, 
  Bot, 
  User, 
  Shield, 
  LogOut, 
  Calendar,
  Clock,
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  HelpCircle
} from 'lucide-react';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  options?: { label: string; value: string }[];
  slots?: string[];
}

interface Appointment {
  id: string;
  patient: string;
  phone: string;
  doctorType: string;
  serviceType: string;
  duration: number;
  date: string;
  time: string;
  status: string;
  createdAt: string;
}

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  createdAt: string;
}

interface ScheduleSlot {
  time: string;
  doctorType: string;
  appointment: {
    id: string;
    patient: string;
    phone: string;
    serviceType: string;
    duration: number;
  } | null;
  blocked?: boolean;
}

// Constants
const SERVICE_NAMES_SR: Record<string, string> = {
  lecenje: 'Lečenje',
  popravka: 'Popravka',
  skidanje_kamenca: 'Skidanje kamenca',
  vadjenje_zuba: 'Vađenje zuba',
  konsultacija: 'Konsultacija',
  kontrola: 'Kontrola',
  lepljenje_proteze: 'Lepljenje proteze',
  skidanje_proteze: 'Skidanje proteze',
};

const SERVICE_DURATIONS: Record<string, Record<string, number>> = {
  stomatolog: { lecenje: 60, popravka: 60, skidanje_kamenca: 30, vadjenje_zuba: 30, konsultacija: 15 },
  ortodont: { kontrola: 15, lepljenje_proteze: 45, skidanje_proteze: 45 },
};

const DAY_NAMES_SR: Record<number, string> = {
  0: 'Nedelja',
  1: 'Ponedeljak',
  2: 'Utorak',
  3: 'Sreda',
  4: 'Četvrtak',
  5: 'Petak',
  6: 'Subota',
};

const MONTH_NAMES_SR: string[] = [
  'Januar', 'Februar', 'Mart', 'April', 'Maj', 'Jun',
  'Jul', 'Avgust', 'Septembar', 'Oktobar', 'Novembar', 'Decembar'
];

export default function HomePage() {
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(2, 15));
  const [chatState, setChatState] = useState<{
    step: 'start' | 'doctor' | 'service' | 'day' | 'time' | 'info' | 'cancel' | 'confirm_cancel' | 'done';
    doctorType?: string;
    serviceType?: string;
    date?: string;
    dayName?: string;
    time?: string;
    duration?: number;
    cancelAppointmentId?: string;
  }>({ step: 'start' });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Admin state
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [adminTab, setAdminTab] = useState<'list' | 'table'>('table');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [schedule, setSchedule] = useState<Record<string, ScheduleSlot[]>>({});
  const [scheduleWeekStart, setScheduleWeekStart] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(today.setDate(diff));
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    doctorType: '',
    serviceType: '',
    date: '',
    time: '',
  });
  const [doctorTypeLocked, setDoctorTypeLocked] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; patient: string } | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookingError, setBookingError] = useState('');
  const [availableServices, setAvailableServices] = useState<string[]>([]);

  // Show delete confirmation
  const showDeleteConfirmation = (appointmentId: string, patient: string) => {
    setDeleteConfirm({ id: appointmentId, patient });
  };

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Focus input
  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Initial welcome message
  useEffect(() => {
    const welcomeMessage: Message = {
      id: '1',
      role: 'assistant',
      content: `Dobar dan! Dobro došli na sajt za zakazivanje stomatološke ordinacije **Ortodontic** iz Veternika.\n\nKako Vam mogu pomoći?`,
      options: [
        { label: '🦷 Želim da zakažem kod stomatologa', value: 'stomatolog' },
        { label: '😁 Želim da zakažem kod ortodonta', value: 'ortodont' },
        { label: '❌ Želim da otkažem termin', value: 'otkazi' },
      ],
    };
    setMessages([welcomeMessage]);
  }, []);

  // Fetch data for admin
  const fetchData = useCallback(async () => {
    try {
      const [patientsRes, appointmentsRes] = await Promise.all([
        fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_patients', data: {} }),
        }),
        fetch('/api/admin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_appointments', data: {} }),
        }),
      ]);
      
      const patientsData = await patientsRes.json();
      const appointmentsData = await appointmentsRes.json();
      
      if (patientsData.success) setPatients(patientsData.patients);
      if (appointmentsData.success) setAppointments(appointmentsData.appointments);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }, []);

  const fetchSchedule = useCallback(async () => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_week_schedule',
          data: { startDate: scheduleWeekStart.toISOString().split('T')[0] },
        }),
      });
      
      const data = await res.json();
      if (data.success) setSchedule(data.schedule);
    } catch (error) {
      console.error('Error fetching schedule:', error);
    }
  }, [scheduleWeekStart]);

  // Fetch schedule when week changes
  useEffect(() => {
    if (isLoggedIn) {
      fetchSchedule();
    }
  }, [scheduleWeekStart, isLoggedIn, fetchSchedule]);

  // Handle admin login
  const handleLogin = async () => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'login',
          data: { email: loginEmail, password: loginPassword },
        }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setIsLoggedIn(true);
        setLoginError('');
        fetchData();
        fetchSchedule();
      } else {
        setLoginError(data.message);
      }
    } catch {
      setLoginError('Greška pri prijavljivanju.');
    }
  };

  // Handle admin logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    setLoginEmail('');
    setLoginPassword('');
    setPatients([]);
    setAppointments([]);
    setSchedule({});
  };

  // Search patients
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      fetchData();
      return;
    }
    
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'search_patients',
          data: { query: searchQuery },
        }),
      });
      
      const data = await res.json();
      if (data.success) setPatients(data.patients);
    } catch (error) {
      console.error('Error searching patients:', error);
    }
  };

  // Cancel appointment from admin
  const handleCancelAppointment = async (appointmentId: string) => {
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel_appointment_admin',
          data: { appointmentId },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setDeleteConfirm(null);
        fetchData();
        fetchSchedule();
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
    }
  };

  // Fetch available slots for booking form
  const fetchAvailableSlots = useCallback(async (doctorType: string, date: string, serviceType: string) => {
    if (!doctorType || !date || !serviceType) {
      setAvailableSlots([]);
      return;
    }
    
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_available_slots',
          data: { doctorType, date, serviceType },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setAvailableSlots(data.slots);
        // Reset time if current time is not in available slots
        if (bookingForm.time && !data.slots.includes(bookingForm.time)) {
          setBookingForm(prev => ({ ...prev, time: '' }));
        }
      }
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setAvailableSlots([]);
    }
  }, [bookingForm.time]);

  // Fetch available slots when form changes
  useEffect(() => {
    if (bookingForm.doctorType && bookingForm.date && bookingForm.serviceType) {
      fetchAvailableSlots(bookingForm.doctorType, bookingForm.date, bookingForm.serviceType);
    } else {
      setAvailableSlots([]);
    }
  }, [bookingForm.doctorType, bookingForm.date, bookingForm.serviceType, fetchAvailableSlots]);

  // Create appointment from admin
  const handleCreateAppointment = async () => {
    setBookingError('');
    
    if (!bookingForm.firstName || !bookingForm.lastName || !bookingForm.phone || !bookingForm.doctorType || !bookingForm.serviceType || !bookingForm.date || !bookingForm.time) {
      setBookingError('Molim vas popunite sva polja.');
      return;
    }
    
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_appointment',
          data: bookingForm,
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setShowBookingForm(false);
        setDoctorTypeLocked(false);
        setBookingForm({
          firstName: '',
          lastName: '',
          phone: '',
          doctorType: '',
          serviceType: '',
          date: '',
          time: '',
        });
        setAvailableSlots([]);
        fetchData();
        fetchSchedule();
      } else {
        setBookingError(data.error || 'Došlo je do greške prilikom zakazivanja.');
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
      setBookingError('Došlo je do greške prilikom zakazivanja.');
    }
  };

  // Get service duration
  const getDuration = (doctorType: string, serviceType: string): number => {
    const durations: Record<string, Record<string, number>> = {
      stomatolog: { lecenje: 60, popravka: 60, skidanje_kamenca: 30, vadjenje_zuba: 30, konsultacija: 15 },
      ortodont: { kontrola: 15, lepljenje_proteze: 45, skidanje_proteze: 45 },
    };
    return durations[doctorType]?.[serviceType] || 30;
  };

  // Handle slot click in admin schedule
  const handleSlotClick = async (date: string, time: string, doctorType: string) => {
    setBookingError(''); // Reset error
    setBookingForm({
      firstName: '',
      lastName: '',
      phone: '',
      doctorType,
      serviceType: '',
      date,
      time, // Pre-fill time
    });
    setDoctorTypeLocked(true); // Lock doctor type when clicking on slot
    setShowBookingForm(true);
    
    // Fetch available services for this slot
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_available_services',
          data: { doctorType, date, time },
        }),
      });
      
      const data = await res.json();
      if (data.success) {
        setAvailableServices(data.services);
      }
    } catch (error) {
      console.error('Error fetching available services:', error);
      setAvailableServices([]);
    }
  };

  // Add message helper
  const addMessage = (role: 'user' | 'assistant', content: string, options?: { label: string; value: string }[], slots?: string[]) => {
    const newMessage: Message = {
      id: Date.now().toString() + Math.random(),
      role,
      content,
      options,
      slots,
    };
    setMessages((prev) => [...prev, newMessage]);
    scrollToBottom();
  };

  // Get available slots from API
  const getAvailableSlots = async (doctorType: string, date: string, duration?: number): Promise<string[]> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: '',
          action: 'get_slots',
          data: { doctorType, date, duration: duration || 30 },
        }),
      });
      
      const data = await res.json();
      return data.slots || [];
    } catch (error) {
      console.error('Error fetching slots:', error);
      return [];
    }
  };

  // Handle option click
  const handleOptionClick = async (value: string) => {
    setIsLoading(true);
    
    // Start - Doctor selection
    if (chatState.step === 'start') {
      if (value === 'stomatolog') {
        addMessage('user', 'Želim da zakažem kod stomatologa');
        setChatState({ step: 'doctor', doctorType: 'stomatolog' });
        
        setTimeout(() => {
          addMessage('assistant', 'Odabrali ste pregled kod **stomatologa**.\n\nKoju uslugu želite?', [
            { label: '🔧 Lečenje (60 min)', value: 'lecenje' },
            { label: '🦷 Popravka (60 min)', value: 'popravka' },
            { label: '✨ Skidanje kamenca (30 min)', value: 'skidanje_kamenca' },
            { label: '🦷 Vađenje zuba (30 min)', value: 'vadjenje_zuba' },
            { label: '💬 Konsultacija (15 min)', value: 'konsultacija' },
          ]);
          setIsLoading(false);
        }, 500);
        return;
      }
      
      if (value === 'ortodont') {
        addMessage('user', 'Želim da zakažem kod ortodonta');
        setChatState({ step: 'doctor', doctorType: 'ortodont' });
        
        setTimeout(() => {
          addMessage('assistant', 'Odabrali ste pregled kod **ortodonta**.\n\n*Napomena: Ortodont radi samo petkom od 18h do 21:30h*\n\nKoju uslugu želite?', [
            { label: '👁️ Kontrola (15 min)', value: 'kontrola' },
            { label: '🔧 Lepljenje proteze (45 min)', value: 'lepljenje_proteze' },
            { label: '🔧 Skidanje proteze (45 min)', value: 'skidanje_proteze' },
          ]);
          setIsLoading(false);
        }, 500);
        return;
      }
      
      if (value === 'otkazi') {
        addMessage('user', 'Želim da otkažem termin');
        setChatState({ step: 'cancel' });
        
        setTimeout(() => {
          addMessage('assistant', 'Molim vas unesite broj telefona koji ste koristili prilikom zakazivanja termina:');
          setIsLoading(false);
          focusInput();
        }, 500);
        return;
      }
    }
    
    // Service selection
    if (chatState.step === 'doctor' && chatState.doctorType) {
      const duration = getDuration(chatState.doctorType, value);
      
      addMessage('user', SERVICE_NAMES_SR[value] || value);
      setChatState((prev) => ({ ...prev, step: 'service', serviceType: value, duration }));
      
      // Generate day options based on doctor type
      const today = new Date();
      const dayOptions: { label: string; value: string }[] = [];
      const isOrtodont = chatState.doctorType === 'ortodont';
      
      // Check today first
      const todayDayOfWeek = today.getDay();
      const todayStr = today.toISOString().split('T')[0];
      let showToday = false;
      
      // Check if today is a working day for the doctor type
      if (isOrtodont && todayDayOfWeek === 5) {
        // Ortodont works Friday - check if there are available slots
        const slots = await getAvailableSlots(chatState.doctorType, todayStr, duration);
        if (slots.length > 0) {
          showToday = true;
          dayOptions.push({
            label: `Danas ${today.getDate()}.${today.getMonth() + 1}.`,
            value: todayStr,
          });
        }
      } else if (!isOrtodont && todayDayOfWeek >= 1 && todayDayOfWeek <= 5) {
        // Stomatolog works Mon-Fri - check if there are available slots
        const slots = await getAvailableSlots(chatState.doctorType, todayStr, duration);
        if (slots.length > 0) {
          showToday = true;
          dayOptions.push({
            label: `Danas ${today.getDate()}.${today.getMonth() + 1}.`,
            value: todayStr,
          });
        }
      }
      
      // Add future days (from tomorrow onwards)
      for (let i = 1; i <= 21; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        const dayOfWeek = date.getDay();
        
        // Stomatolog works Mon-Fri (on Friday until 18h)
        if (!isOrtodont && dayOfWeek >= 1 && dayOfWeek <= 5) {
          dayOptions.push({
            label: `${DAY_NAMES_SR[dayOfWeek]} ${date.getDate()}.${date.getMonth() + 1}.`,
            value: date.toISOString().split('T')[0],
          });
        }
        // Ortodont works only Friday
        else if (isOrtodont && dayOfWeek === 5) {
          dayOptions.push({
            label: `${DAY_NAMES_SR[dayOfWeek]} ${date.getDate()}.${date.getMonth() + 1}.`,
            value: date.toISOString().split('T')[0],
          });
        }
        
        // Stop when we have 7 options (or more if today was added)
        if (dayOptions.length >= (showToday ? 8 : 7)) break;
      }
      
      setTimeout(() => {
        addMessage('assistant', `Odabrali ste: **${SERVICE_NAMES_SR[value]}** (${duration} min)\n\n${isOrtodont ? 'Ortodont radi samo petkom. ' : ''}Koji dan želite da zakažete?`, dayOptions);
        setIsLoading(false);
      }, 500);
      return;
    }
    
    // Day selection
    if (chatState.step === 'service' && chatState.doctorType && chatState.serviceType) {
      const selectedDate = value;
      const dateObj = new Date(selectedDate);
      const dayOfWeek = dateObj.getDay();
      
      // Calculate duration directly from service type
      const duration = getDuration(chatState.doctorType, chatState.serviceType);
      
      addMessage('user', `${DAY_NAMES_SR[dayOfWeek]} ${dateObj.getDate()}.${dateObj.getMonth() + 1}.`);
      setChatState((prev) => ({ ...prev, step: 'day', date: selectedDate, dayName: DAY_NAMES_SR[dayOfWeek] }));
      
      // Fetch available slots with duration
      const slots = await getAvailableSlots(chatState.doctorType, selectedDate, duration);
      
      if (slots.length > 0) {
        setTimeout(() => {
          addMessage('assistant', `**${DAY_NAMES_SR[dayOfWeek]} ${dateObj.getDate()}.${dateObj.getMonth() + 1}.**\n\nSlobodni termini:`, undefined, slots);
          setIsLoading(false);
        }, 300);
      } else {
        setTimeout(() => {
          addMessage('assistant', `Nažalost, nema slobodnih termina za ${DAY_NAMES_SR[dayOfWeek]}. Želite li drugi dan?`, [
            { label: '🔄 Da, izaberi drugi dan', value: 'restart' },
          ]);
          setIsLoading(false);
        }, 300);
      }
      return;
    }
    
    // Restart
    if (value === 'restart') {
      setChatState({ step: 'start' });
      addMessage('user', 'Želim da izaberem ponovo');
      setTimeout(() => {
        addMessage('assistant', 'Kako Vam mogu pomoći?', [
          { label: '🦷 Želim da zakažem kod stomatologa', value: 'stomatolog' },
          { label: '😁 Želim da zakažem kod ortodonta', value: 'ortodont' },
          { label: '❌ Želim da otkažem termin', value: 'otkazi' },
        ]);
        setIsLoading(false);
      }, 500);
      return;
    }
    
    // Confirm cancel
    if (chatState.step === 'confirm_cancel') {
      if (value === 'da') {
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              message: '',
              action: 'confirm_cancel',
              data: { appointmentId: chatState.cancelAppointmentId },
            }),
          });
          
          const data = await res.json();
          
          if (data.success) {
            addMessage('user', 'Da, otkaži termin');
            setTimeout(() => {
              addMessage('assistant', '✅ **Termin je uspešno otkazan.**\n\nDa li želite da zakažete novi termin?', [
                { label: '🦷 Kod stomatologa', value: 'stomatolog' },
                { label: '😁 Kod ortodonta', value: 'ortodont' },
                { label: '❌ Ne, hvala', value: 'end' },
              ]);
              setChatState({ step: 'start' });
              setIsLoading(false);
            }, 500);
          }
        } catch {
          console.error('Error confirming cancel');
        }
        return;
      }
      
      if (value === 'ne') {
        addMessage('user', 'Ne, ne želim da otkažem');
        setTimeout(() => {
          addMessage('assistant', 'U redu. Da li mogu vam još nešto pomoći?', [
            { label: '🦷 Želim da zakažem kod stomatologa', value: 'stomatolog' },
            { label: '😁 Želim da zakažem kod ortodonta', value: 'ortodont' },
            { label: '❌ Ne, hvala', value: 'end' },
          ]);
          setChatState({ step: 'start' });
          setIsLoading(false);
        }, 500);
        return;
      }
    }
    
    if (value === 'end') {
      addMessage('user', 'Ne, hvala');
      setTimeout(() => {
        addMessage('assistant', 'Hvala što ste koristili naš servis! 🦷\n\nPrijatan dan!');
        setChatState({ step: 'done' });
        setIsLoading(false);
      }, 500);
      return;
    }
    
    setIsLoading(false);
  };

  // Handle slot selection
  const handleSlotSelect = async (slot: string) => {
    setIsLoading(true);
    
    addMessage('user', `Želim termin u ${slot}`);
    setChatState((prev) => ({ ...prev, step: 'info', time: slot }));
    
    setTimeout(() => {
      addMessage('assistant', `Odabrali ste termin u **${slot}**.\n\nMolim vas unesite vaše **ime, prezime i broj telefona**.\n\nPrimer: "Petar Petrović 0631234567"`);
      setIsLoading(false);
      focusInput();
    }, 500);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    const content = input.trim();
    
    // Cancel step - looking up by phone
    if (chatState.step === 'cancel') {
      setIsLoading(true);
      addMessage('user', content);
      setInput('');
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            message: content,
            action: 'cancel_appointment',
            data: { phone: content.replace(/\s/g, '') },
          }),
        });
        
        const data = await res.json();
        
        if (data.success && data.appointment) {
          setTimeout(() => {
            addMessage('assistant', `Pronađen termin:\n\n**Pacijent:** ${data.appointment.patient}\n**Datum:** ${data.appointment.date}\n**Vreme:** ${data.appointment.time}\n**Usluga:** ${SERVICE_NAMES_SR[data.appointment.serviceType]}\n\nDa li želite da otkažete ovaj termin?`, [
              { label: '✅ Da, otkaži termin', value: 'da' },
              { label: '❌ Ne, ne želim da otkažem', value: 'ne' },
            ]);
            setChatState((prev) => ({
              ...prev,
              step: 'confirm_cancel',
              cancelAppointmentId: data.appointment.id,
            }));
            setIsLoading(false);
          }, 500);
        } else {
          setTimeout(() => {
            addMessage('assistant', '❌ Nema aktivnih termina za dati broj telefona.\n\nDa li želite da zakažete novi termin?', [
              { label: '🦷 Kod stomatologa', value: 'stomatolog' },
              { label: '😁 Kod ortodonta', value: 'ortodont' },
              { label: '❌ Ne, hvala', value: 'end' },
            ]);
            setChatState({ step: 'start' });
            setIsLoading(false);
          }, 500);
        }
      } catch {
        console.error('Error cancelling appointment');
      }
      return;
    }
    
    // Info step - booking appointment
    if (chatState.step === 'info') {
      const parts = content.split(/\s+/);
      if (parts.length >= 3) {
        setIsLoading(true);
        const phone = parts[parts.length - 1].replace(/\D/g, '');
        const firstName = parts[0];
        const lastName = parts.slice(1, -1).join(' ');
        
        if (chatState.doctorType && chatState.serviceType && chatState.date && chatState.time) {
          try {
            const res = await fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionId,
                message: content,
                action: 'book_appointment',
                data: {
                  firstName,
                  lastName,
                  phone,
                  doctorType: chatState.doctorType,
                  serviceType: chatState.serviceType,
                  date: chatState.date,
                  time: chatState.time,
                  duration: chatState.duration,
                },
              }),
            });
            
            const data = await res.json();
            
            addMessage('user', content);
            setInput('');
            
            if (data.success) {
              setTimeout(() => {
                addMessage('assistant', `✅ **Termin uspešno zakazan!**\n\n**Pacijent:** ${data.appointment.patient}\n**Datum:** ${chatState.dayName}, ${chatState.date}\n**Vreme:** ${chatState.time}\n**Usluga:** ${SERVICE_NAMES_SR[chatState.serviceType || '']}\n\nHvala što ste odabrali ordinaciju Ortodontic! 🦷\n\nDa li želite da zakažete još jedan termin?`, [
                  { label: '🦷 Da, zakaži novi termin', value: 'restart' },
                  { label: '❌ Ne, hvala', value: 'end' },
                ]);
                setChatState({ step: 'done' });
                setIsLoading(false);
              }, 500);
            } else {
              setTimeout(() => {
                addMessage('assistant', `❌ ${data.error || 'Došlo je do greške prilikom zakazivanja.'}\n\nŽelite li izabrati drugi termin?`, [
                  { label: '🔄 Da, izaberi drugi termin', value: 'restart' },
                ]);
                setIsLoading(false);
              }, 500);
            }
          } catch {
            console.error('Error booking appointment');
          }
          return;
        }
      }
      
      // Invalid input
      setIsLoading(true);
      addMessage('user', content);
      setInput('');
      setTimeout(() => {
        addMessage('assistant', 'Molim vas unesite podatke u formatu: **Ime Prezime BrojTelefona**\n\nPrimer: "Petar Petrović 0631234567"');
        setIsLoading(false);
        focusInput();
      }, 300);
      return;
    }
    
    // Default: treat as text message
    setIsLoading(true);
    addMessage('user', content);
    setInput('');
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: content }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setTimeout(() => {
          addMessage('assistant', data.response);
          setIsLoading(false);
        }, 300);
      }
    } catch {
      console.error('Error sending message');
    }
    
    setIsLoading(false);
  };

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getDate()}. ${MONTH_NAMES_SR[date.getMonth()].toLowerCase()} ${date.getFullYear()}.`;
  };

  // Render markdown-like content
  const renderContent = (content: string) => {
    return content
      .split('\n')
      .map((line, i) => {
        let formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        return (
          <div key={i} className="my-1" dangerouslySetInnerHTML={{ __html: formatted }} />
        );
      });
  };

  // Generate week dates
  const getWeekDates = () => {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(scheduleWeekStart);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                <span className="text-white text-xl sm:text-2xl">🦷</span>
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-gray-900">Ortodontic</h1>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Stomatološka ordinacija Veternik</p>
              </div>
            </div>
            
            {/* Desktop kontakti */}
            <div className="hidden md:flex items-center gap-3">
              <a
                href="tel:021821467"
                className="flex items-center gap-2 px-3 py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm font-medium">021/821-467</span>
              </a>
              <a
                href="tel:0642503304"
                className="flex items-center gap-2 px-3 py-2 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm font-medium">064/250-33-04</span>
              </a>
              <a
                href="https://www.google.com/maps/search/?api=1&query=Ive+Andrića+1+Veternik"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">Kako do nas</span>
              </a>
            </div>

            {/* Mobile menu button */}
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="md:hidden flex items-center gap-1 px-3 py-2 rounded-lg hover:bg-teal-50 text-teal-600"
              title="Kontakt i pomoć"
            >
              <HelpCircle className="w-5 h-5" />
              <span className="text-sm font-medium">Pomoć</span>
            </button>
          </div>
          
          {/* Mobile menu */}
          {showMobileMenu && (
            <div className="md:hidden mt-3 pt-3 border-t space-y-2">
              <a
                href="tel:021821467"
                className="flex items-center gap-2 px-3 py-2 bg-teal-50 text-teal-700 rounded-lg"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm font-medium">021/821-467</span>
              </a>
              <a
                href="tel:0642503304"
                className="flex items-center gap-2 px-3 py-2 bg-teal-50 text-teal-700 rounded-lg"
              >
                <Phone className="w-4 h-4" />
                <span className="text-sm font-medium">064/250-33-04</span>
              </a>
              <a
                href="https://www.google.com/maps/search/?api=1&query=Ive+Andrića+1+Veternik"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg"
              >
                <MapPin className="w-4 h-4" />
                <span className="text-sm font-medium">Kako do nas</span>
              </a>
              <p className="text-sm text-gray-500 flex items-center gap-1 px-3 py-2">
                <MapPin className="w-4 h-4" />
                Ive Andrića 1, Veternik
              </p>
            </div>
          )}
          
          {/* Desktop adresa */}
          <div className="hidden md:block mt-2">
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              Ive Andrića 1, Veternik
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 py-4 sm:py-6">
        {/* Chat container */}
        <Card className="flex flex-col h-[calc(100vh-80px)] sm:h-[calc(100vh-200px)] min-h-[400px]">
          <CardHeader className="border-b bg-gradient-to-r from-teal-500 to-teal-600 text-white rounded-t-lg py-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
                <span className="hidden sm:inline">Virtuelni asistent</span>
                <span className="sm:hidden">Asistent</span>
              </CardTitle>
              <Badge variant="secondary" className="bg-white/20 text-white text-xs">
                Online
              </Badge>
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4" style={{ scrollBehavior: 'smooth' }}>
              <div className="space-y-3 sm:space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2 sm:gap-3 ${
                      message.role === 'user' ? 'flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === 'user'
                          ? 'bg-teal-100 text-teal-600'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <User className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Bot className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </div>
                    <div
                      className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-3 sm:px-4 py-2 sm:py-3 ${
                        message.role === 'user'
                          ? 'bg-teal-500 text-white'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="text-sm leading-relaxed">
                        {renderContent(message.content)}
                      </div>
                      
                      {/* Option buttons */}
                      {message.options && message.options.length > 0 && (
                        <div className="mt-2 sm:mt-3 flex flex-col gap-1.5 sm:gap-2">
                          {message.options.map((option) => (
                            <Button
                              key={option.value}
                              size="sm"
                              variant="outline"
                              className={`justify-start text-left h-auto py-2 px-3 text-xs sm:text-sm ${
                                message.role === 'user'
                                  ? 'border-white/30 text-white hover:bg-white/10'
                                  : 'border-teal-200 text-teal-700 hover:bg-teal-50'
                              }`}
                              onClick={() => handleOptionClick(option.value)}
                              disabled={isLoading}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      
                      {/* Slot buttons */}
                      {message.slots && message.slots.length > 0 && (
                        <div className="mt-2 sm:mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                          {message.slots.map((slot) => (
                            <Button
                              key={slot}
                              size="sm"
                              variant="outline"
                              className={`text-xs ${
                                message.role === 'user'
                                  ? 'border-white/30 text-white hover:bg-white/10'
                                  : 'border-teal-200 text-teal-700 hover:bg-teal-50'
                              }`}
                              onClick={() => handleSlotSelect(slot)}
                              disabled={isLoading}
                            >
                              <Clock className="w-3 h-3 mr-1" />
                              {slot}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600" />
                    </div>
                    <div className="bg-slate-100 rounded-2xl px-3 sm:px-4 py-2 sm:py-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                        <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            {/* Input */}
            <div className="border-t p-3 sm:p-4 bg-white">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={
                    chatState.step === 'cancel'
                      ? 'Broj telefona...'
                      : chatState.step === 'info'
                      ? 'Ime Prezime Telefon...'
                      : 'Poruka...'
                  }
                  disabled={isLoading}
                  className="flex-1 text-sm"
                />
                <Button type="submit" disabled={isLoading || !input.trim()} size="sm" className="px-3">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Admin button - pomeren na mobilnom */}
      <button
        onClick={() => setIsAdminOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-10 h-10 sm:w-12 sm:h-12 bg-slate-800 text-white rounded-full shadow-lg hover:bg-slate-700 transition-colors flex items-center justify-center z-50"
      >
        <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      {/* Admin dialog */}
      <Dialog open={isAdminOpen} onOpenChange={setIsAdminOpen}>
        <DialogContent className="!max-w-4xl !w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Admin panel
            </DialogTitle>
          </DialogHeader>
          
          {!isLoggedIn ? (
            <div className="p-6 max-w-md mx-auto">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Lozinka</Label>
                  <Input
                    id="password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                {loginError && (
                  <p className="text-sm text-red-500">{loginError}</p>
                )}
                <Button onClick={handleLogin} className="w-full">
                  Prijavi se
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <Tabs value={adminTab} onValueChange={(v) => setAdminTab(v as 'list' | 'table')} className="w-full">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <TabsList>
                      <TabsTrigger value="table">Raspored</TabsTrigger>
                      <TabsTrigger value="list">Lista</TabsTrigger>
                    </TabsList>
                    <Button variant="outline" onClick={handleLogout} size="sm">
                      <LogOut className="w-4 h-4 mr-2" />
                      Odjavi se
                    </Button>
                  </div>
                  
                  <TabsContent value="list" className="flex-1 overflow-hidden mt-4">
                <div className="h-full flex flex-col">
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <Input
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                      }}
                      placeholder="Pretraga po imenu, prezimenu ili telefonu..."
                      className="flex-1 min-w-[200px]"
                    />
                    {searchQuery && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSearchQuery('')}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="flex-1 overflow-auto max-h-[60vh] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {appointments
                      .filter((a) => a.status === 'active')
                      .filter((a) => {
                        if (!searchQuery.trim()) return true;
                        const query = searchQuery.toLowerCase();
                        return (
                          a.patient.toLowerCase().includes(query) ||
                          a.phone.includes(query)
                        );
                      })
                      .length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          {searchQuery ? 'Nema rezultata pretrage' : 'Nema zakazanih termina'}
                        </div>
                      ) : (
                    <div className="w-full">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-sm whitespace-nowrap px-2">Pacijent</TableHead>
                            <TableHead className="text-sm whitespace-nowrap px-2">Telefon</TableHead>
                            <TableHead className="text-sm whitespace-nowrap px-2">Tip</TableHead>
                            <TableHead className="text-sm whitespace-nowrap px-2 hidden sm:table-cell">Usluga</TableHead>
                            <TableHead className="text-sm whitespace-nowrap px-2">Datum</TableHead>
                            <TableHead className="text-sm whitespace-nowrap px-2">Vreme</TableHead>
                            <TableHead className="text-sm px-2 w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {appointments
                            .filter((a) => a.status === 'active')
                            .filter((a) => {
                              if (!searchQuery.trim()) return true;
                              const query = searchQuery.toLowerCase();
                              return (
                                a.patient.toLowerCase().includes(query) ||
                                a.phone.includes(query)
                              );
                            })
                            .sort((a, b) => a.patient.localeCompare(b.patient, 'sr-Latn'))
                            .map((appointment) => (
                            <TableRow key={appointment.id}>
                              <TableCell className="font-medium text-sm whitespace-nowrap px-2">
                                {appointment.patient}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap px-2">{appointment.phone}</TableCell>
                              <TableCell className="px-2">
                                <Badge variant={appointment.doctorType === 'stomatolog' ? 'default' : 'secondary'} className="text-xs whitespace-nowrap">
                                  {appointment.doctorType === 'stomatolog' ? 'Stomatolog' : 'Ortodont'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm hidden sm:table-cell whitespace-nowrap px-2">
                                {SERVICE_NAMES_SR[appointment.serviceType]}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap px-2">
                                {formatDateDisplay(appointment.date)}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap px-2">{appointment.time}</TableCell>
                              <TableCell className="px-2">
                                {appointment.status === 'active' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => showDeleteConfirmation(appointment.id, `${appointment.patient} (${appointment.phone})`)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                      )}
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="table" className="flex-1 overflow-hidden mt-0">
                <div className="h-full flex flex-col">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Button onClick={() => {
                        setBookingError('');
                        setAvailableSlots([]);
                        setAvailableServices([]); // Reset available services
                        setBookingForm({
                          firstName: '',
                          lastName: '',
                          phone: '',
                          doctorType: '',
                          serviceType: '',
                          date: '',
                          time: '',
                        });
                        setDoctorTypeLocked(false);
                        setShowBookingForm(true);
                      }} size="sm">
                        <Calendar className="w-4 h-4 mr-2" />
                        Novi termin
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const prev = new Date(scheduleWeekStart);
                          prev.setDate(prev.getDate() - 7);
                          setScheduleWeekStart(prev);
                        }}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="font-medium text-sm whitespace-nowrap">
                        {formatDateDisplay(scheduleWeekStart.toISOString().split('T')[0])} - {
                          formatDateDisplay(new Date(scheduleWeekStart.getTime() + 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
                        }
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const next = new Date(scheduleWeekStart);
                          next.setDate(next.getDate() + 7);
                          setScheduleWeekStart(next);
                        }}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Raspored sa touch scroll */}
                  <div className="flex-1 overflow-x-auto pb-2 -mx-2 px-2">
                    <div className="flex gap-3 md:grid md:grid-cols-5 md:gap-3 min-w-max">
                      {getWeekDates().filter(d => {
                        const day = d.getDay();
                        return day >= 1 && day <= 5; // Only Mon-Fri
                      }).map((date) => {
                        const dateStr = date.toISOString().split('T')[0];
                        const dayOfWeek = date.getDay();
                        const daySlots = schedule[dateStr] || [];
                        
                        return (
                          <div key={dateStr} className="border rounded-lg overflow-hidden flex flex-col min-w-[200px] md:min-w-0 flex-shrink-0">
                            <div className="p-2 md:p-3 text-center font-medium bg-teal-100 text-teal-800 shrink-0">
                              <div className="text-sm font-semibold">{DAY_NAMES_SR[dayOfWeek]}</div>
                              <div className="text-base font-bold">{date.getDate()}.{date.getMonth() + 1}.</div>
                            </div>
                            
                            <div className="divide-y flex-1 overflow-y-auto max-h-[50vh]">
                              {daySlots.map((slot) => {
                                const isOrtodont = slot.doctorType === 'ortodont';
                                const isBlocked = slot.blocked;
                                
                                return (
                                  <div
                                    key={`${slot.time}-${slot.doctorType}`}
                                    className={`p-2 text-sm ${
                                      isBlocked
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : slot.appointment
                                          ? isOrtodont
                                            ? 'bg-purple-100 text-purple-800'
                                            : 'bg-teal-50 text-teal-800'
                                          : 'bg-white hover:bg-teal-50 hover:ring-1 hover:ring-teal-300 cursor-pointer'
                                    }`}
                                    onClick={() => {
                                      if (!isBlocked && !slot.appointment) {
                                        handleSlotClick(dateStr, slot.time, slot.doctorType);
                                      }
                                    }}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="font-mono text-sm">{slot.time}</span>
                                      {isOrtodont && !slot.appointment && !isBlocked && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5">O</Badge>
                                      )}
                                      {isBlocked && isOrtodont && (
                                        <Badge variant="secondary" className="text-[10px] px-1.5 bg-gray-300">O</Badge>
                                      )}
                                    </div>
                                    {slot.appointment && (
                                      <div className="mt-1">
                                        <div className="font-medium text-sm break-words">
                                          {slot.appointment.patient}
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                          <span className="text-xs text-gray-600">
                                            {slot.appointment.phone}
                                          </span>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 w-5 p-0"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              showDeleteConfirmation(slot.appointment!.id, slot.appointment!.patient);
                                            }}
                                          >
                                            <X className="w-3 h-3 text-red-500" />
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Booking form dialog */}
      <Dialog open={showBookingForm} onOpenChange={(open) => {
        setShowBookingForm(open);
        if (!open) {
          setDoctorTypeLocked(false);
        }
      }}>
        <DialogContent className="!max-w-[90vw] sm:!max-w-md max-h-[90vh] overflow-y-auto touch-pan-y">
          <DialogHeader>
            <DialogTitle>Zakazivanje termina</DialogTitle>
          </DialogHeader>
          
          {/* Prikaz izabranog termina */}
          {bookingForm.date && bookingForm.time && (
            <div className="bg-teal-50 rounded-lg p-3 mb-2">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span className="font-medium text-teal-800">
                  {bookingForm.date && (() => {
                    const d = new Date(bookingForm.date);
                    return `${DAY_NAMES_SR[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
                  })()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-1">
                <Clock className="w-4 h-4 text-teal-600" />
                <span className="font-medium text-teal-800">{bookingForm.time}</span>
                <Badge variant="outline" className="text-xs">
                  {bookingForm.doctorType === 'ortodont' ? 'Ortodont' : 'Stomatolog'}
                </Badge>
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Ime</Label>
                <Input
                  value={bookingForm.firstName}
                  onChange={(e) => setBookingForm({ ...bookingForm, firstName: e.target.value })}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-sm">Prezime</Label>
                <Input
                  value={bookingForm.lastName}
                  onChange={(e) => setBookingForm({ ...bookingForm, lastName: e.target.value })}
                  className="h-10"
                />
              </div>
            </div>
            <div>
              <Label className="text-sm">Telefon</Label>
              <Input
                value={bookingForm.phone}
                onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Doktor</Label>
                {doctorTypeLocked ? (
                  <div className="h-10 px-3 py-2 bg-slate-100 rounded-md text-sm font-medium flex items-center">
                    {bookingForm.doctorType === 'ortodont' ? 'Ortodont' : 'Stomatolog'}
                  </div>
                ) : (
                  <Select
                    value={bookingForm.doctorType}
                    onValueChange={(v) => setBookingForm({ ...bookingForm, doctorType: v, serviceType: '' })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Izaberi..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stomatolog">Stomatolog</SelectItem>
                      <SelectItem value="ortodont">Ortodont</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label className="text-sm">Usluga</Label>
                <Select
                  value={bookingForm.serviceType}
                  onValueChange={(v) => setBookingForm({ ...bookingForm, serviceType: v })}
                  disabled={!bookingForm.doctorType || availableServices.length === 0}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={availableServices.length === 0 && bookingForm.doctorType ? "Nema slobodnih usluga" : "Izaberi..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {bookingForm.doctorType === 'stomatolog' ? (
                      availableServices.length > 0 ? (
                        availableServices.map((service) => (
                          <SelectItem key={service} value={service}>
                            {SERVICE_NAMES_SR[service]} ({SERVICE_DURATIONS[bookingForm.doctorType as 'stomatolog' | 'ortodont']?.[service] || 30} min)
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="lecenje">Lečenje (60 min)</SelectItem>
                          <SelectItem value="popravka">Popravka (60 min)</SelectItem>
                          <SelectItem value="skidanje_kamenca">Skidanje kamenca (30 min)</SelectItem>
                          <SelectItem value="vadjenje_zuba">Vađenje zuba (30 min)</SelectItem>
                          <SelectItem value="konsultacija">Konsultacija (15 min)</SelectItem>
                        </>
                      )
                    ) : (
                      availableServices.length > 0 ? (
                        availableServices.map((service) => (
                          <SelectItem key={service} value={service}>
                            {SERVICE_NAMES_SR[service]} ({SERVICE_DURATIONS['ortodont']?.[service] || 30} min)
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="kontrola">Kontrola (15 min)</SelectItem>
                          <SelectItem value="lepljenje_proteze">Lepljenje proteze (45 min)</SelectItem>
                          <SelectItem value="skidanje_proteze">Skidanje proteze (45 min)</SelectItem>
                        </>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm">Datum</Label>
                <Input
                  type="date"
                  value={bookingForm.date}
                  onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value, time: '' })}
                  className="h-10"
                />
              </div>
              <div>
                <Label className="text-sm">Vreme</Label>
                <Select
                  value={bookingForm.time}
                  onValueChange={(v) => setBookingForm({ ...bookingForm, time: v })}
                  disabled={!bookingForm.date || !bookingForm.doctorType || !bookingForm.serviceType || availableSlots.length === 0}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={availableSlots.length === 0 && bookingForm.date && bookingForm.serviceType ? "Nema slobodnih termina" : "Izaberi..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlots.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {bookingError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {bookingError}
              </div>
            )}
            <Button onClick={handleCreateAppointment} className="w-full">
              Sačuvaj termin
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Otkazivanje termina</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600">
              Da li ste sigurni da želite da otkažete termin?
            </p>
            <p className="font-medium text-lg mt-2">
              {deleteConfirm?.patient}
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Ne
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteConfirm && handleCancelAppointment(deleteConfirm.id)}
            >
              Da, otkaži
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-slate-900 text-white py-3 mt-auto">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-xs sm:text-sm text-slate-400">
            © 2026 Ordinacija Ortodontic. Sva prava zadržana.
        </p>
        </div>
      </footer>
    </div>
  );
}

