import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";

// =====================================================================
// UTILS: HMAC-SHA256 Signature Verification
// =====================================================================
async function verifyCampaySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, data);
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Simple string comparison for the hex string
  return hashHex.toLowerCase() === signature.toLowerCase();
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
serve(async (req) => {
  // CORS configuration (optional, if you need to call it from browser)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-campay-signature' } });
  }

  try {
    // 1. Ensure method is POST
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    // 2. Extract signature from headers
    const signature = req.headers.get('X-Campay-Signature') || req.headers.get('x-campay-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature header' }), { status: 401 });
    }

    // 3. Read raw payload
    const rawPayload = await req.text();
    if (!rawPayload) {
      return new Response(JSON.stringify({ error: 'Empty payload' }), { status: 400 });
    }

    // 4. Verify HMAC signature
    const secret = Deno.env.get('CAMPAY_WEBHOOK_SECRET');
    if (!secret) {
      console.error('CAMPAY_WEBHOOK_SECRET is not configured in Supabase environment.');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
    }

    const isValid = await verifyCampaySignature(rawPayload, signature, secret);
    if (!isValid) {
      console.error(`Invalid signature. Expected signature for payload does not match ${signature}`);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }

    // 5. Parse JSON payload and process business logic
    const data = JSON.parse(rawPayload);
    console.log(`[Campay Webhook] Received valid notification for reference: ${data.reference}, Status: ${data.status}`);

    // Si on a un webhook de succès
    if (data.status === 'SUCCESSFUL') {
      // Connect to Supabase using the Service Role Key to bypass RLS policies
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      // If URLs and keys are present, update database
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Exemple : Mettre à jour une table "transactions" ou "payments"
        /*
        const { error: dbError } = await supabase
          .from('payments')
          .upsert({ 
            reference: data.reference, 
            status: data.status, 
            amount: data.amount,
            operator: data.operator,
            updated_at: new Date().toISOString(),
            metadata: data 
          }, { onConflict: 'reference' });

        if (dbError) {
          console.error('Erreur BDD:', dbError);
        }
        */
      }
    }

    // Toujours retourner 200 OK à Campay pour leur signifier que nous avons bien reçu le webhook
    return new Response(JSON.stringify({ success: true, message: 'Webhook processed successfully' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Unhandled webhook error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
