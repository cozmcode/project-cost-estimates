// Supabase Edge Function: Text-to-Speech using OpenAI
// This function proxies TTS requests to OpenAI, keeping the API key secure server-side

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    const { text, voice = 'nova' } = await req.json()

    if (!text || typeof text !== 'string') {
      throw new Error('Text is required')
    }

    // Limit text length to prevent abuse (OpenAI has a 4096 character limit)
    const trimmedText = text.substring(0, 4096)

    console.log(`[TTS] Generating speech for: "${trimmedText.substring(0, 50)}..."`)

    // Call OpenAI TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',  // Use 'tts-1-hd' for higher quality (slower, more expensive)
        input: trimmedText,
        voice: voice,  // Options: alloy, echo, fable, onyx, nova, shimmer
        response_format: 'mp3',
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[TTS] OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    // Get the audio data
    const audioBuffer = await response.arrayBuffer()

    console.log(`[TTS] Successfully generated ${audioBuffer.byteLength} bytes of audio`)

    // Return the audio with appropriate headers
    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })

  } catch (error) {
    console.error('[TTS] Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
