import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
// MAIN HANDLER (Client 24h Pass + Pro Subscriptions Délégué / Grossiste / Pharmacie)
// =====================================================================
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notch-signature'
      }
    });
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

    const txData = event?.data || {};
    const reference = String(txData.reference || txData.merchant_reference || '');
    const txStatus = String(txData.status || '').toLowerCase();
    const isCompleted = (event.event === 'payment.complete' || event.event === 'payment.successful') &&
                        (txStatus === 'complete' || txStatus === 'successful' || txStatus === 'paid');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (supabaseUrl && supabaseServiceKey && reference) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      if (isCompleted) {
        // 1. Enregistrer systématiquement dans la table `payments`
        const { error: dbError } = await supabase
          .from('payments')
          .upsert({
            reference,
            status: 'SUCCESSFUL',
            amount: txData.amount,
            operator: txData.currency || 'XAF',
            updated_at: new Date().toISOString(),
            metadata: txData
          }, { onConflict: 'reference' });

        if (dbError) {
          console.error('Erreur lors de la mise à jour de payments:', dbError);
        }

        // 2. Si c'est un abonnement Pro (référence commençant par `sub_`), activer l'abonnement
        if (reference.startsWith('sub_') || txData?.metadata?.type === 'subscription') {
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'activate_subscription_by_reference',
            { p_reference: reference }
          );
          if (rpcError) {
            console.error('[Webhook] Erreur activation abonnement:', rpcError);
          } else {
            console.log('[Webhook] Abonnement activé avec succès:', rpcResult);
          }
        }
      } else if (txStatus === 'failed' || txStatus === 'canceled' || txStatus === 'cancelled') {
        if (reference.startsWith('sub_')) {
          await supabase
            .from('subscriptions')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('payment_reference', reference);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, message: 'Webhook processed successfully' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Unhandled webhook error:', error);
    return new Response(JSON.stringify({ error: error?.message || 'Internal Server Error' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
