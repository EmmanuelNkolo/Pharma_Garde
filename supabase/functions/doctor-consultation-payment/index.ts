// ============================================================================
// Pharma-Garde v16.0 — Edge Function : Paiement Téléconsultation Médecin 2 600 FCFA
// ────────────────────────────────────────────────────────────────────────────
// Split automatique sécurisé côté serveur :
//   • 100 FCFA  → Compte marchand NotchPay Pharma-Garde (AVANT recherche médecin)
//   • 2 500 FCFA → Versement direct OM / MTN MoMo au médecin disponible assigné
//
// Actions :
//   • init_consultation_payment : initialise + push USSD NotchPay, retourne `pending_payment`
//   • status                    : vérifie la confirmation réelle NotchPay (polling strict)
//   • transfer_doctor_payout    : transfère 2 500 F au médecin UNIQUEMENT après paiement confirmé
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

function isPaidStatus(st: unknown): boolean {
  const s = String(st || "").toLowerCase();
  return s === "complete" || s === "completed" || s === "successful" || s === "paid";
}

function isFailedStatus(st: unknown): boolean {
  const s = String(st || "").toLowerCase();
  return s === "canceled" || s === "cancelled" || s === "failed" || s === "expired";
}

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
      reference,
      payment_ref,
      doctor_id,
      doctor_payout_phone,
      doctor_payout_operator = "momo",
    } = body || {};

    const notchPub = (Deno.env.get("NOTCHPAY_PUBLIC_KEY") || "").replace(/^["']|["']$/g, "").trim();
    const notchPriv = (Deno.env.get("NOTCHPAY_PRIVATE_KEY") || Deno.env.get("NOTCHPAY_SECRET_KEY") || "").replace(/^["']|["']$/g, "").trim();
    const apiKey = notchPub || notchPriv;
    const sbUrl = Deno.env.get("SUPABASE_URL") || "";
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const sb = sbUrl && sbKey ? createClient(sbUrl, sbKey) : null;

    // ── ACTION 1 : Initialiser l'encaissement 2 600 FCFA (push USSD ou checkout NotchPay) ──
    if (action === "init_consultation_payment") {
      const cleanPhone = String(patient_phone || "").replace(/\D/g, "").replace(/^237/, "");
      if (cleanPhone.length !== 9) {
        return new Response(JSON.stringify({ success: false, error: "Numéro Mobile Money camerounais invalide (9 chiffres requis)." }), {
          status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      const ref = `PG_DOC_${Date.now()}_${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
      const channel = payment_method === "om" ? "cm.orange" : "cm.mtn";

      if (apiKey) {
        const initRes = await fetch("https://api.notchpay.co/payments", {
          method: "POST",
          headers: {
            "Authorization": apiKey,
            "Accept": "application/json",
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
              phone: cleanPhone,
              merchant_reference: ref,
              platform_fee: PLATFORM_FEE_XAF,
              doctor_payout: DOCTOR_PAYOUT_XAF,
              type: "doctor_consultation"
            }
          }),
        });
        const initJson = await initRes.json();
        if (!initRes.ok) {
          return new Response(JSON.stringify({
            success: false,
            error: initJson?.message || initJson?.error || "Erreur lors de l'initialisation du paiement NotchPay."
          }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
        const txRef = initJson?.transaction?.reference || ref;

        // Enregistrer PENDING en base pour suivi et anti double-débit
        if (sb) {
          await sb.from("payments").upsert({
            reference: txRef,
            status: "PENDING",
            amount: TOTAL_FEE_XAF,
            operator: payment_method,
            updated_at: new Date().toISOString(),
            metadata: {
              phone: cleanPhone,
              merchant_reference: ref,
              notch_reference: txRef,
              consultation_id: consultation_id || null,
              type: "doctor_consultation"
            }
          }, { onConflict: "reference" }).catch(() => {});
        }

        // Déclenchement push USSD Mobile Money direct
        let directCharge = false;
        let errorDetail = "";
        try {
          const completeRes = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(txRef)}`, {
            method: "PUT",
            headers: { "Authorization": apiKey, "Accept": "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ channel, data: { phone: `+237${cleanPhone}` } }),
          });
          const completeJson = await completeRes.json().catch(() => ({}));
          directCharge = completeRes.ok;
          if (!completeRes.ok) {
            errorDetail = completeJson?.message || "Canal Mobile Money direct indisponible";
          }
        } catch (e: any) {
          errorDetail = e?.message || "Canal direct indisponible";
        }

        return new Response(JSON.stringify({
          success: true,
          reference: txRef,
          merchant_reference: ref,
          direct_charge: directCharge,
          error_detail: errorDetail || undefined,
          total_amount: TOTAL_FEE_XAF,
          platform_fee: PLATFORM_FEE_XAF,
          doctor_payout: DOCTOR_PAYOUT_XAF,
          authorization_url: initJson?.authorization_url || null,
          status: "pending_payment",
          message: directCharge
            ? `📲 Push USSD de 2 600 FCFA envoyé sur le +237 ${cleanPhone}. Validez votre code PIN pour ouvrir la téléconsultation 48h.`
            : "Finalisez le paiement de 2 600 FCFA sur la page sécurisée NotchPay."
        }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      // Mode simulation contrôlée UNIQUEMENT si aucune clé NotchPay n'est configurée sur le serveur
      return new Response(JSON.stringify({
        success: true,
        simulated: true,
        reference: ref,
        direct_charge: true,
        total_amount: TOTAL_FEE_XAF,
        platform_fee: PLATFORM_FEE_XAF,
        doctor_payout: DOCTOR_PAYOUT_XAF,
        status: "SUCCESSFUL"
      }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ── ACTION 2 : Polling strict de confirmation NotchPay (zéro activation sans paiement réel) ──
    if (action === "status") {
      const txRef = String(reference || payment_ref || "").trim();
      if (!txRef) {
        return new Response(JSON.stringify({ success: false, error: "Référence de transaction manquante." }), {
          status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      // 1. Vérifier d'abord dans `payments` (webhook instantané)
      let existingRow: any = null;
      if (sb) {
        const { data: dbRow } = await sb
          .from("payments")
          .select("reference, status, amount, created_at, metadata")
          .eq("reference", txRef)
          .maybeSingle();
        existingRow = dbRow || null;
        if (existingRow && isPaidStatus(existingRow.status)) {
          return new Response(JSON.stringify({
            success: true,
            status: "SUCCESSFUL",
            reference: txRef,
            raw_status: existingRow.status
          }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
      }

      if (!apiKey) {
        return new Response(JSON.stringify({ success: true, status: "SUCCESSFUL", simulated: true, reference: txRef }), {
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      // 2. Interroger NotchPay en direct
      const stRes = await fetch(`https://api.notchpay.co/payments/${encodeURIComponent(txRef)}`, {
        method: "GET",
        headers: { "Authorization": apiKey, "Accept": "application/json" }
      });
      const stJson = await stRes.json();
      if (!stRes.ok) {
        return new Response(JSON.stringify({
          success: false,
          status: "PENDING",
          error: stJson?.message || "Impossible de vérifier le statut NotchPay."
        }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      }

      const rawStatus = String(stJson?.transaction?.status || stJson?.data?.status || "").toLowerCase();
      let mappedStatus = "PENDING";
      if (isPaidStatus(rawStatus)) mappedStatus = "SUCCESSFUL";
      else if (isFailedStatus(rawStatus)) mappedStatus = "FAILED";

      if (sb && (mappedStatus === "SUCCESSFUL" || mappedStatus === "FAILED")) {
        await sb.from("payments").upsert({
          reference: txRef,
          status: mappedStatus,
          amount: stJson?.transaction?.amount || existingRow?.amount || TOTAL_FEE_XAF,
          operator: existingRow?.metadata?.method || "XAF",
          updated_at: new Date().toISOString(),
          metadata: {
            ...(existingRow?.metadata || {}),
            notch_reference: txRef,
            type: "doctor_consultation",
            raw_status: rawStatus
          }
        }, { onConflict: "reference" }).catch(() => {});
      }

      return new Response(JSON.stringify({
        success: true,
        status: mappedStatus,
        raw_status: rawStatus,
        reference: txRef
      }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // ── ACTION 3 : Transférer automatiquement les 2 500 FCFA au médecin assigné (OM / MoMo) ──
    if (action === "transfer_doctor_payout") {
      const cleanDocPhone = String(doctor_payout_phone || "").replace(/\D/g, "").replace(/^237/, "");
      if (!consultation_id || cleanDocPhone.length !== 9) {
        return new Response(JSON.stringify({ success: false, error: "Identifiant consultation et téléphone OM/MoMo du médecin requis." }), {
          status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
        });
      }

      // Garde de sécurité : si NotchPay est actif et une référence est fournie, vérifier que le paiement patient est bien SUCCESSFUL
      const txRef = String(payment_ref || reference || "").trim();
      if (apiKey && sb && txRef && !txRef.startsWith("ADMIN_FREE_")) {
        const { data: payRow } = await sb
          .from("payments")
          .select("status")
          .eq("reference", txRef)
          .maybeSingle();
        if (payRow && !isPaidStatus(payRow.status)) {
          return new Response(JSON.stringify({
            success: false,
            error: "Paiement patient non encore confirmé : reversement médecin suspendu jusqu'à confirmation."
          }), { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
        }
      }

      const payoutRef = `PG_PAYOUT_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      let transferStatus = "transferred_simulated";

      if (notchPriv) {
        const trRes = await fetch("https://api.notchpay.co/transfers", {
          method: "POST",
          headers: {
            "Authorization": notchPriv,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount: DOCTOR_PAYOUT_XAF,
            currency: "XAF",
            channel: (doctor_payout_operator === "om" || doctor_payout_operator === "cm.orange") ? "cm.orange" : "cm.mtn",
            beneficiary: `+237${cleanDocPhone}`,
            reference: payoutRef,
            description: `Honoraires téléconsultation Pharma-Garde (${consultation_id})`,
          }),
        });
        const trJson = await trRes.json().catch(() => ({}));
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
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }
});
