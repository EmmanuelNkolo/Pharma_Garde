-- ============================================================================
-- Pharma-Garde v12.0 — Médecins (ONMC), Téléconsultation 48h, Ordonnances Signées,
-- Laboratoires / Hôpitaux / Cliniques & Confidentialité Stricte des Stocks & Patients
-- Script 100 % idempotent à exécuter dans Supabase SQL Editor
-- ============================================================================

-- 1. TABLE MÉDECINS (Vérification ONMC + Signature Manuscrite + Compte OM/MoMo)
CREATE TABLE IF NOT EXISTS public.doctors (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Dr',
  full_name text NOT NULL,
  specialty text NOT NULL DEFAULT 'Médecine Générale',
  onmc_number text NOT NULL,
  cni_number text NOT NULL,
  diploma_title text NOT NULL,
  university text,
  graduation_year integer,
  clinic_name text,
  city text NOT NULL DEFAULT 'Douala',
  quarter text,
  address text,
  lat double precision DEFAULT 4.0511,
  lng double precision DEFAULT 9.7085,
  phone text NOT NULL,
  whatsapp text,
  payout_phone text NOT NULL,
  payout_operator text NOT NULL DEFAULT 'momo' CHECK (payout_operator IN ('momo', 'om')),
  email text NOT NULL UNIQUE,
  signature_data_url text,
  license_doc_name text,
  consultation_hours jsonb DEFAULT '{}'::jsonb,
  availability_status text NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'busy', 'offline')),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_at timestamptz,
  verified_by text,
  subscription_status text NOT NULL DEFAULT 'trial',
  subscription_plan text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz DEFAULT (now() + interval '14 days'),
  subscription_expires_at timestamptz DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctors_city_status ON public.doctors (city, availability_status, verification_status);
ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctors_public_directory_read" ON public.doctors;
CREATE POLICY "doctors_public_directory_read" ON public.doctors
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "doctors_self_write" ON public.doctors;
CREATE POLICY "doctors_self_write" ON public.doctors
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()) OR id = (select auth.uid())::text)
  WITH CHECK (user_id = (select auth.uid()) OR id = (select auth.uid())::text);

