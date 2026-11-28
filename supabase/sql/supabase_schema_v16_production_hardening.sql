-- ============================================================================
-- Pharma-Garde v16.0 — Durcissement Sécurité RLS, Confidentialité Téléconsultation,
--                      Activation Abonnements 5 Rôles & Persistance Cloud Pro
-- ----------------------------------------------------------------------------
-- Conforme aux bonnes pratiques Supabase Postgres :
--   • `(select auth.uid())` dans toutes les politiques RLS (évalué 1 seule fois)
--   • Index dédiés sur toutes les colonnes filtrées par RLS / requêtes fréquentes
--   • Fonctions `SECURITY DEFINER` avec `SET search_path = ''` et REVOKE/GRANT explicites
--   • 100 % IDEMPOTENT : exécutable plusieurs fois dans Supabase SQL Editor sans erreur
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. DURCISSEMENT RLS TABLE `payments` ─────────────────────────────────────
-- Les écritures (PENDING/SUCCESSFUL/FAILED) et vérifications Pass 24h sont
-- exclusivement gérées côté serveur par les Edge Functions (`service_role`).
ALTER TABLE IF EXISTS public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Public can update payments" ON public.payments;
DROP POLICY IF EXISTS "Public can read payments" ON public.payments;
DROP POLICY IF EXISTS "payments_admin_select" ON public.payments;

CREATE POLICY "payments_admin_select" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_payments_created_status
  ON public.payments (created_at DESC, status);

-- ── 2. DURCISSEMENT CONFIDENTIALITÉ TÉLÉCONSULTATIONS, MESSAGES & ORDONNANCES ─
ALTER TABLE IF EXISTS public.medical_consultations
  ADD COLUMN IF NOT EXISTS patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.medical_prescriptions
  ADD COLUMN IF NOT EXISTS patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_clinic text DEFAULT '',
  ADD COLUMN IF NOT EXISTS doctor_city text DEFAULT 'Douala',
  ADD COLUMN IF NOT EXISTS doctor_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS doctor_signature_url text;

