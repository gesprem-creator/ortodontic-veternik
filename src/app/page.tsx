'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  MessageCircle, 
  Settings, 
  Send, 
  Bot, 
  User, 
  Loader2,
  Calendar,
  Clock,
  Phone,
  Stethoscope,
  Smile,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  X,
  LogIn,
  LogOut,
  Lock,
  Mail,
  Users,
  Search,
  MapPin
} from 'lucide-react'
import { toast } from 'sonner'

// ==================== TYPES ====================
interface QuickButton {
  text: string
  value: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  buttons?: QuickButton[]
  timeSlots?: string[] // Klikabilni vremenski slotovi
}

interface Appointment {
  id: string
  date: string
  timeSlot: string
  duration: number
  serviceType: string
  providerType: string
  status: string
  patientName: string
  patientPhone: string
  patientEmail: string | null
  notes: string | null
}

interface DayData {
  date: string
  dateStr: string
  dayName: string
  dayOfWeek: number
  appointments: Appointment[]
}

// Patient interface for directory
interface Patient {
  id: string
  name: string
  phone: string
  email: string | null
  notes: string | null
  visitCount: number
  lastVisit: string | null
  createdAt: string
}

// ==================== LOGIN COMPONENT ====================
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('Unesite email i lozinku')
      return
    }

    setIsLoading(true)
    try {
      // Koristi redirect umesto redirect: false za bolju kompatibilnost
      await signIn('credentials', {
        email,
        password,
        callbackUrl: window.location.href,
      })
    } catch {
      toast.error('Greška prilikom prijave')
      setIsLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <CardTitle className="text-xl">Admin Prijava</CardTitle>
          <CardDescription>Unesite svoje podatke za pristup admin panelu</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="email@primer.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Lozinka</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600" disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <LogIn className="w-4 h-4 mr-2" />
              )}
              Prijavi se
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// ==================== CHAT COMPONENT ====================

// Interface for session state - must match API
interface ChatSessionState {
  provider?: 'DENTIST' | 'ORTHODONTIST'
  serviceType?: string
  proposedDate?: string
  proposedTime?: string
  confirmed?: boolean
  timestamp?: number // Za proveru starosti stanja
}

// Pomoćna funkcija da proveri da li je stanje validno
function isValidSessionState(state: ChatSessionState | null): boolean {
  if (!state) return false
  
  // Ako nema provider, stanje je prazno ili nevalidno
  if (!state.provider) return false
  
  // Ako je confirmed ali nema datum/vreme - nevalidno!
  if (state.confirmed && (!state.proposedDate || !state.proposedTime)) return false
  
  // Ako je stanje starije od 1 sat - nevalidno
  if (state.timestamp) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000
    if (state.timestamp < oneHourAgo) return false
  }
  
  return true
}

