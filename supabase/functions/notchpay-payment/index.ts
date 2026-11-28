import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function normalizePhone(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '').replace(/^237/, '');
}

function isPaidStatus(st: unknown): boolean {
  const s = String(st || '').toLowerCase();
  return s === 'complete' || s === 'completed' || s === 'successful' || s === 'paid';
}

function isFailedStatus(st: unknown): boolean {
  const s = String(st || '').toLowerCase();
  return s === 'canceled' || s === 'cancelled' || s === 'failed' || s === 'expired';
}

function isSubscriptionRow(row: any): boolean {
  const ref = String(row?.reference || '');
  const mRef = String(row?.metadata?.merchant_reference || '');
  const type = String(row?.metadata?.type || '').toLowerCase();
  return type === 'subscription' || ref.startsWith('sub_') || mRef.startsWith('sub_');
}

function rowMatchesPhone(row: any, cleanedPhone: string): boolean {
  if (!cleanedPhone || cleanedPhone.length !== 9) return false;
  const meta = row?.metadata || {};
  const candidates = [
    meta.phone,
    meta.customer?.phone,
    meta.data?.phone,
    row?.reference,
  ];
  for (const c of candidates) {
    if (c && normalizePhone(c).endsWith(cleanedPhone)) return true;
  }
  const digitsOnly = JSON.stringify(meta).replace(/\D/g, '');
  return digitsOnly.includes(cleanedPhone);
}

async function fetchNotchPayStatus(reference: string, apiKey: string) {
  const response = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: {
      'Authorization': apiKey,
      'Accept': 'application/json',
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || 'Erreur lors de la vérification du statut');
  }
  const tx = data?.transaction || data?.data || {};
  const rawStatus = String(tx.status || '').toLowerCase();
  let mappedStatus = 'PENDING';
  if (isPaidStatus(rawStatus)) mappedStatus = 'SUCCESSFUL';
  else if (isFailedStatus(rawStatus)) mappedStatus = 'FAILED';

  const phoneFromTx = normalizePhone(
    tx.customer?.phone || tx.phone || tx.metadata?.phone || ''
  );

  return {
    mappedStatus,
    rawStatus,
    tx,
    phone: phoneFromTx,
    amount: tx.amount,
    createdAt: tx.created_at || new Date().toISOString(),
  };
}