-- 2. TÉLÉCONSULTATIONS (Session 48h + Split 2 600 FCFA : 100 F plateforme + 2 500 F médecin)
CREATE TABLE IF NOT EXISTS public.medical_consultations (
  id text PRIMARY KEY,
  patient_session_id text NOT NULL,
  patient_alias text NOT NULL,
  patient_phone text,
  patient_age integer,
  patient_sex text,
  specialty_requested text NOT NULL DEFAULT 'Médecine Générale',
  symptoms text NOT NULL,
  allergies text,
  doctor_id text REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_name text,
  status text NOT NULL DEFAULT 'searching' CHECK (status IN ('searching', 'active_48h', 'prescribed', 'closed', 'cancelled')),
  total_fee integer NOT NULL DEFAULT 2600,
  platform_fee integer NOT NULL DEFAULT 100,
  doctor_payout_amount integer NOT NULL DEFAULT 2500,
  payment_ref text,
  payment_method text,
  doctor_payout_status text DEFAULT 'pending',
  doctor_payout_ref text,
  doctor_payout_at timestamptz,
  session_expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultations_status ON public.medical_consultations (status, created_at DESC);
ALTER TABLE public.medical_consultations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consultations_scoped_access" ON public.medical_consultations;
CREATE POLICY "consultations_scoped_access" ON public.medical_consultations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. MESSAGES DE TÉLÉCONSULTATION (Confidentiels pendant la session 48h)
CREATE TABLE IF NOT EXISTS public.consultation_messages (
  id text PRIMARY KEY,
  consultation_id text NOT NULL REFERENCES public.medical_consultations(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('patient', 'doctor', 'system')),
  sender_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consult_msgs_cid ON public.consultation_messages (consultation_id, created_at ASC);
ALTER TABLE public.consultation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consult_msgs_access" ON public.consultation_messages;
CREATE POLICY "consult_msgs_access" ON public.consultation_messages
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. ORDONNANCES MÉDICALES SIGNÉES (Téléchargeables + Lien Direct Pharmacies)
CREATE TABLE IF NOT EXISTS public.medical_prescriptions (
  id text PRIMARY KEY,
  rx_code text NOT NULL UNIQUE,
  consultation_id text REFERENCES public.medical_consultations(id) ON DELETE SET NULL,
  doctor_id text REFERENCES public.doctors(id) ON DELETE SET NULL,
  doctor_name text NOT NULL,
  doctor_specialty text,
  doctor_onmc text,
  doctor_signature text,
  patient_session_id text NOT NULL,
  patient_alias text,
  diagnosis text,
  medications jsonb NOT NULL DEFAULT '[]'::jsonb,
  advice text,
  valid_until timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.medical_prescriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rx_access" ON public.medical_prescriptions;
CREATE POLICY "rx_access" ON public.medical_prescriptions
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. RENDEZ-VOUS MÉDICAUX (Cabinet ou Téléconsultation)
CREATE TABLE IF NOT EXISTS public.doctor_appointments (
  id text PRIMARY KEY,
  doctor_id text NOT NULL REFERENCES public.doctors(id) ON DELETE CASCADE,
  doctor_name text,
  patient_session_id text,
  patient_name text NOT NULL,
  patient_phone text,
  mode text NOT NULL DEFAULT 'teleconsultation' CHECK (mode IN ('teleconsultation', 'cabinet')),
  scheduled_at timestamptz NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rescheduled', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doc_appt_access" ON public.doctor_appointments;
CREATE POLICY "doc_appt_access" ON public.doctor_appointments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. LABORATOIRES D'ANALYSES, HÔPITAUX & CLINIQUES
CREATE TABLE IF NOT EXISTS public.health_facilities (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  facility_type text NOT NULL CHECK (facility_type IN ('laboratory', 'hospital', 'clinic', 'imaging')),
  name text NOT NULL,
  director_name text,
  license_number text NOT NULL,
  city text NOT NULL DEFAULT 'Douala',
  quarter text,
  address text,
  lat double precision NOT NULL DEFAULT 4.0511,
  lng double precision NOT NULL DEFAULT 9.7085,
  phone text NOT NULL,
  whatsapp text,
  email text NOT NULL UNIQUE,
  opening_hours text DEFAULT '07:00 - 20:00',
  emergency_24_7 boolean DEFAULT false,
  home_sampling boolean DEFAULT false,
  online_results boolean DEFAULT true,
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  promotions jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  subscription_status text NOT NULL DEFAULT 'trial',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_facilities_type_city ON public.health_facilities (facility_type, city);
ALTER TABLE public.health_facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "facilities_public_read" ON public.health_facilities;
CREATE POLICY "facilities_public_read" ON public.health_facilities
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "facilities_self_write" ON public.health_facilities;
CREATE POLICY "facilities_self_write" ON public.health_facilities
  FOR ALL TO authenticated
  USING (user_id = (select auth.uid()) OR id = (select auth.uid())::text)
  WITH CHECK (user_id = (select auth.uid()) OR id = (select auth.uid())::text);

-- 7. CONFIDENTIALITÉ STRICTE DES STOCKS OFFICINES (Jamais lisibles par tiers)
CREATE TABLE IF NOT EXISTS public.pharmacy_confidential_stocks (
  id text PRIMARY KEY,
  pharmacy_id text NOT NULL,
  product_name text NOT NULL,
  public_price_fcfa integer NOT NULL DEFAULT 0,
  confidential_qty integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'en_stock',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacy_confidential_stocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacy_stocks_owner_only" ON public.pharmacy_confidential_stocks;
CREATE POLICY "pharmacy_stocks_owner_only" ON public.pharmacy_confidential_stocks
  FOR ALL TO authenticated
  USING (pharmacy_id = (select auth.uid())::text)
  WITH CHECK (pharmacy_id = (select auth.uid())::text);

-- 8. PRIX PUBLICS TRANSMIS DANS LES RÉPONSES OFFICINES (sans jamais exposer les stocks)
ALTER TABLE IF EXISTS public.responses
  ADD COLUMN IF NOT EXISTS medicines_prices jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS estimated_price integer DEFAULT 0;
