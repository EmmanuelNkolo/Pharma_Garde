import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CAMPAY_ENV = Deno.env.get('CAMPAY_ENV') || 'demo'; // 'demo' ou 'production'
const CAMPAY_BASE_URL = CAMPAY_ENV === 'demo' ? 'https://demo.campay.net/api' : 'https://www.campay.net/api';

// Cache for the Campay token
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0;

async function getCampayToken(): Promise<string | null> {
  // Use cached token if valid (5 minutes buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 300000) {
    return cachedToken;
  }

  const username = Deno.env.get('CAMPAY_USERNAME');
  const password = Deno.env.get('CAMPAY_PASSWORD');

  if (!username || !password) {
    console.error("Missing CAMPAY_USERNAME or CAMPAY_PASSWORD environment variables");
    return null;
  }

  try {
    const response = await fetch(`${CAMPAY_BASE_URL}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      console.error(`Campay Auth Failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    cachedToken = data.token;
    // Default to 1 hour if not specified
    const expiresInMs = data.expires_in ? data.expires_in * 1000 : 3600 * 1000;
    tokenExpiresAt = Date.now() + expiresInMs;
    
    return cachedToken;
  } catch (error) {
    console.error('Error fetching Campay token:', error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { action, phone, amount, reference, description } = await req.json();

    if (!action || !['collect', 'status'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Invalid action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const token = await getCampayToken();
    if (!token) {
      return new Response(JSON.stringify({ error: 'Failed to authenticate with payment provider' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ACTION: COLLECT (Initiate Payment)
    if (action === 'collect') {
      if (!phone || !amount) {
        return new Response(JSON.stringify({ error: 'Phone and amount are required for collect action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const externalRef = 'REQ-' + Date.now();
      const phoneWithCode = phone.startsWith('237') ? phone : '237' + phone;

      const response = await fetch(`${CAMPAY_BASE_URL}/collect/`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        },
        body: JSON.stringify({
          amount: amount.toString(),
          currency: 'XAF',
          from: phoneWithCode,
          description: description || 'Pharma-Garde - Recherche Express',
          external_reference: externalRef
        }),
      });

      const data = await response.json();

      if (response.ok && data.reference) {
        return new Response(JSON.stringify({ success: true, reference: data.reference }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: data.message || 'Payment refused by operator' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // ACTION: STATUS (Check Payment Status)
    if (action === 'status') {
      if (!reference) {
        return new Response(JSON.stringify({ error: 'Reference is required for status check' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const response = await fetch(`${CAMPAY_BASE_URL}/transaction/${reference}/`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`
        }
      });

      const data = await response.json();
      
      if (response.ok) {
        return new Response(JSON.stringify({ success: true, status: data.status, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: 'Failed to fetch status' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Action not processed' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('Edge Function error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