function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionState, setSessionState] = useState<ChatSessionState>({})
  const sessionStateRef = useRef<ChatSessionState>({}) // UVEK ažurno stanje!
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSendTimeRef = useRef<number>(0) // Za debouncing

  // Definiši početne dugmiće za izbor doktora
  const initialButtons: QuickButton[] = [
    { text: '🦷 Stomatolog', value: 'Stomatolog' },
    { text: '😁 Ortodont', value: 'Ortodont' },
  ]

  useEffect(() => {
    // Load session state from localStorage
    const savedState = localStorage.getItem('chatSessionState')
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState)
        console.log('🔄 Loaded saved session state:', parsed)
        
        // PROVERI DA LI JE STANJE VALIDNO!
        if (isValidSessionState(parsed)) {
          console.log('✅ State is valid, using it')
          setSessionState(parsed)
          sessionStateRef.current = parsed
        } else {
          // Obriši nevalidno stanje
          console.log('❌ State is invalid or expired, clearing it')
          localStorage.removeItem('chatSessionState')
          setSessionState({})
          sessionStateRef.current = {}
        }
      } catch {
        console.log('⚠️ Could not parse saved session state, clearing')
        localStorage.removeItem('chatSessionState')
      }
    }
    
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: `🦷 **Dobar dan! Ja sam AI asistent stomatološke ordinacije "Ortodontic" iz Veternika.**

Da li želite da zakažete kod stomatologa ili ortodonta?`,
        timestamp: new Date(),
        buttons: initialButtons,
      },
    ])
  }, [])

  useEffect(() => {
    // Skroluj na dole kada se poruke promene
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  const sendMessage = async (messageText?: string) => {
    const textToSend = messageText || input.trim()
    
    // DEBUG: Prvi alert - da li se funkcija poziva?
    alert('1. sendMessage pozvan sa: ' + textToSend)
    
    if (!textToSend) return
    
    // DEBOUNCE - spreči duplo slanje u roku od 500ms
    const now = Date.now()
    if (now - lastSendTimeRef.current < 500) {
      console.log('⛔ Debounced - too soon!')
      return
    }
    lastSendTimeRef.current = now
    
    if (isLoading) return

    // Postavi loading odmah
    setIsLoading(true)
    
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: textToSend,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')

    try {
      // Koristi ref umesto localStorage - ref je UVEK ažuran!
      // Ako je ref prazan, pokušaj da pročitaš iz localStorage kao fallback
      let currentState: ChatSessionState = sessionStateRef.current
      
      // Ako je ref prazan, pokušaj iz localStorage
      if (!currentState.provider) {
        try {
          const savedState = localStorage.getItem('chatSessionState')
          if (savedState) {
            const parsed = JSON.parse(savedState)
            if (isValidSessionState(parsed)) {
              currentState = parsed
              sessionStateRef.current = parsed // Ažuriraj ref
            }
          }
        } catch (e) {
          console.log('⚠️ Could not read localStorage')
        }
      }
      
      console.log('📤 Sending message with state:', currentState)
      
      // ALERT pre slanja
      alert('Šaljem:\n' + JSON.stringify({ message: textToSend, clientState: currentState }, null, 2))
      
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          clientState: currentState, // Koristi ref umesto state!
        }),
      })

      const data = await response.json()

      // Debug logovanje
      console.log('📥 API Response:', data)
      console.log('📊 New state:', data.state)
      
      // DEBUG: Logovanje na mobilnom (bez alert-a koji blokira UI)
      console.log('📱 Mobile debug - state received:', data.state)

      if (data.success) {
        // SAČUVAJ novo stanje iz odgovora!
        if (data.state) {
          console.log('💾 Saving state:', data.state)
          setSessionState(data.state)
          sessionStateRef.current = data.state
          localStorage.setItem('chatSessionState', JSON.stringify(data.state))
          
          // ALERT za debug na mobilnom
          alert('Server vratio:\n' + JSON.stringify(data.state, null, 2))
        }
        
        // Parsiraj dugmiće iz odgovora ako postoje
        let buttons: QuickButton[] | undefined = undefined
        let timeSlots: string[] | undefined = undefined
        let content = data.response || 'Greška: Nema odgovora'
        const lowerResponse = (data.response || '').toLowerCase()
        
        // Ako API vrati timeSlots, koristi ih za klikabilne dugmiće
        if (data.timeSlots && data.timeSlots.length > 0) {
          timeSlots = data.timeSlots
        }
        
        // Detektuj koje dugmiće prikazati na osnovu sadržaja
        // Za stomatologa - popravka ili lečenje
        if ((lowerResponse.includes('popravk') && lowerResponse.includes('lečenje')) || 
            (lowerResponse.includes('popravk') && lowerResponse.includes('lečenj'))) {
          buttons = [
            { text: '🔧 Popravka zuba', value: 'Popravka' },
            { text: '💊 Lečenje zuba', value: 'Lečenje' },
          ]
        }
        // Za ortodonta - kontrola, lepljenje, skidanje
        else if (lowerResponse.includes('kontrol') && (lowerResponse.includes('lepljenje') || lowerResponse.includes('skidanje'))) {
          buttons = [
            { text: '✅ Kontrola', value: 'Kontrola' },
            { text: '🔗 Lepljenje proteze', value: 'Lepljenje proteze' },
            { text: '🔓 Skidanje proteze', value: 'Skidanje proteze' },
          ]
        }
        // Potvrda termina - Da/Ne
        else if (lowerResponse.includes('da li vam odgovara') || lowerResponse.includes('odgovara ovaj termin')) {
          buttons = [
            { text: '✅ Da', value: 'Da' },
            { text: '❌ Ne', value: 'Ne' },
          ]
        }
        // Početni izbor - stomatolog ili ortodont
        else if (lowerResponse.includes('stomatolog') && lowerResponse.includes('ortodont') && lowerResponse.includes('želite da zakažete')) {
          buttons = [
            { text: '🦷 Stomatolog', value: 'Stomatolog' },
            { text: '😁 Ortodont', value: 'Ortodont' },
          ]
        }
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: content,
          timestamp: new Date(),
          buttons,
          timeSlots,
        }
        setMessages(prev => [...prev, assistantMessage])
      } else {
        toast.error(data.error || 'Greška prilikom slanja poruke')
      }
    } catch (error) {
      alert('GREŠKA: ' + error)
      toast.error('Greška prilikom komunikacije sa serverom')
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleButtonClick = (button: QuickButton) => {
    sendMessage(button.value)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const formatMessage = (content: string) => {
    if (!content || typeof content !== 'string') return ''
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[500px]">
      <div className="flex items-center gap-3 p-4 border-b bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 text-white">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold">AI Asistent</h2>
          <p className="text-sm text-muted-foreground">Zakažite termin u par koraka</p>
        </div>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {message.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-emerald-500 text-white rounded-br-md'
                    : 'bg-muted rounded-bl-md'
                }`}
              >
                <div
                  className="text-sm whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                />
                <div
                  className={`text-xs mt-1 ${
                    message.role === 'user' ? 'text-emerald-100' : 'text-muted-foreground'
                  }`}
                >
                  {message.timestamp.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })}
                </div>
                {/* Quick Reply Buttons */}
                {message.role === 'assistant' && message.buttons && message.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {message.buttons.map((button, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => handleButtonClick(button)}
                        disabled={isLoading}
                        className="rounded-full border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 text-emerald-700 dark:border-emerald-600 dark:hover:bg-emerald-950 dark:text-emerald-300"
                      >
                        {button.text}
                      </Button>
                    ))}
                  </div>
                )}
                {/* Time Slot Buttons */}
                {message.role === 'assistant' && message.timeSlots && message.timeSlots.length > 0 && (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mt-3">
                    {message.timeSlots.map((slot, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          console.log('🖱️ Slot clicked:', slot)
                          sendMessage(slot)
                        }}
                        disabled={isLoading}
                        className="rounded-lg border-emerald-300 hover:bg-emerald-50 hover:border-emerald-400 text-emerald-700 dark:border-emerald-600 dark:hover:bg-emerald-950 dark:text-emerald-300 font-mono touch-manipulation"
                      >
                        {slot}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </div>
              <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
            </div>
          )}
          {/* Element za skrolovanje na dno */}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        {/* Debug panel - privremeno za testiranje */}
        <div className="mb-2 p-2 bg-yellow-100 dark:bg-yellow-900 rounded text-xs font-mono overflow-x-auto">
          <div className="font-bold">DEBUG:</div>
          <div>provider: {sessionState.provider || 'nema'}</div>
          <div>serviceType: {sessionState.serviceType || 'nema'}</div>
          <div>proposedDate: {sessionState.proposedDate || 'nema'}</div>
          <div>proposedTime: {sessionState.proposedTime || 'nema'}</div>
          <div>confirmed: {sessionState.confirmed ? 'DA' : 'ne'}</div>
          <Button 
            variant="destructive" 
            size="sm" 
            className="h-6 text-xs px-2 mt-1"
            onClick={() => {
              localStorage.removeItem('chatSessionState')
              setSessionState({})
              sessionStateRef.current = {}
              alert('State reset!')
            }}
          >
            Reset
          </Button>
        </div>
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ukucajte vašu poruku..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            className="bg-emerald-500 hover:bg-emerald-600"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ==================== PATIENT DIRECTORY COMPONENT ====================
function PatientDirectory() {
  const [patients, setPatients] = useState<Patient[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null)

  const fetchPatients = async (searchTerm?: string) => {
    setIsLoading(true)
    try {
      const url = searchTerm 
        ? `/api/patients?search=${encodeURIComponent(searchTerm)}`
        : '/api/patients'
      const response = await fetch(url)
      const data = await response.json()
      if (data.success) {
        setPatients(data.patients)
      }
    } catch {
      toast.error('Greška prilikom dohvatanja pacijenata')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPatients()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== undefined) {
        fetchPatients(search)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleDeletePatient = async (id: string) => {
    if (!confirm('Da li ste sigurni da želite da obrišete ovog pacijenta?')) return
    
    try {
      const response = await fetch(`/api/patients/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        toast.success('Pacijent obrisan')
        setPatients(patients.filter(p => p.id !== id))
        setSelectedPatient(null)
      }
    } catch {
      toast.error('Greška prilikom brisanja')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('sr-RS')
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-semibold">Imenik pacijenata</h2>
          <p className="text-sm text-muted-foreground">
            Ukupno pacijenata: {patients.length}
          </p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pretraga po imenu ili telefonu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Patient List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      ) : patients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p>Nema pronađenih pacijenata</p>
            {search && <p className="text-sm mt-2">Pokušajte sa drugačijom pretragom</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y max-h-[600px] overflow-y-auto">
              {patients.map((patient) => (
                <div 
                  key={patient.id} 
                  className="flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedPatient(selectedPatient?.id === patient.id ? null : patient)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                        {patient.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium">{patient.name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <Phone className="w-3 h-3" />
                        {patient.phone}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">Poseta: {patient.visitCount}</div>
                      <div className="text-xs text-muted-foreground">
                        Poslednja: {formatDate(patient.lastVisit)}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletePatient(patient.id)
                      }}
                      title="Obriši"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Patient Details Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedPatient(null)}>
          <Card className="w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>Detalji pacijenta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                  <span className="text-2xl text-emerald-700 dark:text-emerald-300 font-medium">
                    {selectedPatient.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-lg">{selectedPatient.name}</div>
                  <div className="text-muted-foreground">Pacijent</div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{selectedPatient.phone}</span>
                </div>
                {selectedPatient.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span>{selectedPatient.email}</span>
                  </div>
                )}
                {selectedPatient.notes && (
                  <div className="pt-2">
                    <div className="text-sm text-muted-foreground mb-1">Napomene:</div>
                    <div className="text-sm bg-muted p-2 rounded">{selectedPatient.notes}</div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 pt-4 border-t text-sm text-muted-foreground">
                <div>Broj poseta: <strong>{selectedPatient.visitCount}</strong></div>
                <div>Poslednja: <strong>{formatDate(selectedPatient.lastVisit)}</strong></div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setSelectedPatient(null)}
                >
                  Zatvori
                </Button>
                <Button 
                  variant="destructive" 
                  className="flex-1" 
                  onClick={() => handleDeletePatient(selectedPatient.id)}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Obriši
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// ==================== ADMIN COMPONENT - WITH TWO VIEWS ====================
function AdminPanel() {
  const { data: session } = useSession()
  const [adminTab, setAdminTab] = useState<'raspored' | 'imenik'>('raspored')
  const [weekData, setWeekData] = useState<DayData[]>([])
  const [startDate, setStartDate] = useState<Date>(() => {
    const d = new Date()
    const day = d.getDay()
    if (day === 0) d.setDate(d.getDate() + 1)
    else if (day > 1) d.setDate(d.getDate() - (day - 1))
    return d
  })
  const [isLoading, setIsLoading] = useState(true)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<{date: string, time: string, dayOfWeek: number, isOrtho: boolean} | null>(null)
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table')
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const listScrollRef = useRef<HTMLDivElement>(null)

  // Funkcije za horizontalno skrolovanje
  const scrollLeft = () => {
    if (viewMode === 'table' && scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    } else if (listScrollRef.current) {
      listScrollRef.current.scrollBy({ left: -200, behavior: 'smooth' })
    }
  }
  
  const scrollRight = () => {
    if (viewMode === 'table' && scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    } else if (listScrollRef.current) {
      listScrollRef.current.scrollBy({ left: 200, behavior: 'smooth' })
    }
  }

  const [formData, setFormData] = useState({
    serviceType: '',
    date: '',
    timeSlot: '',
    patientName: '',
    patientPhone: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Generisanje vremenskih slotova - ISPRAVNO
  const generateTimeSlots = () => {
    const slots: { time: string; isOrtho: boolean }[] = []
    
    // Stomatolog: 14:00-21:00 (30 min slotovi) za Pon-Čet
    // Stomatolog: 14:00-18:00 (30 min slotovi) za Petak
    for (let h = 14; h < 21; h++) {
      slots.push({ time: `${h.toString().padStart(2, '0')}:00`, isOrtho: false })
      slots.push({ time: `${h.toString().padStart(2, '0')}:30`, isOrtho: false })
    }
    
    // Ortodont Petak: 18:00-21:30 (15 min slotovi)
    for (let h = 18; h < 21; h++) {
      slots.push({ time: `${h.toString().padStart(2, '0')}:00`, isOrtho: true })
      slots.push({ time: `${h.toString().padStart(2, '0')}:15`, isOrtho: true })
      slots.push({ time: `${h.toString().padStart(2, '0')}:30`, isOrtho: true })
      slots.push({ time: `${h.toString().padStart(2, '0')}:45`, isOrtho: true })
    }
    // Zadnji slotovi za ortodonta
    slots.push({ time: '21:00', isOrtho: true })
    slots.push({ time: '21:15', isOrtho: true })
    
    // Sortiraj po vremenu
    slots.sort((a, b) => a.time.localeCompare(b.time))
    
    // Ukloni duplikate (npr. 18:00, 18:30 postoje i za stomatologa i za ortodonta)
    const uniqueSlots: { time: string; isOrtho: boolean }[] = []
    const seen = new Set<string>()
    
    for (const slot of slots) {
      const key = `${slot.time}_${slot.isOrtho}`
      if (!seen.has(key)) {
        seen.add(key)
        uniqueSlots.push(slot)
      }
    }
    
    return uniqueSlots.sort((a, b) => {
      if (a.time === b.time) {
        return a.isOrtho ? 1 : -1 // Stomatolog prvo, pa ortodont
      }
      return a.time.localeCompare(b.time)
    })
  }

  const timeSlots = generateTimeSlots()

  const fetchWeekData = async () => {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/appointments?startDate=${startDate.toISOString()}`)
      const data = await response.json()
      if (data.success) {
        setWeekData(data.weekData)
      }
    } catch {
      toast.error('Greška prilikom dohvatanja termina')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchWeekData()
  }, [startDate])

  // Mapa termina za brzo pronalaženje
  const getAppointmentMap = () => {
    const map = new Map<string, Appointment>()
    weekData.forEach(day => {
      day.appointments.forEach(apt => {
        const key = `${day.dateStr}_${apt.timeSlot}`
        map.set(key, apt)
      })
    })
    return map
  }

  const appointmentMap = getAppointmentMap()

  // Pronađi dan iz weekData po dayOfWeek
  const getDayByIndex = (index: number): DayData | undefined => {
    const dayOfWeek = index + 1
    return weekData.find(d => d.dayOfWeek === dayOfWeek)
  }

  // Funkcija za računanje koliko slotova zauzima termin
  const getSlotCount = (duration: number, isOrtho: boolean): number => {
    if (isOrtho) {
      // Ortodont: 15 min slotovi
      return Math.ceil(duration / 15)
    } else {
      // Stomatolog: 30 min slotovi
      return Math.ceil(duration / 30)
    }
  }

  // Funkcija koja proverava da li je slot pokriven trajanjem prethodnog termina
  const getCoveringAppointment = (dateStr: string, time: string, isOrtho: boolean): Appointment | null => {
    const currentMinutes = parseInt(time.split(':')[0]) * 60 + parseInt(time.split(':')[1])
    
    for (const [key, apt] of appointmentMap.entries()) {
      // Proveri da li je isti dan
      const aptDateStr = key.split('_')[0]
      if (aptDateStr !== dateStr) continue
      
      // Proveri da li je isti tip pruzioca (stomatolog vs ortodont)
      const aptIsOrtho = apt.providerType === 'ORTHODONTIST'
      if (aptIsOrtho !== isOrtho) continue
      
      const aptMinutes = parseInt(apt.timeSlot.split(':')[0]) * 60 + parseInt(apt.timeSlot.split(':')[1])
      const aptEndMinutes = aptMinutes + apt.duration
      
      // Ako je trenutno vreme između početka i kraja termina (ali nije početak)
      if (currentMinutes > aptMinutes && currentMinutes < aptEndMinutes) {
        return apt
      }
    }
    return null
  }

  const handleSlotClick = (date: string, time: string, dayOfWeek: number, isOrtho: boolean, coveredApt?: Appointment | null) => {
    const key = `${date}_${time}`
    const existingApt = appointmentMap.get(key)
    
    // Ako je slot pokriven drugim terminom, prikaži taj termin
    if (coveredApt) {
      if (confirm(`Termin: ${coveredApt.patientName} (${coveredApt.patientPhone})\nVreme: ${coveredApt.timeSlot} (${coveredApt.duration} min)\n\nDa li želite da obrišete termin?`)) {
        handleDeleteAppointment(coveredApt.id)
      }
      return
    }
    
    if (existingApt) {
      if (confirm(`Termin: ${existingApt.patientName} (${existingApt.patientPhone})\n\nDa li želite da obrišete termin?`)) {
        handleDeleteAppointment(existingApt.id)
      }
    } else {
      setSelectedSlot({ date, time, dayOfWeek, isOrtho })
      setFormData({
        serviceType: isOrtho ? 'ORTHO_CHECKUP' : 'REPAIR',
        date: date.split('.').reverse().join('-'),
        timeSlot: time,
        patientName: '',
        patientPhone: '',
      })
      setShowBookingModal(true)
    }
  }

  const handleCreateAppointment = async () => {
    if (!formData.serviceType || !formData.date || !formData.timeSlot || !formData.patientName || !formData.patientPhone) {
      toast.error('Molimo popunite sva obavezna polja')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await response.json()
      if (data.success) {
        toast.success('Termin uspešno zakazan!')
        setShowBookingModal(false)
        setSelectedSlot(null)
        fetchWeekData()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Greška prilikom zakazivanja')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteAppointment = async (id: string) => {
    try {
      const response = await fetch(`/api/appointments/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        toast.success('Termin obrisan')
        fetchWeekData()
      }
    } catch {
      toast.error('Greška prilikom brisanja')
    }
  }

  const handleCancelAppointment = async (id: string) => {
    if (!confirm('Da li ste sigurni da želite da otkažete termin?')) return
    try {
      const response = await fetch(`/api/appointments/${id}`, { method: 'PATCH' })
      const data = await response.json()
      if (data.success) {
        toast.success('Termin otkazan')
        fetchWeekData()
      }
    } catch {
      toast.error('Greška prilikom otkazivanja')
    }
  }

  const serviceNames: Record<string, string> = {
    REPAIR: 'Popravka',
    TREATMENT: 'Lečenje',
    ORTHO_CHECKUP: 'Kontrola',
    ORTHO_BONDING: 'Lepljenje',
    ORTHO_REMOVAL: 'Skidanje',
  }

  const serviceColors: Record<string, string> = {
    REPAIR: 'bg-blue-500 text-white',
    TREATMENT: 'bg-purple-500 text-white',
    ORTHO_CHECKUP: 'bg-green-500 text-white',
    ORTHO_BONDING: 'bg-orange-500 text-white',
    ORTHO_REMOVAL: 'bg-pink-500 text-white',
  }

  const serviceColorsLight: Record<string, string> = {
    REPAIR: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    TREATMENT: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    ORTHO_CHECKUP: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    ORTHO_BONDING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    ORTHO_REMOVAL: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  }

  const statusColors: Record<string, string> = {
    SCHEDULED: 'bg-emerald-100 text-emerald-800',
    COMPLETED: 'bg-gray-100 text-gray-800',
    CANCELLED: 'bg-red-100 text-red-800',
    NO_SHOW: 'bg-yellow-100 text-yellow-800',
  }

  const statusNames: Record<string, string> = {
    SCHEDULED: 'Zakazan',
    COMPLETED: 'Završen',
    CANCELLED: 'Otkazan',
    NO_SHOW: 'Nije došao',
  }

  // Da li je slot validan za dati dan - ISPRAVNO
  const isValidSlot = (time: string, isOrtho: boolean, dayOfWeek: number) => {
    const [hourStr, minStr] = time.split(':')
    const hour = parseInt(hourStr)
    const min = parseInt(minStr)
    const isFriday = dayOfWeek === 5
    
    if (isFriday) {
      if (isOrtho) {
        // Ortodont petak 18:00-21:30 (15 min slotovi)
        if (hour < 18 || hour > 21) return false
        if (hour === 21 && min > 15) return false
        return true
      } else {
        // Stomatolog petak 14:00-18:00 (30 min slotovi)
        if (hour < 14 || hour >= 18) return false
        return min === 0 || min === 30
      }
    } else {
      // Ponedeljak-Četvrtak: samo stomatolog 14:00-21:00
      if (isOrtho) return false
      if (hour < 14 || hour >= 21) return false
      return min === 0 || min === 30
    }
  }

  const days = ['Ponedeljak', 'Utorak', 'Sreda', 'Četvrtak', 'Petak']

  // ==================== TABLE VIEW ====================
  const TableView = () => {
    // Pratimo koje ćelije treba da se preskoče zbog rowspan
    const skipCells = new Set<string>()
    
    return (
      <Card className="overflow-hidden">
        {/* Scroll dugmići za mobilni */}
        <div className="flex items-center justify-between px-2 py-2 bg-muted/50 sm:hidden">
          <Button variant="outline" size="sm" onClick={scrollLeft} className="h-8 w-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground">← Skroluj za više →</span>
          <Button variant="outline" size="sm" onClick={scrollRight} className="h-8 w-8 p-0">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="overflow-x-auto" ref={scrollContainerRef}>
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-muted">
                <th className="border p-2 text-center w-20 bg-gray-100 dark:bg-gray-800">
                  <Clock className="w-4 h-4 mx-auto" />
                </th>
                {days.map((day, idx) => {
                  const dayData = getDayByIndex(idx)
                  const isFriday = idx === 4
                  return (
                    <th key={day} className={`border p-2 text-center ${isFriday ? 'bg-orange-50 dark:bg-orange-950' : 'bg-emerald-50 dark:bg-emerald-950'}`}>
                      <div className="font-semibold">{day}</div>
                      <div className="text-xs text-muted-foreground">
                        {dayData?.dateStr || ''}
                      </div>
                      <div className="text-xs mt-1">
                        {isFriday ? (
                          <span className="text-purple-600">Stom: 14-18h • Ort: 18-21:30h</span>
                        ) : (
                          <span className="text-emerald-600">Stomatolog: 14-21h</span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot, slotIndex) => {
                const { time, isOrtho } = slot
                
                // Proveri da li bar jedan dan prikazuje ovaj slot
                let showRow = false
                for (let i = 0; i < 5; i++) {
                  if (isValidSlot(time, isOrtho, i + 1)) {
                    showRow = true
                    break
                  }
                }
                if (!showRow) return null
                
                return (
                  <tr key={`${time}_${isOrtho}`} className={`hover:bg-muted/50 ${isOrtho ? 'bg-purple-50/30 dark:bg-purple-950/30' : ''}`}>
                    <td className="border p-1 text-center text-sm font-mono bg-gray-50 dark:bg-gray-900 whitespace-nowrap">
                      {time}
                      {isOrtho && <span className="text-purple-500 text-xs ml-1">O</span>}
                    </td>
                    {[0, 1, 2, 3, 4].map((dayIdx) => {
                      const dayOfWeek = dayIdx + 1
                      const dayData = getDayByIndex(dayIdx)
                      const dateStr = dayData?.dateStr || ''
                      const isFriday = dayIdx === 4
                      const cellKey = `${dayIdx}_${time}_${isOrtho}`
                      
                      // Ako je ova ćelija obeležena za preskakanje, ne renderuj je
                      if (skipCells.has(cellKey)) {
                        return null
                      }
                      
                      if (!isValidSlot(time, isOrtho, dayOfWeek)) {
                        return (
                          <td key={dayIdx} className="border p-0 bg-gray-200 dark:bg-gray-800">
                            <div className="h-10"></div>
                          </td>
                        )
                      }
                      
                      const key = `${dateStr}_${time}`
                      const apt = appointmentMap.get(key)
                      
                      // Ako postoji termin, izračunaj rowspan
                      if (apt) {
                        const slotCount = getSlotCount(apt.duration, isOrtho)
                        const rowSpan = slotCount
                        
                        // Obeleži naredne ćelije za preskakanje
                        for (let i = 1; i < rowSpan; i++) {
                          const nextSlot = timeSlots[slotIndex + i]
                          if (nextSlot && nextSlot.isOrtho === isOrtho) {
                            skipCells.add(`${dayIdx}_${nextSlot.time}_${isOrtho}`)
                          }
                        }
                        
                        const cellHeight = rowSpan * 40 // 40px po redu
                        
                        return (
                          <td 
                            key={dayIdx} 
                            rowSpan={rowSpan}
                            className={`border p-0 cursor-pointer transition-colors ${isFriday && isOrtho ? 'bg-purple-50/50 dark:bg-purple-950/50' : ''}`}
                            onClick={() => handleSlotClick(dateStr, time, dayOfWeek, isOrtho)}
                          >
                            <div 
                              className={`p-1 flex flex-col justify-center ${serviceColors[apt.serviceType]}`}
                              style={{ minHeight: `${cellHeight}px` }}
                            >
                              <div className="text-xs font-medium truncate">{apt.patientName}</div>
                              <div className="text-xs truncate">{apt.patientPhone}</div>
                              <div className="text-xs opacity-75 mt-1">{apt.duration} min</div>
                            </div>
                          </td>
                        )
                      }
                      
                      // Proveri da li je slot pokriven drugim terminom
                      const coveringApt = getCoveringAppointment(dateStr, time, isOrtho)
                      if (coveringApt) {
                        return (
                          <td 
                            key={dayIdx} 
                            className={`border p-0 cursor-pointer ${serviceColors[coveringApt.serviceType]} opacity-60`}
                            onClick={() => handleSlotClick(dateStr, time, dayOfWeek, isOrtho, coveringApt)}
                          >
                            <div className="h-10 flex items-center justify-center">
                              <span className="text-xs opacity-75">zauzeto</span>
                            </div>
                          </td>
                        )
                      }
                      
                      // Prazan slot
                      return (
                        <td 
                          key={dayIdx} 
                          className={`border p-0 cursor-pointer transition-colors ${isFriday && isOrtho ? 'bg-purple-50/50 dark:bg-purple-950/50' : ''}`}
                          onClick={() => handleSlotClick(dateStr, time, dayOfWeek, isOrtho)}
                        >
                          <div className="h-10 flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors">
                            <Plus className="w-4 h-4 text-muted-foreground opacity-50 hover:opacity-100" />
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    )
  }

  // ==================== LIST VIEW ====================
  const ListView = () => (
    <div className="space-y-2">
      {/* Scroll dugmići za mobilni */}
      <div className="flex items-center justify-between px-2 py-2 bg-muted/50 rounded-md sm:hidden">
        <Button variant="outline" size="sm" onClick={scrollLeft} className="h-8 w-8 p-0">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs text-muted-foreground">← Skroluj za više →</span>
        <Button variant="outline" size="sm" onClick={scrollRight} className="h-8 w-8 p-0">
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="overflow-x-auto" ref={listScrollRef}>
        <div className="grid gap-4 min-w-[700px]">
          {weekData.map((day, index) => {
            const dayOfWeek = day.dayOfWeek
            if (dayOfWeek === 0 || dayOfWeek === 6) return null
            const isFriday = dayOfWeek === 5

            return (
              <Card key={index} className="overflow-hidden">
                <CardHeader className={`py-3 ${isFriday ? 'bg-orange-50 dark:bg-orange-950' : 'bg-emerald-50 dark:bg-emerald-950'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-emerald-600" />
                      <div>
                        <CardTitle className="text-base">{day.dayName}</CardTitle>
                        <CardDescription className="text-xs">{day.dateStr}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {isFriday ? (
                        <>
                          <Badge variant="outline" className="text-orange-600 border-orange-300">Stomatolog: 14-18h</Badge>
                          <Badge variant="outline" className="text-purple-600 border-purple-300">Ortodont: 18-21:30h</Badge>
                        </>
                      ) : (
                        <Badge variant="outline" className="text-emerald-600 border-emerald-300">Stomatolog: 14-21h</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {day.appointments.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Clock className="w-4 h-4 mr-2" />
                      Nema zakazanih termina
                    </div>
                  ) : (
                    <div className="divide-y">
                      {day.appointments.map((apt) => (
                        <div key={apt.id} className="flex items-center justify-between p-3 hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            <div className="text-sm font-mono font-medium w-16">{apt.timeSlot}</div>
                            <Badge className={serviceColorsLight[apt.serviceType]}>{serviceNames[apt.serviceType]}</Badge>
                            <Badge variant="outline" className="text-xs">{apt.duration} min</Badge>
                            <Badge className={statusColors[apt.status]}>{statusNames[apt.status]}</Badge>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-sm font-medium">{apt.patientName}</div>
                              <div className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {apt.patientPhone}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" onClick={() => handleCancelAppointment(apt.id)} title="Otkaži">
                                <X className="w-4 h-4 text-orange-500" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteAppointment(apt.id)} title="Obriši">
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Admin Inner Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setAdminTab('raspored')}
          className={`px-6 py-3 font-medium transition-colors ${
            adminTab === 'raspored' 
              ? 'border-b-2 border-emerald-500 text-emerald-600' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          Raspored
        </button>
        <button
          onClick={() => setAdminTab('imenik')}
          className={`px-6 py-3 font-medium transition-colors ${
            adminTab === 'imenik' 
              ? 'border-b-2 border-emerald-500 text-emerald-600' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="w-4 h-4 inline mr-2" />
          Imenik
        </button>
      </div>

      {adminTab === 'imenik' ? (
        <PatientDirectory />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-xl font-semibold">Raspored termina</h2>
              <p className="text-sm text-muted-foreground">
                Prijavljen: {session?.user?.email}
              </p>
            </div>
            <div className="flex gap-2">
              {/* View Toggle */}
              <div className="flex border rounded-md overflow-hidden">
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className={viewMode === 'table' ? 'bg-emerald-500 hover:bg-emerald-600 rounded-none' : 'rounded-none'}
                >
                  Tabela
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className={viewMode === 'list' ? 'bg-emerald-500 hover:bg-emerald-600 rounded-none' : 'rounded-none'}
                >
                  Lista
                </Button>
              </div>
              <Button variant="outline" onClick={() => signOut()}>
                <LogOut className="w-4 h-4 mr-2" />
                Odjavi se
              </Button>
            </div>
          </div>

          {/* Navigacija kroz nedelje */}
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <Button variant="outline" size="sm" onClick={() => {
                const newDate = new Date(startDate)
                newDate.setDate(newDate.getDate() - 7)
                setStartDate(newDate)
              }}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-center">
                <div className="font-medium">
                  {startDate.toLocaleDateString('sr-RS', { month: 'long', year: 'numeric' })}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => {
                const newDate = new Date(startDate)
                newDate.setDate(newDate.getDate() + 7)
                setStartDate(newDate)
              }}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
      ) : (
        <>
          {viewMode === 'table' ? <TableView /> : <ListView />}
        </>
      )}

      {/* Legenda - samo za tabelu */}
      {viewMode === 'table' && (
        <Card>
          <CardContent className="flex flex-wrap gap-4 p-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-sm">Popravka (60 min)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-500 rounded"></div>
              <span className="text-sm">Lečenje (60 min)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-sm">Kontrola (15 min)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded"></div>
              <span className="text-sm">Lepljenje (45 min)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-pink-500 rounded"></div>
              <span className="text-sm">Skidanje (45 min)</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-4 h-4 bg-purple-100 border rounded"></div>
              <span className="text-sm">Ortodont (Petak 18-21:30)</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal za zakazivanje */}
      {showBookingModal && selectedSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Zakaži termin</CardTitle>
              <CardDescription>
                {selectedSlot.date} u {selectedSlot.time}
                {selectedSlot.isOrtho && ' (Ortodont)'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Usluga *</label>
                <select
                  className="w-full p-2 border rounded-md bg-background"
                  value={formData.serviceType}
                  onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                >
                  {selectedSlot.isOrtho ? (
                    <>
                      <option value="ORTHO_CHECKUP">Kontrola (15 min)</option>
                      <option value="ORTHO_BONDING">Lepljenje fiksne (45 min)</option>
                      <option value="ORTHO_REMOVAL">Skidanje fiksne (45 min)</option>
                    </>
                  ) : (
                    <>
                      <option value="REPAIR">Popravka zuba (60 min)</option>
                      <option value="TREATMENT">Lečenje zuba (60 min)</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Ime pacijenta *</label>
                <Input 
                  value={formData.patientName} 
                  onChange={(e) => setFormData({ ...formData, patientName: e.target.value })} 
                  placeholder="Ime i prezime" 
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Telefon *</label>
                <Input 
                  value={formData.patientPhone} 
                  onChange={(e) => setFormData({ ...formData, patientPhone: e.target.value })} 
                  placeholder="0612345678" 
                />
              </div>

              <div className="flex gap-2 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => {
                    setShowBookingModal(false)
                    setSelectedSlot(null)
                  }}
                >
                  Otkaži
                </Button>
                <Button 
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600" 
                  onClick={handleCreateAppointment} 
                  disabled={isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Zakaži'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ==================== MAIN PAGE ====================
export default function Home() {
  const { data: session, status } = useSession()
  const [activeTab, setActiveTab] = useState('chat')

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/50 to-white dark:from-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 text-white">
                <Smile className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Ortodontic Veternik</h1>
                <p className="text-xs text-muted-foreground">Stomatološka ordinacija</p>
              </div>
            </div>
            
            {/* Kontakt info - mobilni prikaz */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-sm">
              {/* Telefoni */}
              <a 
                href="tel:021821467" 
                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                <Phone className="w-3.5 h-3.5" />
                <span className="font-medium">021/821-467</span>
              </a>
              <a 
                href="tel:0642503304" 
                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700 hover:underline"
              >
                <Phone className="w-3.5 h-3.5" />
                <span className="font-medium">064/250-3304</span>
              </a>
              
              {/* Adresa */}
              <a 
                href="https://www.google.com/maps?q=Ive+Andrica+1,+21205+Veternik" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-gray-600 hover:text-gray-800 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
              >
                <MapPin className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ive Andrića 1, Veternik</span>
                <span className="sm:hidden">Lokacija</span>
              </a>
            </div>
            
            {/* Radno vreme - desktop */}
            <div className="hidden lg:flex items-center gap-2">
              <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                <Clock className="w-3 h-3 mr-1" />
                Pon-Čet: 14-21h
              </Badge>
              <Badge variant="outline" className="text-purple-600 border-purple-300">
                <Stethoscope className="w-3 h-3 mr-1" />
                Ortodont: Petak 18-21:30h
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
          <TabsList className="mb-4">
            <TabsTrigger value="chat" className="gap-2">
              <MessageCircle className="w-4 h-4" />
              AI Asistent
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-2">
              <Settings className="w-4 h-4" />
              Admin Panel
            </TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="mt-0">
            <Card className="overflow-hidden">
              <ChatInterface />
            </Card>
          </TabsContent>

          <TabsContent value="admin" className="mt-0">
            {status === 'loading' ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              </div>
            ) : status === 'authenticated' ? (
              <AdminPanel />
            ) : (
              <LoginForm />
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t py-4 bg-white/80 dark:bg-gray-900/80 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>© 2025 Ortodontic Veternik</span>
              <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">v3.8</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <a href="tel:021821467" className="flex items-center gap-1 hover:text-emerald-600">
                <Phone className="w-3 h-3" />
                021/821-467
              </a>
              <a href="tel:0642503304" className="flex items-center gap-1 hover:text-emerald-600">
                <Phone className="w-3 h-3" />
                064/250-3304
              </a>
              <a 
                href="https://www.google.com/maps?q=Ive+Andrica+1,+21205+Veternik" 
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-emerald-600"
              >
                <MapPin className="w-3 h-3" />
                Ive Andrića 1, Veternik
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
