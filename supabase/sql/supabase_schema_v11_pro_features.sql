-- ============================================================================
-- Pharma-Garde v11.0 — Fonctionnalités Pro, Certification ONCP/DPML & Multi-Admins
-- Script 100 % idempotent à exécuter dans Supabase SQL Editor
-- ============================================================================

-- 1. Colonnes de workflow de certification ONCP / DPML sur les 3 tables acteurs
ALTER TABLE IF EXISTS public.pharmacies
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text;

ALTER TABLE IF EXISTS public.delegates
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text;

ALTER TABLE IF EXISTS public.wholesalers
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by text;

-- 2. Gestion multi-Super-Administrateurs sur `platform_admins`
ALTER TABLE IF EXISTS public.platform_admins
  ADD COLUMN IF NOT EXISTS access_code_hash text,
  ADD COLUMN IF NOT EXISTS added_by text;

DROP POLICY IF EXISTS "platform_admins_super_manage" ON public.platform_admins;
CREATE POLICY "platform_admins_super_manage" ON public.platform_admins
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.role = 'super_admin' AND pa.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.role = 'super_admin' AND pa.is_active = true
    )
  );

-- 3. Planning automatisé des tours de garde officines
CREATE TABLE IF NOT EXISTS public.pharmacy_guard_schedules (
  id text PRIMARY KEY,
  pharmacy_id text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  note text,
  auto_switch boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pharmacy_guard_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guard_sched_rw" ON public.pharmacy_guard_schedules;
CREATE POLICY "guard_sched_rw" ON public.pharmacy_guard_schedules
  FOR ALL TO authenticated
  USING (pharmacy_id = (select auth.uid())::text)
  WITH CHECK (pharmacy_id = (select auth.uid())::text);

-- 4. Bourse d'échanges inter-officines (Dépannage confraternel & lots date courte)
CREATE TABLE IF NOT EXISTS public.pharmacy_peer_exchanges (
  id text PRIMARY KEY,
  pharmacy_id text,
  pharmacy_name text NOT NULL,
  phone text,
  city text,
  type text NOT NULL CHECK (type IN ('offer_short_expiry', 'urgent_need')),
  product text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  expiry_date text,
  unit_price numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pharmacy_peer_exchanges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "peer_exch_read" ON public.pharmacy_peer_exchanges;
CREATE POLICY "peer_exch_read" ON public.pharmacy_peer_exchanges
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "peer_exch_insert" ON public.pharmacy_peer_exchanges;
CREATE POLICY "peer_exch_insert" ON public.pharmacy_peer_exchanges
  FOR INSERT TO authenticated WITH CHECK (true);

-- 5. Traçabilité des échantillons médicaux Délégués
CREATE TABLE IF NOT EXISTS public.delegate_samples (
  id text PRIMARY KEY,
  delegate_id text,
  lab text,
  product text NOT NULL,
  batch_no text,
  recipient_type text NOT NULL,
  recipient_name text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  receipt_code text NOT NULL,
  date timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.delegate_samples ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "del_samples_rw" ON public.delegate_samples;
CREATE POLICY "del_samples_rw" ON public.delegate_samples
  FOR ALL TO authenticated
  USING (delegate_id IS NULL OR delegate_id = (select auth.uid())::text)
  WITH CHECK (delegate_id IS NULL OR delegate_id = (select auth.uid())::text);