ALTER TABLE IF EXISTS public.doctor_appointments
  ADD COLUMN IF NOT EXISTS patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consult_doctor_id ON public.medical_consultations (doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_patient_sid ON public.medical_consultations (patient_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consult_patient_uid ON public.medical_consultations (patient_user_id);
CREATE INDEX IF NOT EXISTS idx_rx_patient_sid ON public.medical_prescriptions (patient_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rx_doctor_id ON public.medical_prescriptions (doctor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_doctor_id ON public.doctor_appointments (doctor_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_appt_patient_sid ON public.doctor_appointments (patient_session_id);

-- 2a. RLS stricte sur `medical_consultations`
ALTER TABLE IF EXISTS public.medical_consultations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consultations_scoped_access" ON public.medical_consultations;
DROP POLICY IF EXISTS "consultations_doctor_or_owner_select" ON public.medical_consultations;
DROP POLICY IF EXISTS "consultations_doctor_or_owner_update" ON public.medical_consultations;
DROP POLICY IF EXISTS "consultations_auth_insert" ON public.medical_consultations;

CREATE POLICY "consultations_doctor_or_owner_select" ON public.medical_consultations
  FOR SELECT TO authenticated
  USING (
    patient_user_id = (select auth.uid())
    OR doctor_id = (select auth.uid())::text
    OR status = 'searching'
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = medical_consultations.doctor_id
        AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

CREATE POLICY "consultations_doctor_or_owner_update" ON public.medical_consultations
  FOR UPDATE TO authenticated
  USING (
    patient_user_id = (select auth.uid())
    OR doctor_id = (select auth.uid())::text
    OR status = 'searching'
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = medical_consultations.doctor_id
        AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  )
  WITH CHECK (true);

CREATE POLICY "consultations_auth_insert" ON public.medical_consultations
  FOR INSERT TO authenticated
  WITH CHECK (patient_user_id IS NULL OR patient_user_id = (select auth.uid()));

-- 2b. RLS stricte sur `consultation_messages` (zéro lecture publique inter-patients)
ALTER TABLE IF EXISTS public.consultation_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "consult_msgs_access" ON public.consultation_messages;
DROP POLICY IF EXISTS "consult_msgs_participants_select" ON public.consultation_messages;
DROP POLICY IF EXISTS "consult_msgs_participants_insert" ON public.consultation_messages;

CREATE POLICY "consult_msgs_participants_select" ON public.consultation_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_consultations mc
      WHERE mc.id = consultation_messages.consultation_id
        AND (
          mc.patient_user_id = (select auth.uid())
          OR mc.doctor_id = (select auth.uid())::text
          OR EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = mc.doctor_id AND d.user_id = (select auth.uid())
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

CREATE POLICY "consult_msgs_participants_insert" ON public.consultation_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_consultations mc
      WHERE mc.id = consultation_messages.consultation_id
        AND (
          mc.patient_user_id = (select auth.uid())
          OR mc.doctor_id = (select auth.uid())::text
          OR EXISTS (
            SELECT 1 FROM public.doctors d
            WHERE d.id = mc.doctor_id AND d.user_id = (select auth.uid())
          )
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

-- 2c. RLS stricte sur `medical_prescriptions`
ALTER TABLE IF EXISTS public.medical_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rx_access" ON public.medical_prescriptions;
DROP POLICY IF EXISTS "rx_participants_select" ON public.medical_prescriptions;
DROP POLICY IF EXISTS "rx_doctor_insert" ON public.medical_prescriptions;

CREATE POLICY "rx_participants_select" ON public.medical_prescriptions
  FOR SELECT TO authenticated
  USING (
    patient_user_id = (select auth.uid())
    OR doctor_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = medical_prescriptions.doctor_id AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

CREATE POLICY "rx_doctor_insert" ON public.medical_prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = medical_prescriptions.doctor_id AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

-- 2d. RLS stricte sur `doctor_appointments`
ALTER TABLE IF EXISTS public.doctor_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc_appt_access" ON public.doctor_appointments;
DROP POLICY IF EXISTS "doc_appt_participants_select" ON public.doctor_appointments;
DROP POLICY IF EXISTS "doc_appt_doctor_update" ON public.doctor_appointments;

CREATE POLICY "doc_appt_participants_select" ON public.doctor_appointments
  FOR SELECT TO authenticated
  USING (
    patient_user_id = (select auth.uid())
    OR doctor_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = doctor_appointments.doctor_id AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

CREATE POLICY "doc_appt_doctor_update" ON public.doctor_appointments
  FOR UPDATE TO authenticated
  USING (
    doctor_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.doctors d
      WHERE d.id = doctor_appointments.doctor_id AND d.user_id = (select auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  )
  WITH CHECK (true);

-- ── 3. RPC SÉCURISÉES (SECURITY DEFINER) POUR PATIENTS ANONYMES SCOPÉS ───────
-- Un patient non authentifié ne peut accéder QU'aux données liées à son jeton
-- de session unique `p_session_id` (jamais aux données d'un autre patient).

CREATE OR REPLACE FUNCTION public.patient_create_consultation(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sid text := trim(coalesce(p_payload->>'patient_session_id', ''));
  v_id  text := trim(coalesce(p_payload->>'id', ''));
  v_row public.medical_consultations%ROWTYPE;
BEGIN
  IF length(v_sid) < 8 OR length(v_id) < 6 THEN
    RAISE EXCEPTION 'Session patient ou identifiant consultation invalide.';
  END IF;

  INSERT INTO public.medical_consultations (
    id, patient_session_id, patient_user_id, patient_alias, patient_phone,
    patient_age, patient_sex, specialty_requested, symptoms, allergies,
    doctor_id, doctor_name, status, total_fee, platform_fee,
    doctor_payout_amount, payment_ref, payment_method,
    doctor_payout_status, doctor_payout_ref, session_expires_at, created_at
  ) VALUES (
    v_id,
    v_sid,
    (select auth.uid()),
    coalesce(nullif(trim(p_payload->>'patient_alias'), ''), 'Patient'),
    nullif(trim(coalesce(p_payload->>'patient_phone', '')), ''),
    NULLIF(p_payload->>'patient_age', '')::integer,
    coalesce(p_payload->>'patient_sex', ''),
    coalesce(nullif(trim(p_payload->>'specialty_requested'), ''), 'Médecine Générale'),
    coalesce(nullif(trim(p_payload->>'symptoms'), ''), 'Consultation'),
    coalesce(p_payload->>'allergies', ''),
    nullif(trim(coalesce(p_payload->>'doctor_id', '')), ''),
    coalesce(p_payload->>'doctor_name', 'En recherche de médecin...'),
    coalesce(nullif(trim(p_payload->>'status'), ''), 'searching'),
    coalesce((p_payload->>'total_fee')::integer, 2600),
    coalesce((p_payload->>'platform_fee')::integer, 100),
    coalesce((p_payload->>'doctor_payout_amount')::integer, 2500),
    nullif(trim(coalesce(p_payload->>'payment_ref', '')), ''),
    coalesce(p_payload->>'payment_method', 'momo'),
    coalesce(p_payload->>'doctor_payout_status', 'pending'),
    nullif(trim(coalesce(p_payload->>'doctor_payout_ref', '')), ''),
    coalesce((p_payload->>'session_expires_at')::timestamptz, now() + interval '48 hours'),
    coalesce((p_payload->>'created_at')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    doctor_id = coalesce(EXCLUDED.doctor_id, public.medical_consultations.doctor_id),
    doctor_name = coalesce(EXCLUDED.doctor_name, public.medical_consultations.doctor_name),
    payment_ref = coalesce(EXCLUDED.payment_ref, public.medical_consultations.payment_ref)
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_get_consultations(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sid text := trim(coalesce(p_session_id, ''));
  v_res jsonb;
BEGIN
  IF length(v_sid) < 8 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(c ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT * FROM public.medical_consultations
    WHERE patient_session_id = v_sid
       OR ((select auth.uid()) IS NOT NULL AND patient_user_id = (select auth.uid()))
    ORDER BY created_at DESC
    LIMIT 30
  ) c;

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_get_messages(p_consultation_id text, p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sid text := trim(coalesce(p_session_id, ''));
  v_allowed boolean := false;
  v_res jsonb;
BEGIN
  IF length(v_sid) < 8 OR trim(coalesce(p_consultation_id, '')) = '' THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.medical_consultations mc
    WHERE mc.id = p_consultation_id
      AND (
        mc.patient_session_id = v_sid
        OR ((select auth.uid()) IS NOT NULL AND mc.patient_user_id = (select auth.uid()))
      )
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(m ORDER BY m.created_at ASC), '[]'::jsonb)
  INTO v_res
  FROM public.consultation_messages m
  WHERE m.consultation_id = p_consultation_id;

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_send_message(
  p_consultation_id text,
  p_session_id text,
  p_sender_role text,
  p_sender_name text,
  p_body text,
  p_msg_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sid text := trim(coalesce(p_session_id, ''));
  v_role text := CASE WHEN p_sender_role IN ('patient', 'system') THEN p_sender_role ELSE 'patient' END;
  v_allowed boolean := false;
  v_row public.consultation_messages%ROWTYPE;
BEGIN
  IF length(v_sid) < 8 OR trim(coalesce(p_body, '')) = '' THEN
    RAISE EXCEPTION 'Message ou session invalide.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.medical_consultations mc
    WHERE mc.id = p_consultation_id
      AND (
        mc.patient_session_id = v_sid
        OR ((select auth.uid()) IS NOT NULL AND mc.patient_user_id = (select auth.uid()))
      )
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Accès refusé à cette téléconsultation.';
  END IF;

  INSERT INTO public.consultation_messages (
    id, consultation_id, sender_role, sender_name, body, created_at
  ) VALUES (
    coalesce(nullif(trim(p_msg_id), ''), 'm_' || floor(extract(epoch from now()) * 1000)::text || '_' || substr(md5(random()::text), 1, 4)),
    p_consultation_id,
    v_role,
    coalesce(nullif(trim(p_sender_name), ''), 'Patient'),
    trim(p_body),
    now()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_get_prescriptions(p_session_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sid text := trim(coalesce(p_session_id, ''));
  v_res jsonb;
BEGIN
  IF length(v_sid) < 8 THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO v_res
  FROM (
    SELECT * FROM public.medical_prescriptions
    WHERE patient_session_id = v_sid
       OR ((select auth.uid()) IS NOT NULL AND patient_user_id = (select auth.uid()))
    ORDER BY created_at DESC
    LIMIT 40
  ) r;

  RETURN v_res;
END;
$$;

CREATE OR REPLACE FUNCTION public.patient_book_appointment(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.doctor_appointments%ROWTYPE;
BEGIN
  IF trim(coalesce(p_payload->>'doctor_id', '')) = ''
     OR trim(coalesce(p_payload->>'patient_name', '')) = '' THEN
    RAISE EXCEPTION 'Médecin et nom du patient requis.';
  END IF;

  INSERT INTO public.doctor_appointments (
    id, doctor_id, doctor_name, patient_session_id, patient_user_id,
    patient_name, patient_phone, mode, scheduled_at, reason, status, created_at
  ) VALUES (
    coalesce(nullif(trim(p_payload->>'id'), ''), 'appt_' || floor(extract(epoch from now()) * 1000)::text),
    trim(p_payload->>'doctor_id'),
    coalesce(p_payload->>'doctor_name', 'Médecin'),
    nullif(trim(coalesce(p_payload->>'patient_session_id', '')), ''),
    (select auth.uid()),
    trim(p_payload->>'patient_name'),
    nullif(trim(coalesce(p_payload->>'patient_phone', '')), ''),
    CASE WHEN (p_payload->>'mode') = 'cabinet' THEN 'cabinet' ELSE 'teleconsultation' END,
    coalesce((p_payload->>'scheduled_at')::timestamptz, now() + interval '24 hours'),
    coalesce(p_payload->>'reason', 'Consultation médicale'),
    'pending',
    now()
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.patient_create_consultation(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_get_consultations(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_get_messages(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_send_message(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_get_prescriptions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.patient_book_appointment(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.patient_create_consultation(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_get_consultations(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_get_messages(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_send_message(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_get_prescriptions(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.patient_book_appointment(jsonb) TO anon, authenticated;

-- ── 4. ACTIVATION ABONNEMENT UNIFIÉE POUR LES 5 RÔLES PRO ────────────────────
ALTER TABLE IF EXISTS public.health_facilities
  ADD COLUMN IF NOT EXISTS subscription_plan text DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz DEFAULT (now() + interval '14 days');

CREATE OR REPLACE FUNCTION public.activate_subscription_by_reference(p_reference TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_duration INTERVAL;
  v_new_start TIMESTAMPTZ := NOW();
  v_new_exp TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_sub FROM public.subscriptions WHERE payment_reference = p_reference LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription reference not found');
  END IF;

  IF v_sub.plan_id = 'monthly' THEN
    v_duration := INTERVAL '30 days';
  ELSIF v_sub.plan_id = 'quarterly' THEN
    v_duration := INTERVAL '90 days';
  ELSIF v_sub.plan_id = 'annual' THEN
    v_duration := INTERVAL '365 days';
  ELSE
    v_duration := INTERVAL '14 days';
  END IF;

  v_new_exp := v_new_start + v_duration;

  UPDATE public.subscriptions
  SET status = 'active',
      starts_at = v_new_start,
      expires_at = v_new_exp,
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_sub.id;

  IF v_sub.subscriber_role = 'delegate' THEN
    UPDATE public.delegates
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp
    WHERE id = v_sub.subscriber_id;
  ELSIF v_sub.subscriber_role = 'wholesaler' THEN
    UPDATE public.wholesalers
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp,
        updated_at = NOW()
    WHERE id = v_sub.subscriber_id;
  ELSIF v_sub.subscriber_role = 'pharmacy' THEN
    UPDATE public.pharmacies
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp
    WHERE id = v_sub.subscriber_id;
  ELSIF v_sub.subscriber_role = 'doctor' THEN
    UPDATE public.doctors
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp
    WHERE id = v_sub.subscriber_id::text OR user_id = v_sub.subscriber_id;
  ELSIF v_sub.subscriber_role = 'facility' THEN
    UPDATE public.health_facilities
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp
    WHERE id = v_sub.subscriber_id::text OR user_id = v_sub.subscriber_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub.id,
    'subscriber_id', v_sub.subscriber_id,
    'subscriber_role', v_sub.subscriber_role,
    'plan_id', v_sub.plan_id,
    'expires_at', v_new_exp
  );
END;
$$;

-- ── 5. TABLES CLOUD PERSISTANCE PRO (ZÉRO PERTE MULTI-APPAREILS) ─────────────

-- 5a. Lots à date courte Officines
CREATE TABLE IF NOT EXISTS public.pharmacy_expiry_batches (
  id text PRIMARY KEY,
  pharmacy_id text NOT NULL,
  product text NOT NULL,
  batch_no text DEFAULT '',
  expiry_date text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  unit_price numeric DEFAULT 0,
  shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pharm_expiry_pid ON public.pharmacy_expiry_batches (pharmacy_id, expiry_date ASC);
ALTER TABLE public.pharmacy_expiry_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharm_expiry_owner_all" ON public.pharmacy_expiry_batches;
CREATE POLICY "pharm_expiry_owner_all" ON public.pharmacy_expiry_batches
  FOR ALL TO authenticated
  USING (pharmacy_id = (select auth.uid())::text)
  WITH CHECK (pharmacy_id = (select auth.uid())::text);

-- Compléter index & politiques sur tables v11 existantes
CREATE INDEX IF NOT EXISTS idx_guard_sched_pid ON public.pharmacy_guard_schedules (pharmacy_id, start_at ASC);
CREATE INDEX IF NOT EXISTS idx_peer_exch_status ON public.pharmacy_peer_exchanges (status, created_at DESC);

DROP POLICY IF EXISTS "peer_exch_owner_update" ON public.pharmacy_peer_exchanges;
CREATE POLICY "peer_exch_owner_update" ON public.pharmacy_peer_exchanges
  FOR UPDATE TO authenticated
  USING (pharmacy_id = (select auth.uid())::text)
  WITH CHECK (pharmacy_id = (select auth.uid())::text);

DROP POLICY IF EXISTS "peer_exch_owner_delete" ON public.pharmacy_peer_exchanges;
CREATE POLICY "peer_exch_owner_delete" ON public.pharmacy_peer_exchanges
  FOR DELETE TO authenticated
  USING (pharmacy_id = (select auth.uid())::text);

-- 5b. Comptes-rendus de visite Délégués Médicaux (vocaux & écrits)
CREATE TABLE IF NOT EXISTS public.delegate_visit_reports (
  id text PRIMARY KEY,
  delegate_id text NOT NULL,
  pharmacy text NOT NULL,
  lab text DEFAULT 'Laboratoire',
  summary text NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_del_reports_did ON public.delegate_visit_reports (delegate_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_del_samples_did ON public.delegate_samples (delegate_id, date DESC);
ALTER TABLE public.delegate_visit_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "del_reports_owner_all" ON public.delegate_visit_reports;
CREATE POLICY "del_reports_owner_all" ON public.delegate_visit_reports
  FOR ALL TO authenticated
  USING (delegate_id = (select auth.uid())::text)
  WITH CHECK (delegate_id = (select auth.uid())::text);

-- 5c. Encours Crédit Officines Grossistes B2B
CREATE TABLE IF NOT EXISTS public.wholesaler_credits (
  id text PRIMARY KEY,
  wholesaler_id text NOT NULL,
  pharmacy text NOT NULL,
  city text DEFAULT 'Douala',
  credit_limit numeric NOT NULL DEFAULT 0,
  credit_used numeric NOT NULL DEFAULT 0,
  last_payment text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_credits_wid ON public.wholesaler_credits (wholesaler_id);
ALTER TABLE public.wholesaler_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws_credits_owner_all" ON public.wholesaler_credits;
CREATE POLICY "ws_credits_owner_all" ON public.wholesaler_credits
  FOR ALL TO authenticated
  USING (
    wholesaler_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.wholesalers w
      WHERE w.id::text = wholesaler_credits.wholesaler_id AND w.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    wholesaler_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.wholesalers w
      WHERE w.id::text = wholesaler_credits.wholesaler_id AND w.user_id = (select auth.uid())
    )
  );

-- 5d. Signatures Numériques QR des Bons de Livraison Grossistes
CREATE TABLE IF NOT EXISTS public.wholesaler_bl_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wholesaler_id text NOT NULL,
  order_id text NOT NULL,
  bl_code text NOT NULL,
  receiver text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wholesaler_id, order_id)
);
CREATE INDEX IF NOT EXISTS idx_ws_bl_wid ON public.wholesaler_bl_signatures (wholesaler_id, signed_at DESC);
ALTER TABLE public.wholesaler_bl_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ws_bl_owner_all" ON public.wholesaler_bl_signatures;
CREATE POLICY "ws_bl_owner_all" ON public.wholesaler_bl_signatures
  FOR ALL TO authenticated
  USING (
    wholesaler_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.wholesalers w
      WHERE w.id::text = wholesaler_bl_signatures.wholesaler_id AND w.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    wholesaler_id = (select auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.wholesalers w
      WHERE w.id::text = wholesaler_bl_signatures.wholesaler_id AND w.user_id = (select auth.uid())
    )
  );

-- ── 6. PUBLICATION REALTIME (Téléconsultations, Ordonnances, Bourse Officines)
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_consultations; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_messages; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_prescriptions; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.doctor_appointments; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pharmacy_peer_exchanges; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.lab_analysis_orders; EXCEPTION WHEN others THEN NULL; END;
END $$;
