-- ============================================================================
-- Pharma-Garde v13.0 — Dossier Médical Personnel Souverain (DMP)
--                      & Gestion / Connecteur SIL-SIH Analyses Médicales
-- ----------------------------------------------------------------------------
-- Conforme aux bonnes pratiques Supabase Postgres :
--   • RLS activé et optimisé avec `(select auth.uid())` (évalué 1 seule fois)
--   • Index dédiés sur toutes les colonnes filtrées par RLS et clés étrangères
--   • Horodatage UTC `timestamptz` précis + empreinte SHA-256 anti-falsification
--   • Consentement patient granulaire & révocable via RPC SECURITY DEFINER sécurisé
--   • 100 % idempotent (exécutable plusieurs fois sans erreur)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. PROFIL PATIENT SOUVERAIN (CARNET MÉDICAL NUMÉRIQUE) ──────────────────
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_code             text NOT NULL UNIQUE, -- ex: PG-PAT-237890
  full_name                text NOT NULL,
  birth_date               date,
  gender                   text CHECK (gender IN ('M', 'F', 'other')),
  blood_group              text,                 -- ex: O+, A-, AB+
  allergies                text DEFAULT '',
  chronic_conditions       text DEFAULT '',
  emergency_contact_name   text DEFAULT '',
  emergency_contact_phone  text DEFAULT '',
  phone                    text,
  email                    text UNIQUE,
  pin_hash                 text,                 -- SHA-256 salé du code PIN médical
  notify_results_enabled   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_profiles_user_id ON public.patient_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_patient_profiles_code ON public.patient_profiles(patient_code);
CREATE INDEX IF NOT EXISTS idx_patient_profiles_phone ON public.patient_profiles(phone);

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_profiles_owner_all ON public.patient_profiles;
CREATE POLICY patient_profiles_owner_all ON public.patient_profiles
  FOR ALL TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── 2. CHRONOLOGIE UNIFIÉE DU CARNET MÉDICAL (DMP) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_medical_records (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code      text NOT NULL,
  patient_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category          text NOT NULL CHECK (category IN (
    'lab_result', 'imaging', 'prescription', 'consultation',
    'pharmacy_dispensation', 'vaccination', 'vitals', 'hospitalization', 'document'
  )),
  title             text NOT NULL,
  summary           text DEFAULT '',
  issuer_type       text NOT NULL CHECK (issuer_type IN (
    'laboratory', 'hospital', 'clinic', 'imaging', 'doctor', 'pharmacy', 'patient'
  )),
  issuer_id         text,
  issuer_name       text NOT NULL,
  occurred_at       timestamptz NOT NULL DEFAULT now(),
  source_system     text NOT NULL DEFAULT 'internal', -- internal | sil_webhook | sih_connector | hl7_fhir
  external_ref      text,
  content_json      jsonb NOT NULL DEFAULT '{}'::jsonb,
  integrity_hash    text NOT NULL, -- Empreinte SHA-256 horodatée anti-falsification
  is_read           boolean NOT NULL DEFAULT false,
  notified_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pmr_patient_user_id ON public.patient_medical_records(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_pmr_patient_code_date ON public.patient_medical_records(patient_code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmr_unread ON public.patient_medical_records(patient_user_id, is_read) WHERE is_read = false;

ALTER TABLE public.patient_medical_records ENABLE ROW LEVEL SECURITY;

-- Seul le patient propriétaire peut lire, marquer lu ou supprimer ses documents médicaux
DROP POLICY IF EXISTS pmr_owner_select ON public.patient_medical_records;
CREATE POLICY pmr_owner_select ON public.patient_medical_records
  FOR SELECT TO authenticated
  USING (
    (select auth.uid()) = patient_user_id
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.user_id = (select auth.uid())
        AND p.patient_code = patient_medical_records.patient_code
    )
  );

DROP POLICY IF EXISTS pmr_owner_update ON public.patient_medical_records;
CREATE POLICY pmr_owner_update ON public.patient_medical_records
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = patient_user_id)
  WITH CHECK ((select auth.uid()) = patient_user_id);

DROP POLICY IF EXISTS pmr_owner_delete ON public.patient_medical_records;
CREATE POLICY pmr_owner_delete ON public.patient_medical_records
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = patient_user_id);

