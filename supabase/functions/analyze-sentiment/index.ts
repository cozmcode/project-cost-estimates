// Supabase Edge Function: Sentiment Analysis using OpenAI
// Analyzes user messages for sentiment (-100 to +100) and topic categorization

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

    const { text, context } = await req.json()

    if (!text || typeof text !== 'string') {
      throw new Error('Text is required')
    }

    console.log(`[SENTIMENT] Analyzing: "${text.substring(0, 100)}..."`)

    // Call OpenAI Chat Completions API for sentiment analysis
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a sentiment analyzer for a global mobility cost calculator. Analyze the user's message and return JSON with:
1. "score": integer from -100 (very negative/frustrated) to +100 (very positive/satisfied). 0 is neutral.
2. "topic": categorize as one of: "tax", "social_security", "per_diem", "admin_fees", "salary", "duration", "general", "positive_feedback", "negative_feedback", "question", "confusion"
3. "keywords": array of 1-3 key sentiment words from the message

Examples:
- "show me a breakdown" → {"score": 0, "topic": "general", "keywords": ["breakdown"]}
- "the tax costs seem too high" → {"score": -40, "topic": "tax", "keywords": ["too high"]}
- "this estimate looks great thanks" → {"score": 85, "topic": "positive_feedback", "keywords": ["great", "thanks"]}
- "I don't understand this social security charge" → {"score": -20, "topic": "social_security", "keywords": ["don't understand"]}
- "perfect, exactly what I needed" → {"score": 95, "topic": "positive_feedback", "keywords": ["perfect", "exactly"]}
- "why is per diem so low?" → {"score": -30, "topic": "per_diem", "keywords": ["why", "so low"]}

Return ONLY valid JSON, no explanation.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[SENTIMENT] OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    console.log(`[SENTIMENT] Raw response: ${content}`)

    // Parse the JSON response
    let result
    try {
      result = JSON.parse(content)
    } catch (e) {
      // Fallback if JSON parsing fails
      console.error('[SENTIMENT] Failed to parse JSON, using fallback')
      result = { score: 0, topic: 'general', keywords: [] }
    }

    // Validate and clamp the score
    result.score = Math.max(-100, Math.min(100, Math.round(result.score || 0)))

    console.log(`[SENTIMENT] Result: score=${result.score}, topic=${result.topic}`)

    return new Response(
      JSON.stringify({
        score: result.score,
        topic: result.topic || 'general',
        keywords: result.keywords || [],
        timestamp: new Date().toISOString(),
        text: text.substring(0, 200) // Store truncated text for reference
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('[SENTIMENT] Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
