// Supabase Edge Function: Generate ephemeral token for OpenAI Realtime API
// This function creates short-lived tokens for secure WebRTC connections

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// System instructions for the FSE Cost Calculator voice assistant
const SYSTEM_INSTRUCTIONS = `You are a helpful voice assistant for the FSE (Field Service Engineer) Deployment Cost Calculator, built by The Cozm.

Your role is to help users estimate the costs of deploying engineers internationally. You can:
- Set the destination country for the deployment
- Set the assignment duration in months
- Set the monthly salary
- Run cost calculations
- Switch between Calculator and Staffing Engine tabs
- Load demo data to show how the calculator works
- Explain the results after a calculation

When users speak naturally about deployments, extract the relevant information and use the appropriate tools. For example:
- "I need to send someone to Brazil for 6 months" → set destination to Brazil, set duration to 6 months
- "Calculate costs for a €5000 monthly salary" → set salary to 5000, then calculate
- "What would a half-year assignment to Germany cost?" → set destination to Germany, set duration to 6, then calculate

Be conversational and helpful. Confirm actions you take and guide users through the process.

Available countries: Brazil, USA, Germany, UK, UAE, Singapore, Australia, Mexico, India, South Africa

Keep responses concise since this is a voice interface. Speak naturally but briefly.`

// Tool definitions for the FSE Cost Calculator
const TOOLS = [
  {
    type: "function",
    name: "calculate_costs",
    description: "Run the cost estimation calculation with the current form values. Call this when the user wants to see the total deployment costs.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "reset_form",
    description: "Clear all form fields and reset the calculator to its initial state.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "set_destination",
    description: "Set the destination/host country for the engineer deployment.",
    parameters: {
      type: "object",
      properties: {
        country: {
          type: "string",
          enum: ["Brazil", "USA", "Germany", "UK", "UAE", "Singapore", "Australia", "Mexico", "India", "SouthAfrica"],
          description: "The country where the engineer will be deployed"
        }
      },
      required: ["country"]
    }
  },
  {
    type: "function",
    name: "set_duration",
    description: "Set the assignment duration in months.",
    parameters: {
      type: "object",
      properties: {
        months: {
          type: "integer",
          minimum: 1,
          maximum: 60,
          description: "Number of months for the assignment (1-60)"
        }
      },
      required: ["months"]
    }
  },
  {
    type: "function",
    name: "set_salary",
    description: "Set the monthly base salary in EUR.",
    parameters: {
      type: "object",
      properties: {
        salary: {
          type: "number",
          minimum: 0,
          description: "Monthly salary in EUR"
        }
      },
      required: ["salary"]
    }
  },
  {
    type: "function",
    name: "switch_tab",
    description: "Switch between the main application tabs.",
    parameters: {
      type: "object",
      properties: {
        tab: {
          type: "string",
          enum: ["calculator", "staffing"],
          description: "The tab to switch to: 'calculator' for cost estimation or 'staffing' for the staffing engine"
        }
      },
      required: ["tab"]
    }
  },
  {
    type: "function",
    name: "load_demo_data",
    description: "Populate the form with sample demonstration data to show how the calculator works.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "explain_results",
    description: "Read out and explain the current calculation results displayed on screen.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
]

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

    console.log('[REALTIME-TOKEN] Requesting ephemeral token from OpenAI...')

    // Request ephemeral token from OpenAI Realtime API
    // Using gpt-realtime-mini for lowest latency (GA model, not preview)
    // Alternative: 'gpt-realtime' for highest accuracy
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-realtime-mini',
        voice: 'coral',  // Supported voices: alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar
        instructions: SYSTEM_INSTRUCTIONS,
        tools: TOOLS,
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',  // Server-side voice activity detection
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        }
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[REALTIME-TOKEN] OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    console.log('[REALTIME-TOKEN] Successfully obtained ephemeral token')
    console.log('[REALTIME-TOKEN] Token expires:', data.expires_at)

    // Return the ephemeral token and session info
    return new Response(
      JSON.stringify({
        token: data.client_secret?.value || data.client_secret,
        expires_at: data.expires_at,
        session_id: data.id
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    )

  } catch (error) {
    console.error('[REALTIME-TOKEN] Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
