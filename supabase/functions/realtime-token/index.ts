// Supabase Edge Function: Generate ephemeral token for OpenAI Realtime API
// This function creates short-lived tokens for secure WebRTC connections

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// System instructions for the FSE Cost Calculator voice assistant
const SYSTEM_INSTRUCTIONS = `You are a helpful voice assistant for the FSE (Field Service Engineer) Deployment Cost Calculator, built by The Cozm.

Your role is to help users estimate the costs of deploying engineers internationally.

IMPORTANT - FORM STATE AWARENESS:
- When the session starts, you will receive a message with the current form values (destination, duration, salary, etc.)
- ALWAYS use these existing values - DO NOT ask for information that's already filled in
- If the user says "calculate costs", proceed with the values already on the form
- Only ask for information that is missing or that the user specifically wants to change
- When confirming actions, acknowledge what values you're using (e.g., "I'll calculate costs for the 6-month deployment to Brazil that's currently set up")

Available actions:
- Set the destination country for the deployment
- Set the assignment duration in months
- Set the monthly salary
- Run cost calculations
- Switch between Calculator and Staffing Engine tabs
- Load demo data to show how the calculator works
- Explain the results after a calculation
- Get current form state (use get_form_state if you need to check current values)

When users speak naturally about deployments, extract the relevant information and use the appropriate tools. For example:
- "Calculate the costs" → just run calculate_costs with existing form values
- "Change destination to Germany and calculate" → set destination to Germany, then calculate (keep other values)
- "What if we did 12 months instead?" → set duration to 12, then calculate

Available countries: Brazil, USA, Germany, UK, UAE, Singapore, Australia, Mexico, India, South Africa

Keep responses concise since this is a voice interface. Speak naturally but briefly. Acknowledge what you're doing without repeating all the details.`

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
    description: "Give an overview of all calculation results including total cost, tax, social security, per diem, and admin fees. Use the specific tools (explain_tax, explain_social_security, explain_per_diem) when the user asks for detailed breakdowns of those categories.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "explain_tax",
    description: "Explain the host country tax calculation in detail, including tax brackets, rates, and how the total was computed. Call this when the user asks about taxes, tax rates, tax breakdown, or why tax is a certain amount.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "explain_social_security",
    description: "Explain the social security calculation, including employer and employee portions, and why it might be zero due to reciprocal agreements. Call this when the user asks about social security, employer contributions, or why social security is zero.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "explain_per_diem",
    description: "Explain the per diem (daily allowance) calculation, including daily rate, working days, and data sources. Call this when the user asks about per diem, daily allowance, travel allowances, or how per diem is calculated.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "get_form_state",
    description: "Get the current values of all form fields. ALWAYS call this first before asking the user for any information, so you know what's already filled in. Returns: homeCountry, destinationCountry, salary, duration, dailyAllowance, workingDays.",
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
