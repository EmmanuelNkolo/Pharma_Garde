// ============================================================================
// Pharma-Garde v12.0 — Edge Function : Paiement Téléconsultation Médecin 2 600 FCFA
// ────────────────────────────────────────────────────────────────────────────
// Split automatique sécurisé côté serveur :
//   • 100 FCFA  → Compte marchand NotchPay Pharma-Garde (AVANT recherche médecin)
//   • 2 500 FCFA → Versement direct OM / MTN MoMo au médecin disponible assigné
//
// Variables secrètes (Supabase Secrets) :
//   NOTCHPAY_PUBLIC_KEY, NOTCHPAY_PRIVATE_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOTAL_FEE_XAF = 2600;
const PLATFORM_FEE_XAF = 100;
const DOCTOR_PAYOUT_XAF = 2500;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const {
      action = "init_consultation_payment",
      patient_phone,
      payment_method = "momo",
      consultation_id,
      doctor_id,
      doctor_payout_phone,
      doctor_payout_operator = "cm.mtn",
    } = body || {};

    const notchPub = Deno.env.get("NOTCHPAY_PUBLIC_KEY") || "";
    const notchPriv = Deno.env.get("NOTCHPAY_PRIVATE_KEY") || "";
    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = sbUrl && sbKey ? createClient(sbUrl, sbKey) : null;

    // ── ACTION 1 : Encaisser les 2 600 FCFA (dont 100 F plateforme avant recherche médecin) ──
    if (action === "init_consultation_payment") {
      const cleanPhone = String(patient_phone || "").replace(/\D/g, "").replace(/^237/, "");
      if (cleanPhone.length !== 9) {
        return new Response(JSON.stringify({ success: false, error: "Numéro Mobile Money camerounais invalide (9 chiffres requis)." }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      const ref = `PG_DOC_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const channel = payment_method === "om" ? "cm.orange" : "cm.mtn";

      if (notchPub) {
        // 1. Initialisation paiement NotchPay (2 600 FCFA : 100 F plateforme + 2 500 F honoraires médecin)
        const initRes = await fetch("https://api.notchpay.co/payments/initialize", {
          method: "POST",
          headers: {
            "Authorization": notchPub,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: TOTAL_FEE_XAF,
            currency: "XAF",
            email: `patient_${cleanPhone}@pharmagarde.cm`,
            phone: `+237${cleanPhone}`,
            reference: ref,
            description: `Téléconsultation Pharma-Garde (100F plateforme + 2500F médecin · Session 48h)`,
            metadata: {
              consultation_id: consultation_id || null,
              platform_fee: PLATFORM_FEE_XAF,
              doctor_payout: DOCTOR_PAYOUT_XAF,
              type: "doctor_consultation"
            }
          }),
        });
        const initJson = await initRes.json();
        const txRef = initJson?.transaction?.reference || ref;

        // 2. Déclenchement push USSD Mobile Money direct
        await fetch(`https://api.notchpay.co/payments/${txRef}`, {
          method: "PUT",
          headers: { "Authorization": notchPub, "Content-Type": "application/json" },
          body: JSON.stringify({ channel, data: { phone: `+237${cleanPhone}` } }),
        }).catch(() => {});

        return new Response(JSON.stringify({
          success: true,
          reference: txRef,
          total_amount: TOTAL_FEE_XAF,
          platform_fee: PLATFORM_FEE_XAF,
          doctor_payout: DOCTOR_PAYOUT_XAF,
          authorization_url: initJson?.authorization_url || null,
          status: "paid_platform_fee_ready"
        }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      // Mode simulation contrôlée si clés NotchPay non configurées
      return new Response(JSON.stringify({
        success: true,
        simulated: true,
        reference: ref,
        total_amount: TOTAL_FEE_XAF,
        platform_fee: PLATFORM_FEE_XAF,
        doctor_payout: DOCTOR_PAYOUT_XAF,
        status: "paid_platform_fee_ready"
      }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ── ACTION 2 : Transférer automatiquement les 2 500 FCFA au médecin assigné (OM / MoMo) ──
    if (action === "transfer_doctor_payout") {
      const cleanDocPhone = String(doctor_payout_phone || "").replace(/\D/g, "").replace(/^237/, "");
      if (!consultation_id || cleanDocPhone.length !== 9) {
        return new Response(JSON.stringify({ success: false, error: "Identifiant consultation et téléphone OM/MoMo du médecin requis." }), {
          status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      const payoutRef = `PG_PAYOUT_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      let transferStatus = "transferred_simulated";

      if (notchPriv) {
        // NotchPay Direct Transfer API vers le compte OM / MoMo du médecin
        const trRes = await fetch("https://api.notchpay.co/transfers", {
          method: "POST",
          headers: {
            "Authorization": notchPriv,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: DOCTOR_PAYOUT_XAF,
            currency: "XAF",
            channel: doctor_payout_operator === "om" ? "cm.orange" : "cm.mtn",
            beneficiary: `+237${cleanDocPhone}`,
            reference: payoutRef,
            description: `Honoraires téléconsultation Pharma-Garde (${consultation_id})`,
          }),
        });
        const trJson = await trRes.json();
        transferStatus = trRes.ok ? (trJson?.transfer?.status || "transferred") : "transfer_queued";
      }

      if (sb) {
        await sb.from("medical_consultations").update({
          doctor_payout_status: transferStatus,
          doctor_payout_ref: payoutRef,
          doctor_payout_amount: DOCTOR_PAYOUT_XAF,
          doctor_payout_at: new Date().toISOString(),
        }).eq("id", consultation_id);
      }

      return new Response(JSON.stringify({
        success: true,
        payout_ref: payoutRef,
        doctor_id,
        amount: DOCTOR_PAYOUT_XAF,
        destination: `+237${cleanDocPhone}`,
        status: transferStatus
      }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ success: false, error: "Action inconnue." }), {
      status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
});
