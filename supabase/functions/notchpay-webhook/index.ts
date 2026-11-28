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

function normalizePhone(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '').replace(/^237/, '');
}

// =====================================================================
// MAIN HANDLER (Client 24h Pass + Pro Subscriptions Délégué / Grossiste / Pharmacie / Médecin / Établissement)
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

    const secret = (Deno.env.get('NOTCHPAY_WEBHOOK_HASH') || '').replace(/^["']|["']$/g, '').trim();
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
    const notchRef = String(txData.reference || '').trim();
    const merchantRef = String(txData.merchant_reference || txData?.metadata?.merchant_reference || txData?.metadata?.internal_reference || '').trim();
    const reference = notchRef || merchantRef;
    const subRef = merchantRef.startsWith('sub_')
      ? merchantRef
      : (notchRef.startsWith('sub_') ? notchRef : (merchantRef || notchRef));
    const isSubPayment = merchantRef.startsWith('sub_') || notchRef.startsWith('sub_') || txData?.metadata?.type === 'subscription';

    const cleanPhone = normalizePhone(
      txData.customer?.phone || txData.phone || txData?.metadata?.phone || txData?.data?.phone || ''
    );

    const txStatus = String(txData.status || '').toLowerCase();
    const isCompleted = (event.event === 'payment.complete' || event.event === 'payment.successful') &&
                        (txStatus === 'complete' || txStatus === 'completed' || txStatus === 'successful' || txStatus === 'paid');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (supabaseUrl && supabaseServiceKey && reference) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      if (isCompleted) {
        // 1. Enregistrer systématiquement dans la table `payments` avec téléphone normalisé et références complètes
        const enrichedMetadata = {
          ...(typeof txData === 'object' ? txData : {}),
          phone: cleanPhone || txData?.metadata?.phone || undefined,
          merchant_reference: merchantRef || undefined,
          notch_reference: notchRef || undefined,
          type: isSubPayment ? 'subscription' : (txData?.metadata?.type || 'client_pass_24h')
        };

        const { error: dbError } = await supabase
          .from('payments')
          .upsert({
            reference,
            status: 'SUCCESSFUL',
            amount: txData.amount,
            operator: txData.channel || txData.currency || 'XAF',
            updated_at: new Date().toISOString(),
            metadata: enrichedMetadata
          }, { onConflict: 'reference' });

        if (dbError) {
          console.error('Erreur lors de la mise à jour de payments:', dbError);
        }

        // 2. Si c'est un abonnement Pro (`merchant_reference` ou `reference` commençant par `sub_`), activer l'abonnement
        if (isSubPayment && subRef) {
          const { data: rpcResult, error: rpcError } = await supabase.rpc(
            'activate_subscription_by_reference',
            { p_reference: subRef }
          );
          if (rpcError) {
            console.error('[Webhook] Erreur activation abonnement:', rpcError);
          } else {
            console.log('[Webhook] Abonnement activé avec succès:', rpcResult);
          }
        }
      } else if (txStatus === 'failed' || txStatus === 'canceled' || txStatus === 'cancelled' || txStatus === 'expired') {
        await supabase
          .from('payments')
          .upsert({
            reference,
            status: 'FAILED',
            amount: txData.amount,
            operator: txData.channel || txData.currency || 'XAF',
            updated_at: new Date().toISOString(),
            metadata: {
              ...(typeof txData === 'object' ? txData : {}),
              phone: cleanPhone || undefined,
              merchant_reference: merchantRef || undefined,
              notch_reference: notchRef || undefined
            }
          }, { onConflict: 'reference' });

        if (isSubPayment && subRef) {
          await supabase
            .from('subscriptions')
            .update({ status: 'failed', updated_at: new Date().toISOString() })
            .eq('payment_reference', subRef);
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
