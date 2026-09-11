import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.33.1";

// =====================================================================
// UTILS: HMAC-SHA256 Signature Verification
// =====================================================================
async function verifyNotchPaySignature(payload: string, signature: string, secret: string): Promise<boolean> {
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

  return hashHex.toLowerCase() === signature.toLowerCase();
}

// =====================================================================
// MAIN HANDLER
// =====================================================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notch-signature' } });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    const signature = req.headers.get('X-Notch-Signature') || req.headers.get('x-notch-signature');
    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature header' }), { status: 401 });
    }

    const rawPayload = await req.text();
    if (!rawPayload) {
      return new Response(JSON.stringify({ error: 'Empty payload' }), { status: 400 });
    }

    const secret = Deno.env.get('NOTCHPAY_WEBHOOK_HASH');
    if (!secret) {
      console.error('NOTCHPAY_WEBHOOK_HASH is not configured in Supabase environment.');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500 });
    }

    const isValid = await verifyNotchPaySignature(rawPayload, signature, secret);
    if (!isValid) {
      console.error(`Invalid signature. Expected signature for payload does not match ${signature}`);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), { status: 401 });
    }

    const event = JSON.parse(rawPayload);
    console.log(`[NotchPay Webhook] Received valid notification for event: ${event.event}`);

    // If it's a successful payment
    if (event.event === 'payment.complete' && event.data.status === 'complete') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { error: dbError } = await supabase
          .from('payments')
          .upsert({ 
            reference: event.data.reference, 
            status: 'SUCCESSFUL', 
            amount: event.data.amount,
            operator: event.data.currency, // Or extract from customer data
            updated_at: new Date().toISOString(),
            metadata: event.data 
          }, { onConflict: 'reference' });

        if (dbError) {
          console.error('Erreur lors de la mise à jour de la BDD:', dbError);
        } else {
          console.log(`Transaction ${event.data.reference} enregistrée avec succès en BDD.`);
        }
      }
    }

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
