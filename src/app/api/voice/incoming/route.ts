import { NextRequest, NextResponse } from 'next/server'

// Twilio webhook for incoming calls
export async function POST(request: NextRequest) {
  console.log('📞 Incoming call received')
  
  // Generate TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="/api/voice/process" method="POST" timeout="5" speechTimeout="auto" language="sr-RS">
    <Play>/api/voice/audio?text=${encodeURIComponent('Dobar dan, zvali ste stomatološku ordinaciju Ortodontic iz Veternika. Da li želite da zakažete kod stomatologa ili ortodonta?')} </Play>
  </Gather>
  <Play>/api/voice/audio?text=${encodeURIComponent('Nisam čuo vaš odgovor. Molim vas pokušajte ponovo.')}</Play>
  <Redirect>/api/voice/incoming</Redirect>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
    },
  })
}
