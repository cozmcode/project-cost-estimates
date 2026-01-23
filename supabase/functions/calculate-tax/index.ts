// Follow this setup guide to integrate the Deno runtime and Supabase:
// https://supabase.com/docs/guides/functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// CORS headers are necessary since your frontend (GitHub Pages) is on a different domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { salary, country, duration } = await req.json()

    // TODO: Connect this to the iCalculator API or move your complex logic here
    // For now, we will log the request and return a calculated response
    console.log(`Calculating tax for ${country}, Salary: ${salary}, Duration: ${duration}`)

    // Example logic (server-side security!)
    // In the future, your API key for iCalculator would live here:
    // const API_KEY = Deno.env.get('ICALCULATOR_API_KEY')
    
    // Mock response matching your frontend structure
    const data = {
      tax: salary * 0.3, // Mock 30% tax
      socialSecurity: salary * 0.1, // Mock 10% social security
      message: "Calculation performed securely on Supabase Edge"
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