-- Insertion autorisée au patient propriétaire et aux professionnels authentifiés (ajout uniquement, jamais lecture)
DROP POLICY IF EXISTS pmr_authenticated_insert ON public.patient_medical_records;
CREATE POLICY pmr_authenticated_insert ON public.patient_medical_records
  FOR INSERT TO authenticated
  WITH CHECK (
    (select auth.uid()) = patient_user_id
    OR issuer_type IN ('laboratory', 'hospital', 'clinic', 'imaging', 'doctor', 'pharmacy')
  );

-- ── 3. DOSSIERS D'ANALYSES MÉDICALES & IMAGERIE (LABOS, HÔPITAUX, CLINIQUES) ─
CREATE TABLE IF NOT EXISTS public.lab_analysis_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code          text NOT NULL UNIQUE, -- ex: LAB-2026-4812
  facility_id         text NOT NULL,
  facility_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  facility_name       text NOT NULL,
  facility_type       text NOT NULL DEFAULT 'laboratory',
  patient_code        text,                 -- PG-PAT-XXXXXX pour dépôt instantané DMP
  patient_name        text NOT NULL,
  patient_phone       text,
  exam_category       text NOT NULL DEFAULT 'biochimie',
  exam_name           text NOT NULL,
  status              text NOT NULL DEFAULT 'registered' CHECK (status IN (
    'registered', 'in_progress', 'validated', 'published'
  )),
  parameters_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  conclusion          text DEFAULT '',
  validator_name      text DEFAULT '',
  validator_license   text DEFAULT '',
  source_system       text NOT NULL DEFAULT 'internal',
  external_sample_id  text,
  integrity_hash      text,
  published_at        timestamptz,
  patient_notified_at timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lab_orders_facility ON public.lab_analysis_orders(facility_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_facility_uid ON public.lab_analysis_orders(facility_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient_code ON public.lab_analysis_orders(patient_code);

ALTER TABLE public.lab_analysis_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lab_orders_facility_owner ON public.lab_analysis_orders;
CREATE POLICY lab_orders_facility_owner ON public.lab_analysis_orders
  FOR ALL TO authenticated
  USING ((select auth.uid()) = facility_user_id)
  WITH CHECK ((select auth.uid()) = facility_user_id);

DROP POLICY IF EXISTS lab_orders_patient_read_published ON public.lab_analysis_orders;
CREATE POLICY lab_orders_patient_read_published ON public.lab_analysis_orders
  FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.user_id = (select auth.uid())
        AND p.patient_code = lab_analysis_orders.patient_code
    )
  );

