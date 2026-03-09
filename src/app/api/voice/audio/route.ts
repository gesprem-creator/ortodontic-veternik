import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// TTS endpoint for generating audio
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const text = searchParams.get('text')

  if (!text) {
    return new NextResponse('Missing text parameter', { status: 400 })
  }

  try {
    console.log('🔊 TTS Request:', text.substring(0, 50))
    
    const zai = await ZAI.create()

    const response = await zai.audio.tts.create({
      input: text,
      voice: 'tongtong',
      speed: 0.9,
      response_format: 'wav',
      stream: false,
    })

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(new Uint8Array(arrayBuffer))

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    console.error('TTS Error:', error)
    return new NextResponse('TTS Error', { status: 500 })
  }
}
