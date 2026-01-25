// Supabase Edge Function: Generate ephemeral token for OpenAI Realtime API
// This function creates short-lived tokens for secure WebRTC connections

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// System instructions for the FSE Cost Calculator voice assistant
const SYSTEM_INSTRUCTIONS = `You are Mira, a voice assistant for the FSE Deployment Cost Calculator by The Cozm.

CRITICAL - ALWAYS USE TOOLS:
- When the user asks to change ANY value, you MUST call the appropriate tool function
- NEVER just say "sure" or ask follow-up questions - CALL THE TOOL IMMEDIATELY
- "Change home country to Portugal" → call set_home_country with country="Portugal"
- "Set destination to UK" → call set_destination with country="UK"
- "Calculate" → call calculate_costs

CRITICAL - BE CONCISE:
- Give SHORT responses (1-2 sentences max)
- After calling a tool, just say "Done" or state the result
- DO NOT list available options unless the user asks
- DO NOT ask clarifying questions if you have enough info

TOOL MAPPING (use these when user mentions):
- "home country" / "origin" → set_home_country (Finland or Portugal)
- "destination" / "host country" / "deploy to" → set_destination
- "city" / "London" / "New York" → set_destination_city (only for UK/USA)
- "duration" / "months" / "how long" → set_duration
- "salary" / "pay" → set_salary
- "daily allowance" / "per diem" → set_daily_allowance
- "working days" → set_working_days
- "calculate" / "estimate" / "run" → calculate_costs
- "explain" / "what is" / "tell me about" / "breakdown" → explain_results/explain_tax/etc.
- "social security on/off" / "include SS" / "exclude SS" / "turn on SS" → toggle_social_security
- "show in EUR" / "show in local currency" / "switch currency" / "pounds" → set_currency_display
- "open settings" / "show settings" → open_settings
- "stop" / "turn off voice" / "goodbye" / "that's all" → stop_voice

EXAMPLES:
- User: "Portugal" → call set_home_country({country: "Portugal"}), say "Done."
- User: "UK" → call set_destination({country: "UK"}), say "Done."
- User: "8000 salary" → call set_salary({salary: 8000}), say "Done."
- User: "Calculate" → call calculate_costs({}), announce result

Available home countries: Finland, Portugal
Available destinations: Brazil, USA, Germany, UK, UAE, Singapore, Australia, Mexico, India, South Africa`

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
    name: "set_home_country",
    description: "Set the home country (origin) where the engineer is based and employed. This affects per diem rates and social security agreements.",
    parameters: {
      type: "object",
      properties: {
        country: {
          type: "string",
          enum: ["Finland", "Portugal"],
          description: "The engineer's home country of employment"
        }
      },
      required: ["country"]
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
    name: "set_destination_city",
    description: "Set the destination city within a country. Only available for USA (New York, Los Angeles, Washington D.C.) and UK (London, Edinburgh). Use 'Standard (Other)' for base country rate.",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The city name: 'London', 'Edinburgh', 'New York', 'Los Angeles', 'Washington D.C.', or 'Standard (Other)'"
        }
      },
      required: ["city"]
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
    name: "set_daily_allowance",
    description: "Set the daily allowance (per diem) in EUR.",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          minimum: 0,
          description: "Daily allowance in EUR"
        }
      },
      required: ["amount"]
    }
  },
  {
    type: "function",
    name: "set_working_days",
    description: "Set the number of working days per month.",
    parameters: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 31,
          description: "Working days per month (typically 20-22)"
        }
      },
      required: ["days"]
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
  },
  {
    type: "function",
    name: "toggle_social_security",
    description: "Turn social security contributions on or off. Controls whether host country social security is included in cost calculations. Use this when the user asks to include/exclude SS, turn SS on/off, or enable/disable social security.",
    parameters: {
      type: "object",
      properties: {
        enabled: {
          type: "boolean",
          description: "true to include social security in calculations, false to exclude"
        },
        scenario: {
          type: "string",
          enum: ["no_agreement", "with_agreement", "both"],
          description: "Which scenario to apply: 'no_agreement' (countries without SS treaty), 'with_agreement' (countries with SS treaty), or 'both' (default)"
        }
      },
      required: ["enabled"]
    }
  },
  {
    type: "function",
    name: "set_currency_display",
    description: "Switch the display currency between EUR and local currency (e.g., GBP, USD, BRL). Use when user asks to show in euros, pounds, local currency, etc.",
    parameters: {
      type: "object",
      properties: {
        currency: {
          type: "string",
          enum: ["EUR", "LOCAL"],
          description: "EUR for euros, LOCAL for host country currency (e.g., GBP for UK, USD for USA)"
        }
      },
      required: ["currency"]
    }
  },
  {
    type: "function",
    name: "open_settings",
    description: "Open the settings panel to show current configuration options including social security toggles and display preferences.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    type: "function",
    name: "stop_voice",
    description: "Stop the voice assistant and turn off listening. Call this when the user says 'stop', 'turn off voice', 'goodbye', 'that's all', or similar.",
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
        voice: 'shimmer',  // Female voice, lighter/neutral tone (less American than coral)
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
