-- ============================================================================
-- Pharma-Garde v10.0 — Accès Super-Administrateur Plateforme & Audit Sécurité
-- À exécuter dans Supabase SQL Editor (idempotent)
-- ============================================================================

-- 1. Table des Administrateurs de la plateforme
CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  full_name text NOT NULL DEFAULT 'Administrateur Pharma-Garde',
  role text NOT NULL DEFAULT 'super_admin' CHECK (role IN ('super_admin', 'moderator')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admins_self_read" ON public.platform_admins;
CREATE POLICY "platform_admins_self_read" ON public.platform_admins
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- 2. Journal d'audit des actions administrateurs
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email text NOT NULL,
  space text NOT NULL,
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at
  ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_audit_select" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_select" ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

DROP POLICY IF EXISTS "admin_audit_insert" ON public.admin_audit_logs;
CREATE POLICY "admin_audit_insert" ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (select auth.uid()) AND pa.is_active = true
    )
  );

-- 3. Pour nommer votre compte Supabase comme Super-Administrateur :
-- INSERT INTO public.platform_admins (user_id, email, full_name, role)
-- SELECT id, email, 'Administrateur Principal', 'super_admin'
-- FROM auth.users WHERE email = 'VOTRE_EMAIL_ADMIN@exemple.com'
-- ON CONFLICT (email) DO UPDATE SET is_active = true, role = 'super_admin';

