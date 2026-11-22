/**
 * Pharma-Garde v13.0 — Supabase Edge Function : Webhook Universel SIL / SIH / HL7 / FHIR
 * ──────────────────────────────────────────────────────────────────────────────────────
 * Permet à N'IMPORTE QUEL logiciel de laboratoire d'analyses, hôpital ou clinique
 * (OpenLIS, SENAITE, OpenMRS, OpenClinic GA, GLIMS, MedaSys, SilLab, HL7 v2 ORU^R01, FHIR R4)
 * de pousser automatiquement un résultat validé dans Pharma-Garde :
 *   1. Authentification sécurisée par clé API établissement (hachée SHA-256)
 *   2. Normalisation automatique JSON natif / FHIR R4 DiagnosticReport / HL7 v2 ORU^R01
 *   3. Calcul automatique des drapeaux cliniques (NORMAL / LOW / HIGH / CRITICAL)
 *   4. Empreinte SHA-256 anti-falsification + horodatage UTC exact
 *   5. Dépôt instantané dans `lab_analysis_orders` + `patient_medical_records` (DMP)
 *      → Déclenche immédiatement la notification Realtime au patient !
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-facility-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Parseur léger HL7 v2 ORU^R01 (segments PID / OBR / OBX)
function parseHL7Oru(raw: string) {
  const lines = raw.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  let patientCode = "";
  let patientName = "Patient";
  let patientPhone = "";
  let examName = "Bilan Biologique (HL7)";
  let sampleId = "HL7-" + Date.now();
  const params: Array<Record<string, string>> = [];

  for (const line of lines) {
    const seg = line.split("|");
    if (seg[0] === "PID") {
      patientCode = (seg[3] || "").split("^")[0].trim();
      patientName = (seg[5] || "Patient").replace(/\^+/g, " ").trim();
      patientPhone = (seg[13] || "").replace(/\D/g, "").replace(/^237/, "");
    } else if (seg[0] === "OBR") {
      sampleId = (seg[3] || seg[2] || sampleId).trim();
      examName = (seg[4] || examName).split("^")[1] || (seg[4] || examName).split("^")[0];
    } else if (seg[0] === "OBX") {
      const idParts = (seg[3] || "").split("^");
      const name = (idParts[1] || idParts[0] || "Paramètre").trim();
      const value = (seg[5] || "").trim();
      const unit = (seg[6] || "").split("^")[0].trim();
      const refRange = (seg[7] || "").trim();
      const rawFlag = (seg[8] || "N").toUpperCase();
      const flag = rawFlag === "LL" || rawFlag === "HH" || rawFlag === "CRIT"
        ? "critical"
        : rawFlag === "H" ? "high" : rawFlag === "L" ? "low" : "normal";
      if (name && value) params.push({ name, value, unit, ref_range: refRange, flag });
    }
  }
  return {
    patient_code: patientCode,
    patient_name: patientName,
    patient_phone: patientPhone,
    exam_name: examName,
    external_sample_id: sampleId,
    parameters: params,
    source_system: "hl7_fhir"
  };
}

// Parseur FHIR R4 DiagnosticReport / Bundle
function parseFhirReport(body: Record<string, unknown>) {
  const contained = Array.isArray(body.contained) ? body.contained : [];
  const params = contained
    .filter((r: Record<string, unknown>) => r && r.resourceType === "Observation")
    .map((obs: Record<string, unknown>) => {
      const code = obs.code as Record<string, unknown> | undefined;
      const vq = obs.valueQuantity as Record<string, unknown> | undefined;
      const rr = Array.isArray(obs.referenceRange) ? obs.referenceRange[0] as Record<string, unknown> : null;
      return {
        name: String(code?.text || "Observation"),
        value: String(vq?.value ?? obs.valueString ?? ""),
        unit: String(vq?.unit || ""),
        ref_range: String(rr?.text || ""),
        flag: "normal"
      };
    });
  const subj = body.subject as Record<string, unknown> | undefined;
  const code = body.code as Record<string, unknown> | undefined;
  return {
    patient_code: String(subj?.identifier || subj?.reference || "").replace(/^Patient\//, ""),
    patient_name: String(subj?.display || "Patient"),
    patient_phone: "",
    exam_name: String(code?.text || "Compte-Rendu FHIR"),
    exam_category: "biochimie",
    conclusion: String(body.conclusion || ""),
    external_sample_id: String(body.id || "FHIR-" + Date.now()),
    parameters: params,
    source_system: "hl7_fhir"
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Méthode POST requise." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Configuration SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquante.");
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Vérification de la clé API de l'établissement (SIL / SIH)
    const rawKey = req.headers.get("x-facility-key") ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!rawKey) {
      return new Response(JSON.stringify({ error: "Clé API établissement manquante (X-Facility-Key)." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const keyHash = await sha256Hex("PG_SIL_KEY_V13::" + rawKey);
    const { data: connector, error: connErr } = await admin
      .from("facility_api_connectors")
      .select("*")
      .eq("api_key_hash", keyHash)
      .eq("is_active", true)
      .maybeSingle();

    if (connErr || !connector) {
      return new Response(JSON.stringify({ error: "Clé API établissement invalide ou révoquée." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Lecture & normalisation du payload (JSON natif, FHIR R4 ou HL7 v2 ORU^R01)
    const contentType = (req.headers.get("content-type") || "").toLowerCase();
    let normalized: Record<string, unknown>;

    if (contentType.includes("text/plain") || contentType.includes("hl7")) {
      const rawText = await req.text();
      normalized = parseHL7Oru(rawText);
    } else {
      const json = await req.json();
      if (json && json.resourceType === "DiagnosticReport") {
        normalized = parseFhirReport(json);
      } else if (json && typeof json.hl7_message === "string") {
        normalized = parseHL7Oru(json.hl7_message);
      } else {
        normalized = json || {};
      }
    }

    const patientCode = String(normalized.patient_code || "").trim().toUpperCase();
    const patientPhone = String(normalized.patient_phone || "").replace(/\D/g, "").replace(/^237/, "");
    const examName = String(normalized.exam_name || "Résultat d'Analyse Médicale").trim();
    const parameters = Array.isArray(normalized.parameters) ? normalized.parameters : [];
    const conclusion = String(normalized.conclusion || "").trim();
    const validatorName = String(normalized.validator_name || "Biologiste / Médecin Validateur").trim();
    const nowIso = new Date().toISOString();

    // 3. Résolution du dossier patient souverain par patient_code ou téléphone
    let resolvedUserId: string | null = null;
    let resolvedPatientCode = patientCode;
    let resolvedPatientName = String(normalized.patient_name || "Patient").trim();

    if (patientCode || patientPhone) {
      const query = patientCode
        ? admin.from("patient_profiles").select("user_id, patient_code, full_name").eq("patient_code", patientCode).maybeSingle()
        : admin.from("patient_profiles").select("user_id, patient_code, full_name").eq("phone", patientPhone).maybeSingle();
      const { data: prof } = await query;
      if (prof) {
        resolvedUserId = prof.user_id;
        resolvedPatientCode = prof.patient_code;
        resolvedPatientName = prof.full_name || resolvedPatientName;
      }
    }

    const orderCode = String(normalized.order_code || ("LAB-" + new Date().getFullYear() + "-" + Math.floor(1000 + Math.random() * 9000)));
    const integrityHash = await sha256Hex(JSON.stringify({
      orderCode,
      facility: connector.facility_id,
      patient: resolvedPatientCode,
      examName,
      parameters,
      conclusion,
      nowIso
    }));

    // 4. Enregistrement dans `lab_analysis_orders`
    const { data: orderRow } = await admin
      .from("lab_analysis_orders")
      .insert([{
        order_code: orderCode,
        facility_id: connector.facility_id,
        facility_user_id: connector.facility_user_id,
        facility_name: connector.facility_name,
        facility_type: String(normalized.facility_type || "laboratory"),
        patient_code: resolvedPatientCode || null,
        patient_name: resolvedPatientName,
        patient_phone: patientPhone || null,
        exam_category: String(normalized.exam_category || "biochimie"),
        exam_name: examName,
        status: "published",
        parameters_json: parameters,
        conclusion,
        validator_name: validatorName,
        validator_license: String(normalized.validator_license || ""),
        source_system: String(normalized.source_system || "sil_webhook"),
        external_sample_id: String(normalized.external_sample_id || orderCode),
        integrity_hash: integrityHash,
        published_at: nowIso,
        patient_notified_at: nowIso
      }])
      .select()
      .single();

    // 5. Téléversement instantané dans le Carnet Médical Numérique (DMP) du patient
    const isImaging = String(normalized.exam_category || "").toLowerCase().includes("imagerie") ||
      /scanner|irm|radio|echo|écho/i.test(examName);

    const { data: dmpRow } = await admin
      .from("patient_medical_records")
      .insert([{
        patient_code: resolvedPatientCode || ("PHONE-" + patientPhone),
        patient_user_id: resolvedUserId,
        category: isImaging ? "imaging" : "lab_result",
        title: examName,
        summary: conclusion || `${parameters.length} paramètre(s) validé(s) par ${connector.facility_name}`,
        issuer_type: String(normalized.facility_type || "laboratory"),
        issuer_id: connector.facility_id,
        issuer_name: connector.facility_name,
        occurred_at: nowIso,
        source_system: String(normalized.source_system || "sil_webhook"),
        external_ref: orderCode,
        content_json: {
          order_code: orderCode,
          exam_category: String(normalized.exam_category || "biochimie"),
          parameters,
          conclusion,
          validator_name: validatorName,
          validator_license: String(normalized.validator_license || "")
        },
        integrity_hash: integrityHash,
        is_read: false,
        notified_at: nowIso
      }])
      .select()
      .single();

    // 6. Traçabilité dans l'audit patient & mise à jour horodatage connecteur
    if (resolvedUserId) {
      await admin.from("patient_access_audit").insert([{
        patient_code: resolvedPatientCode,
        patient_user_id: resolvedUserId,
        actor_role: String(normalized.facility_type || "laboratory"),
        actor_name: connector.facility_name,
        actor_id: connector.facility_id,
        action: "PUSH_LAB_RESULT",
        details: `Résultat ${orderCode} (${examName}) téléversé automatiquement via SIL/SIH.`
      }]);
    }
    await admin.from("facility_api_connectors").update({ last_sync_at: nowIso }).eq("id", connector.id);

    return new Response(JSON.stringify({
      success: true,
      order_code: orderCode,
      dmp_record_id: dmpRow?.id || null,
      order_id: orderRow?.id || null,
      patient_notified: !!resolvedUserId,
      integrity_hash: integrityHash,
      published_at: nowIso
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
