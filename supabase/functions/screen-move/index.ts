// Supabase Edge Function: Move Screening using OpenAI
// Evaluates international assignment requests and returns approved/rejected decision

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

    const body = await req.json()

    // Validate required fields
    const required = ['homeCountry', 'hostCountry', 'monthlySalary', 'assignmentMonths', 'jobTitle',
                      'businessCase', 'shortTrip', 'initiator', 'justification', 'localSearch', 'existingProject']
    for (const field of required) {
      if (!body[field] && body[field] !== 0) {
        throw new Error(`Missing required field: ${field}`)
      }
    }

    console.log(`[SCREEN-MOVE] Screening: ${body.homeCountry} → ${body.hostCountry}, ${body.assignmentMonths}m, ${body.jobTitle}`)

    // Call OpenAI Chat Completions API
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
            content: `You are a global mobility compliance screener for Wärtsilä, a Finnish marine and energy technology company. You evaluate international assignment requests to determine if they should proceed to cost analysis.

SCORING RUBRIC — apply these rules strictly:

AUTO-APPROVE:
- Short-term business trip (< 30 days) with any business justification → APPROVE (confidence 90+)
- Business-requested move with documented business case, local market searched, and existing project → APPROVE (confidence 85+)

AUTO-REJECT:
- No business case AND self-initiated → REJECT
- Self-initiated with no local market search AND no existing project → REJECT
- No business case AND no existing project AND no local market search → REJECT

MIXED SIGNALS — lean towards REJECT with clear explanation:
- Partial business case with self-initiated move → REJECT (explain what's missing)
- Business-requested but no local market search and no project → REJECT (explain concern)

ALWAYS flag these risks (include in flags array):
- Assignment ≥ 6 months: "Tax residency risk — assignment may trigger tax residency in host country"
- Assignment ≥ 12 months: "Social security implications — bilateral agreement review required"
- No bilateral tax treaty between countries: "No tax treaty — potential double taxation risk"
- Self-initiated: "Self-initiated move — ensure business alignment"

Return ONLY valid JSON with this exact structure:
{
  "decision": "approved" or "rejected",
  "confidence": integer 0-100,
  "reasoning": "2-3 sentence explanation of the decision",
  "flags": ["array of risk flags if any"]
}

Return ONLY valid JSON, no explanation outside the JSON.`
          },
          {
            role: 'user',
            content: `Please screen this international assignment request:

Assignment Details:
- Home Country: ${body.homeCountry}
- Host Country: ${body.hostCountry}
- Monthly Salary: €${body.monthlySalary}
- Duration: ${body.assignmentMonths} months
- Working Days/Month: ${body.workingDays || 22}
- Employee: ${body.employeeName || 'Not specified'}
- Role: ${body.jobTitle}

Business Justification:
- Documented business case: ${body.businessCase}
- Short-term trip (< 30 days): ${body.shortTrip}
- Move initiated by: ${body.initiator}
- Justification: ${body.justification}
- Local market searched: ${body.localSearch}
- Existing project at destination: ${body.existingProject}`
          }
        ],
        temperature: 0.2,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[SCREEN-MOVE] OpenAI API error:', errorText)
      throw new Error(`OpenAI API error: ${response.status}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    console.log(`[SCREEN-MOVE] Raw response: ${content}`)

    // Parse JSON response
    let result
    try {
      result = JSON.parse(content)
    } catch (e) {
      console.error('[SCREEN-MOVE] Failed to parse JSON, using fallback rejection')
      result = {
        decision: 'rejected',
        confidence: 50,
        reasoning: 'Unable to process the screening request. Please review the submission and try again.',
        flags: ['Processing error']
      }
    }

    // Validate and normalise
    result.decision = result.decision === 'approved' ? 'approved' : 'rejected'
    result.confidence = Math.max(0, Math.min(100, Math.round(result.confidence || 50)))
    result.reasoning = result.reasoning || 'No reasoning provided.'
    result.flags = Array.isArray(result.flags) ? result.flags : []

    console.log(`[SCREEN-MOVE] Decision: ${result.decision} (${result.confidence}%)`)

    return new Response(
      JSON.stringify({
        decision: result.decision,
        confidence: result.confidence,
        reasoning: result.reasoning,
        flags: result.flags,
        timestamp: new Date().toISOString(),
        input: {
          homeCountry: body.homeCountry,
          hostCountry: body.hostCountry,
          assignmentMonths: body.assignmentMonths,
          jobTitle: body.jobTitle
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('[SCREEN-MOVE] Error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