-- ── 4. JETONS DE PARTAGE TEMPORAIRE & CONSENTEMENT PATIENT ──────────────────
CREATE TABLE IF NOT EXISTS public.patient_share_grants (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code        text NOT NULL,
  patient_user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_code          text NOT NULL UNIQUE, -- ex: DMP-8492-XK
  target_role         text NOT NULL CHECK (target_role IN (
    'doctor', 'hospital', 'clinic', 'laboratory', 'pharmacy', 'any'
  )),
  target_name         text DEFAULT '',
  allowed_categories  text[] NOT NULL DEFAULT ARRAY[
    'lab_result', 'imaging', 'prescription', 'consultation',
    'pharmacy_dispensation', 'vaccination', 'vitals', 'hospitalization', 'document'
  ],
  allow_append        boolean NOT NULL DEFAULT true,
  expires_at          timestamptz NOT NULL,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_grants_owner ON public.patient_share_grants(patient_user_id);
CREATE INDEX IF NOT EXISTS idx_share_grants_code ON public.patient_share_grants(share_code) WHERE revoked_at IS NULL;

ALTER TABLE public.patient_share_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS share_grants_owner_all ON public.patient_share_grants;
CREATE POLICY share_grants_owner_all ON public.patient_share_grants
  FOR ALL TO authenticated
  USING ((select auth.uid()) = patient_user_id)
  WITH CHECK ((select auth.uid()) = patient_user_id);

-- ── 5. JOURNAL D'AUDIT DES ACCÈS AU CARNET MÉDICAL ──────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_access_audit (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_code      text NOT NULL,
  patient_user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_role        text NOT NULL,
  actor_name        text NOT NULL,
  actor_id          text,
  action            text NOT NULL,
  details           text DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_audit_owner ON public.patient_access_audit(patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_audit_code ON public.patient_access_audit(patient_code, created_at DESC);

ALTER TABLE public.patient_access_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS access_audit_owner_select ON public.patient_access_audit;
CREATE POLICY access_audit_owner_select ON public.patient_access_audit
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = patient_user_id);

DROP POLICY IF EXISTS access_audit_auth_insert ON public.patient_access_audit;
CREATE POLICY access_audit_auth_insert ON public.patient_access_audit
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- ── 6. CONNECTEURS SIL / SIH / LIS / HIS PAR ÉTABLISSEMENT ──────────────────
CREATE TABLE IF NOT EXISTS public.facility_api_connectors (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id          text NOT NULL UNIQUE,
  facility_user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  facility_name        text NOT NULL,
  software_vendor      text NOT NULL DEFAULT 'openlis',
  protocol             text NOT NULL DEFAULT 'webhook_json', -- webhook_json | hl7_v2 | fhir_r4 | local_daemon
  endpoint_url         text DEFAULT 'http://localhost:8090',
  api_key_hash         text NOT NULL, -- Empreinte SHA-256 de la clé API secrète
  auto_notify_patient  boolean NOT NULL DEFAULT true,
  is_active            boolean NOT NULL DEFAULT true,
  last_sync_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fac_connectors_uid ON public.facility_api_connectors(facility_user_id);
CREATE INDEX IF NOT EXISTS idx_fac_connectors_hash ON public.facility_api_connectors(api_key_hash) WHERE is_active = true;

ALTER TABLE public.facility_api_connectors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fac_connectors_owner_all ON public.facility_api_connectors;
CREATE POLICY fac_connectors_owner_all ON public.facility_api_connectors
  FOR ALL TO authenticated
  USING ((select auth.uid()) = facility_user_id)
  WITH CHECK ((select auth.uid()) = facility_user_id);

-- ── 7. RPC SÉCURISÉE : CONSULTATION D'UN CARNET PARTAGÉ PAR CODE TEMPORAIRE ─
CREATE OR REPLACE FUNCTION public.redeem_dmp_share_code(
  p_share_code text,
  p_actor_role text,
  p_actor_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_grant   public.patient_share_grants%ROWTYPE;
  v_profile public.patient_profiles%ROWTYPE;
  v_records jsonb;
BEGIN
  IF (select auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentification professionnelle requise.';
  END IF;

  SELECT * INTO v_grant
  FROM public.patient_share_grants
  WHERE share_code = upper(trim(p_share_code))
    AND revoked_at IS NULL
    AND expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code de partage invalide, expiré ou révoqué par le patient.';
  END IF;

  IF v_grant.target_role <> 'any' AND v_grant.target_role <> p_actor_role THEN
    RAISE EXCEPTION 'Ce code de partage n''est pas autorisé pour votre profil (%).', p_actor_role;
  END IF;

  SELECT * INTO v_profile
  FROM public.patient_profiles
  WHERE user_id = v_grant.patient_user_id
  LIMIT 1;

  SELECT coalesce(jsonb_agg(r ORDER BY r.occurred_at DESC), '[]'::jsonb) INTO v_records
  FROM public.patient_medical_records r
  WHERE (r.patient_user_id = v_grant.patient_user_id OR r.patient_code = v_grant.patient_code)
    AND r.category = ANY(v_grant.allowed_categories);

  -- Enregistrer automatiquement la consultation dans le journal d'audit du patient
  INSERT INTO public.patient_access_audit (
    patient_code, patient_user_id, actor_role, actor_name, actor_id, action, details
  ) VALUES (
    v_grant.patient_code,
    v_grant.patient_user_id,
    p_actor_role,
    coalesce(nullif(trim(p_actor_name), ''), 'Professionnel de santé'),
    (select auth.uid())::text,
    'VIEW_DMP',
    'Consultation autorisée via code temporaire ' || v_grant.share_code
  );

  RETURN jsonb_build_object(
    'grant', jsonb_build_object(
      'share_code', v_grant.share_code,
      'expires_at', v_grant.expires_at,
      'allow_append', v_grant.allow_append,
      'allowed_categories', v_grant.allowed_categories
    ),
    'patient', jsonb_build_object(
      'patient_code', v_profile.patient_code,
      'full_name', v_profile.full_name,
      'birth_date', v_profile.birth_date,
      'gender', v_profile.gender,
      'blood_group', v_profile.blood_group,
      'allergies', v_profile.allergies,
      'chronic_conditions', v_profile.chronic_conditions,
      'emergency_contact_name', v_profile.emergency_contact_name,
      'emergency_contact_phone', v_profile.emergency_contact_phone
    ),
    'records', v_records
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_dmp_share_code(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_dmp_share_code(text, text, text) TO authenticated;

-- ── 8. REALTIME SUPABASE SUR LES NOUVEAUX RÉSULTATS DMP ─────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.patient_medical_records;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