async function findActiveClientSession(
  supabase: any,
  cleanedPhone: string,
  apiKey: string
) {
  if (!supabase || cleanedPhone.length !== 9) return null;
  const sinceIso = new Date(Date.now() - SESSION_DURATION_MS).toISOString();

  // 1. Vérifier les paiements des dernières 24h dans `payments`
  const { data: recentPayments } = await supabase
    .from('payments')
    .select('reference, status, amount, created_at, updated_at, metadata')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(300);

  if (recentPayments && recentPayments.length > 0) {
    const matchingClientRows = recentPayments.filter(
      (p: any) => !isSubscriptionRow(p) && rowMatchesPhone(p, cleanedPhone)
    );

    // 1a. Paiement déjà confirmé dans les 24h
    const paid = matchingClientRows.find((p: any) => isPaidStatus(p.status));
    if (paid) {
      const createdMs = new Date(paid.created_at || paid.updated_at || Date.now()).getTime();
      return {
        active: true,
        reference: paid.reference,
        created_at: new Date(createdMs).toISOString(),
        expires_at: new Date(createdMs + SESSION_DURATION_MS).toISOString(),
        phone: cleanedPhone,
        source: 'payments',
      };
    }

    // 1b. Paiement encore PENDING récent (< 2h) : vérifier en direct chez NotchPay au cas où le client a validé hors navigateur
    if (apiKey) {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const pending = matchingClientRows.find((p: any) => {
        const st = String(p.status || '').toLowerCase();
        const ts = new Date(p.created_at || 0).getTime();
        return (st === 'pending' || st === 'processing') && ts >= twoHoursAgo;
      });
      if (pending && pending.reference) {
        try {
          const live = await fetchNotchPayStatus(pending.reference, apiKey);
          if (live.mappedStatus === 'SUCCESSFUL') {
            const confirmedIso = pending.created_at || live.createdAt || new Date().toISOString();
            await supabase.from('payments').upsert({
              reference: pending.reference,
              status: 'SUCCESSFUL',
              amount: live.amount || pending.amount || 100,
              operator: pending.metadata?.method || 'XAF',
              updated_at: new Date().toISOString(),
              metadata: {
                ...(pending.metadata || {}),
                phone: cleanedPhone,
                type: 'client_pass_24h',
                raw_status: live.rawStatus,
              },
            }, { onConflict: 'reference' });
            const createdMs = new Date(confirmedIso).getTime();
            return {
              active: true,
              reference: pending.reference,
              created_at: new Date(createdMs).toISOString(),
              expires_at: new Date(createdMs + SESSION_DURATION_MS).toISOString(),
              phone: cleanedPhone,
              source: 'notchpay_live_recovered',
            };
          }
        } catch (_e) { /* ignore transient check error */ }
      }
    }
  }

  // 2. Repli : vérifier `requests` (toute recherche envoyée dans les dernières 24h implique un Pass 24h déjà réglé)
  const { data: recentRequests } = await supabase
    .from('requests')
    .select('id, user_phone, created_at')
    .gte('created_at', sinceIso)
    .not('user_phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(300);

  if (recentRequests && recentRequests.length > 0) {
    const reqMatch = recentRequests.find(
      (r: any) => normalizePhone(r.user_phone) === cleanedPhone
    );
    if (reqMatch) {
      const createdMs = new Date(reqMatch.created_at).getTime();
      return {
        active: true,
        reference: 'REQ_' + reqMatch.id,
        created_at: new Date(createdMs).toISOString(),
        expires_at: new Date(createdMs + SESSION_DURATION_MS).toISOString(),
        phone: cleanedPhone,
        source: 'requests',
      };
    }
  }

  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const reqData = await req.json();
    const action = reqData.action;
    const reference = reqData.reference;
    const phone = reqData.phone;
    const amount = reqData.amount;
    const description = reqData.description;

    let NOTCHPAY_SECRET_KEY = (Deno.env.get('NOTCHPAY_SECRET_KEY') || Deno.env.get('NOTCHPAY_PRIVATE_KEY') || '').replace(/^["']|["']$/g, '').trim();
    let NOTCHPAY_PUBLIC_KEY = (Deno.env.get('NOTCHPAY_PUBLIC_KEY') || '').replace(/^["']|["']$/g, '').trim();
    const API_KEY = NOTCHPAY_PUBLIC_KEY || NOTCHPAY_SECRET_KEY;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = (supabaseUrl && supabaseServiceKey)
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null;

    if (action === 'verify_session') {
      const cleanedPhone = normalizePhone(phone);
      const pendingRef = String(reqData.pending_reference || reference || '').trim();

      // A. Vérifier en priorité une transaction en attente (ex: retour USSD ou page NotchPay)
      if (pendingRef) {
        if (supabase) {
          const { data: existingRow } = await supabase
            .from('payments')
            .select('reference, status, amount, created_at, updated_at, metadata')
            .eq('reference', pendingRef)
            .maybeSingle();

          if (existingRow && isPaidStatus(existingRow.status)) {
            const createdMs = new Date(existingRow.created_at || existingRow.updated_at || Date.now()).getTime();
            if (createdMs + SESSION_DURATION_MS > Date.now()) {
              return new Response(JSON.stringify({
                success: true,
                active: true,
                reference: existingRow.reference,
                created_at: new Date(createdMs).toISOString(),
                expires_at: new Date(createdMs + SESSION_DURATION_MS).toISOString(),
                phone: cleanedPhone || normalizePhone(existingRow.metadata?.phone),
                source: 'pending_db',
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        }

        if (API_KEY) {
          try {
            const live = await fetchNotchPayStatus(pendingRef, API_KEY);
            if (live.mappedStatus === 'SUCCESSFUL') {
              const resolvedPhone = cleanedPhone || live.phone;
              const nowIso = new Date().toISOString();
              if (supabase) {
                await supabase.from('payments').upsert({
                  reference: pendingRef,
                  status: 'SUCCESSFUL',
                  amount: live.amount || 100,
                  operator: 'XAF',
                  updated_at: nowIso,
                  metadata: {
                    phone: resolvedPhone,
                    type: 'client_pass_24h',
                    raw_status: live.rawStatus,
                    notch_reference: pendingRef,
                  },
                }, { onConflict: 'reference' });
              }
              const createdMs = new Date(live.createdAt || nowIso).getTime();
              return new Response(JSON.stringify({
                success: true,
                active: true,
                reference: pendingRef,
                created_at: new Date(createdMs).toISOString(),
                expires_at: new Date(createdMs + SESSION_DURATION_MS).toISOString(),
                phone: resolvedPhone,
                source: 'pending_live',
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          } catch (_e) { /* continue to phone lookup */ }
        }
      }

      // B. Vérifier une session 24h active par numéro de téléphone
      if (cleanedPhone.length === 9 && supabase) {
        const found = await findActiveClientSession(supabase, cleanedPhone, API_KEY);
        if (found) {
          return new Response(JSON.stringify({ success: true, ...found }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ success: true, active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!API_KEY) {
      throw new Error('Les clés API Notch Pay sont manquantes');
    }

    if (action === 'collect') {
      const method = reqData.method === 'momo' ? 'momo' : 'om';
      const cleanedPhone = normalizePhone(phone);
      if (cleanedPhone.length !== 9) {
        throw new Error('Numéro Mobile Money invalide (9 chiffres requis)');
      }

      // Protection serveur anti double-paiement : si un Pass 24h est déjà actif, ne pas redébiter 100 FCFA
      if (supabase) {
        const already = await findActiveClientSession(supabase, cleanedPhone, API_KEY);
        if (already) {
          return new Response(JSON.stringify({
            success: true,
            already_active: true,
            reference: already.reference,
            created_at: already.created_at,
            expires_at: already.expires_at,
            phone: cleanedPhone,
            message: 'Votre Pass 24h est déjà actif ! Recherche gratuite sans nouveau paiement.',
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      const merchantRef = "phg_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
      const payAmount = amount || 100;
      const payload = {
        amount: payAmount,
        currency: "XAF",
        reference: merchantRef,
        description: description || "Recherche Pharma-Garde - Pass 24h",
        email: `client_${cleanedPhone}@pharmagarde.cm`,
        phone: "+237" + cleanedPhone,
        metadata: {
          phone: cleanedPhone,
          merchant_reference: merchantRef,
          method,
          type: 'client_pass_24h',
        },
      };

      console.log('[NotchPay] Initialisation du paiement Pass 24h...');

      const initResponse = await fetch('https://api.notchpay.co/payments', {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const initData = await initResponse.json();
      if (!initResponse.ok) {
        console.error("Notch Pay Init Error:", initData);
        throw new Error(initData.message || initData.error || 'Erreur lors de l\'initialisation du paiement');
      }

      const txReference = initData?.transaction?.reference || merchantRef;
      console.log('[NotchPay] Paiement initialisé:', txReference);

      // Enregistrer immédiatement la transaction PENDING avec le numéro normalisé dans Supabase `payments`
      if (supabase) {
        await supabase.from('payments').upsert({
          reference: txReference,
          status: 'PENDING',
          amount: payAmount,
          operator: method,
          updated_at: new Date().toISOString(),
          metadata: {
            phone: cleanedPhone,
            merchant_reference: merchantRef,
            notch_reference: txReference,
            method,
            type: 'client_pass_24h',
          },
        }, { onConflict: 'reference' });
      }

      const channel = method === 'momo' ? 'cm.mtn' : 'cm.orange';
      const completePayload = {
        channel: channel,
        data: {
          phone: "+237" + cleanedPhone,
        },
      };

      const completeResponse = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(txReference)}`, {
        method: 'PUT',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(completePayload),
      });

      const completeData = await completeResponse.json();
      console.log('[NotchPay] Réponse complete:', JSON.stringify(completeData));

      if (!completeResponse.ok) {
        console.error("Notch Pay Complete Error:", completeData);
        return new Response(JSON.stringify({
          success: true,
          reference: txReference,
          merchant_reference: merchantRef,
          authorization_url: initData.authorization_url,
          direct_charge: false,
          error_detail: completeData.message || 'Canal mobile money non disponible',
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        reference: txReference,
        merchant_reference: merchantRef,
        direct_charge: true,
        message: 'Un message USSD a été envoyé sur votre téléphone. Veuillez entrer votre code PIN pour confirmer.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'status') {
      if (!reference) throw new Error('Reference manquante');
      const cleanedPhone = normalizePhone(phone);

      // 1. Vérifier d'abord en base Supabase (instantané si déjà confirmé par webhook ou poll précédent)
      let existingRow: any = null;
      if (supabase) {
        const { data: dbRow } = await supabase
          .from('payments')
          .select('reference, status, amount, created_at, updated_at, metadata')
          .eq('reference', reference)
          .maybeSingle();
        existingRow = dbRow || null;

        if (existingRow && isPaidStatus(existingRow.status)) {
          return new Response(JSON.stringify({
            success: true,
            status: 'SUCCESSFUL',
            raw_status: existingRow.status,
            reference: existingRow.reference,
            created_at: existingRow.created_at,
            phone: cleanedPhone || normalizePhone(existingRow.metadata?.phone),
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      // 2. Interroger NotchPay en direct
      const live = await fetchNotchPayStatus(reference, API_KEY);
      const resolvedPhone = cleanedPhone || live.phone || normalizePhone(existingRow?.metadata?.phone);

      // 3. Dès confirmation SUCCESSFUL (ou FAILED), persister immédiatement dans Supabase `payments`
      if (supabase && (live.mappedStatus === 'SUCCESSFUL' || live.mappedStatus === 'FAILED')) {
        const nowIso = new Date().toISOString();
        await supabase.from('payments').upsert({
          reference,
          status: live.mappedStatus,
          amount: live.amount || existingRow?.amount || 100,
          operator: existingRow?.metadata?.method || 'XAF',
          updated_at: nowIso,
          metadata: {
            ...(existingRow?.metadata || {}),
            phone: resolvedPhone || undefined,
            notch_reference: reference,
            type: existingRow?.metadata?.type || 'client_pass_24h',
            raw_status: live.rawStatus,
          },
        }, { onConflict: 'reference' });
      }

      return new Response(JSON.stringify({
        success: true,
        status: live.mappedStatus,
        raw_status: live.rawStatus,
        reference,
        created_at: existingRow?.created_at || live.createdAt,
        phone: resolvedPhone,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error('Action non reconnue');
    }

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, error: error?.message || String(error) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
