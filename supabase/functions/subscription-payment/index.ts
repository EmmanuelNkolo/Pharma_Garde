import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Grille tarifaire officielle Pharma-Garde Pro (XAF / FCFA)
const SUBSCRIPTION_PLANS: Record<string, Record<string, { amount: number; days: number; label: string }>> = {
  delegate: {
    monthly:   { amount: 5000,  days: 30,  label: 'Pass Délégué Pro — Mensuel (30 jours)' },
    quarterly: { amount: 12500, days: 90,  label: 'Pass Délégué Pro — Trimestriel (90 jours, -17%)' },
    annual:    { amount: 45000, days: 365, label: 'Pass Délégué Pro — Annuel (365 jours, -25%)' },
  },
  wholesaler: {
    monthly:   { amount: 15000,  days: 30,  label: 'Licence Grossiste-Répartiteur — Mensuel (30 jours)' },
    quarterly: { amount: 40000,  days: 90,  label: 'Licence Grossiste-Répartiteur — Trimestriel (90 jours, -11%)' },
    annual:    { amount: 140000, days: 365, label: 'Licence Grossiste-Répartiteur — Annuel (365 jours, -22%)' },
  },
  pharmacy: {
    monthly:   { amount: 10000, days: 30,  label: 'Pack Officine Connectée — Mensuel (30 jours)' },
    quarterly: { amount: 25000, days: 90,  label: 'Pack Officine Connectée — Trimestriel (90 jours, -17%)' },
    annual:    { amount: 90000, days: 365, label: 'Pack Officine Connectée — Annuel (365 jours, -25%)' },
  }
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const reqData = await req.json();
    const action = reqData.action || 'collect';

    let NOTCHPAY_SECRET_KEY = (Deno.env.get('NOTCHPAY_SECRET_KEY') || '').replace(/^["']|["']$/g, '').trim();
    let NOTCHPAY_PUBLIC_KEY = (Deno.env.get('NOTCHPAY_PUBLIC_KEY') || '').replace(/^["']|["']$/g, '').trim();
    const API_KEY = NOTCHPAY_PUBLIC_KEY || NOTCHPAY_SECRET_KEY;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = (supabaseUrl && supabaseServiceKey)
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null;

    // 1. Consultation de la grille tarifaire
    if (action === 'plans') {
      return new Response(JSON.stringify({
        success: true,
        plans: SUBSCRIPTION_PLANS
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Initialisation + Push USSD d'un abonnement professionnel
    if (action === 'collect') {
      const role = reqData.subscriber_role || 'delegate';
      const planId = reqData.plan_id || 'monthly';
      const subscriberId = reqData.subscriber_id;
      const subscriberName = reqData.subscriber_name || 'Professionnel Pharma-Garde';
      const subscriberEmail = reqData.subscriber_email || 'pro@pharmagarde.cm';
      const phone = String(reqData.phone || '').replace(/\s+/g, '').replace(/^\+?237/, '');
      const method = reqData.method === 'momo' ? 'momo' : 'om';

      if (!subscriberId) {
        throw new Error('Identifiant professionnel (subscriber_id) requis');
      }
      if (!/^[26]\d{8}$/.test(phone)) {
        throw new Error('Numéro Mobile Money camerounais invalide (9 chiffres)');
      }

      const rolePlans = SUBSCRIPTION_PLANS[role] || SUBSCRIPTION_PLANS.delegate;
      const planConfig = rolePlans[planId] || rolePlans.monthly;
      const amount = reqData.amount || planConfig.amount;
      const reference = `sub_${role.slice(0, 3)}_${planId.slice(0, 1)}_${Date.now()}_${Math.floor(Math.random() * 900 + 100)}`;

      const now = new Date();
      const expiresAt = new Date(now.getTime() + planConfig.days * 24 * 60 * 60 * 1000);

      // Enregistrement préalable de l'abonnement en statut 'pending'
      if (supabase) {
        await supabase.from('subscriptions').upsert({
          subscriber_id: subscriberId,
          subscriber_role: role,
          subscriber_name: subscriberName,
          subscriber_email: subscriberEmail,
          subscriber_phone: phone,
          plan_id: planId,
          plan_label: planConfig.label,
          amount_fcfa: amount,
          currency: 'XAF',
          status: 'pending',
          payment_reference: reference,
          payment_method: method,
          starts_at: now.toISOString(),
          expires_at: expiresAt.toISOString(),
          metadata: {
            type: 'subscription',
            role,
            plan_id: planId,
            days: planConfig.days,
            subscriber_id: subscriberId
          }
        }, { onConflict: 'payment_reference' });
      }

      if (!API_KEY) {
        throw new Error('Les clés API Notch Pay ne sont pas configurées sur le serveur');
      }

      const initPayload = {
        amount,
        currency: 'XAF',
        reference,
        description: planConfig.label,
        email: subscriberEmail,
        phone: '+237' + phone,
      };

      const initResponse = await fetch('https://api.notchpay.co/payments', {
        method: 'POST',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(initPayload)
      });

      const initData = await initResponse.json();
      if (!initResponse.ok) {
        throw new Error(initData.message || initData.error || 'Erreur lors de l\'initialisation de l\'abonnement');
      }

      const txReference = initData?.transaction?.reference || reference;
      const channel = method === 'momo' ? 'cm.mtn' : 'cm.orange';

      const completeResponse = await fetch(`https://api.notchpay.co/payments/${txReference}`, {
        method: 'PUT',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          channel,
          data: { phone: '+237' + phone }
        })
      });

      const completeData = await completeResponse.json();

      if (!completeResponse.ok) {
        return new Response(JSON.stringify({
          success: true,
          reference: txReference,
          internal_reference: reference,
          authorization_url: initData.authorization_url,
          direct_charge: false,
          amount,
          plan_label: planConfig.label,
          error_detail: completeData.message || 'Canal Mobile Money direct indisponible'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        reference: txReference,
        internal_reference: reference,
        direct_charge: true,
        amount,
        plan_label: planConfig.label,
        expires_at: expiresAt.toISOString(),
        message: 'Push USSD envoyé sur votre téléphone (+237 ' + phone + '). Entrez votre code PIN pour activer votre abonnement.'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Vérification du statut et activation automatique
    if (action === 'status') {
      const reference = reqData.reference;
      const internalRef = reqData.internal_reference || reference;
      if (!reference) throw new Error('Référence de transaction manquante');

      // Vérifier d'abord en base si le webhook a déjà activé l'abonnement
      if (supabase) {
        const { data: subRow } = await supabase
          .from('subscriptions')
          .select('*')
          .or(`payment_reference.eq.${reference},payment_reference.eq.${internalRef}`)
          .maybeSingle();

        if (subRow && subRow.status === 'active') {
          return new Response(JSON.stringify({
            success: true,
            status: 'SUCCESSFUL',
            subscription: subRow
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      if (!API_KEY) throw new Error('Clé API Notch Pay manquante');

      const response = await fetch(`https://api.notchpay.co/payments/${reference}`, {
        method: 'GET',
        headers: {
          'Authorization': API_KEY,
          'Accept': 'application/json'
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Erreur lors de la vérification du statut');
      }

      const rawStatus = String(data?.transaction?.status || '').toLowerCase();
      let mappedStatus = 'PENDING';
      if (rawStatus === 'complete' || rawStatus === 'successful' || rawStatus === 'paid') {
        mappedStatus = 'SUCCESSFUL';
      } else if (rawStatus === 'canceled' || rawStatus === 'cancelled' || rawStatus === 'failed' || rawStatus === 'expired') {
        mappedStatus = 'FAILED';
      }

      // Si payé, activer immédiatement l'abonnement dans Supabase
      if (mappedStatus === 'SUCCESSFUL' && supabase) {
        await supabase.rpc('activate_subscription_by_reference', { p_reference: internalRef });
      }

      return new Response(JSON.stringify({
        success: true,
        status: mappedStatus,
        raw_status: rawStatus
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Action non reconnue');
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error?.message || String(error)
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

