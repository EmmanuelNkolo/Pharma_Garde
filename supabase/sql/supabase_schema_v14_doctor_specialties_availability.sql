-- ============================================================================
-- Pharma-Garde v14.0 — Multi-Spécialités Médecins, Disponibilités Temporisées
--                      Automatisées & Couverture Nationale 10 Régions Cameroun
-- ----------------------------------------------------------------------------
-- Bonnes pratiques Supabase Postgres :
--   • Migration 100 % idempotente (ADD COLUMN IF NOT EXISTS)
--   • Index GIN sur `specialties` pour recherche multi-spécialités instantanée
--   • Index partiel sur disponibilité active pour routage aléatoire 0ms
-- ============================================================================

ALTER TABLE public.doctors
  ADD COLUMN IF NOT EXISTS specialties text[] NOT NULL DEFAULT ARRAY['Médecine Générale']::text[],
  ADD COLUMN IF NOT EXISTS region text DEFAULT 'Littoral',
  ADD COLUMN IF NOT EXISTS is_regional_capital boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS availability_until timestamptz,
  ADD COLUMN IF NOT EXISTS availability_note text DEFAULT '',
  ADD COLUMN IF NOT EXISTS auto_schedule_enabled boolean NOT NULL DEFAULT true;

-- Rétro-remplissage des spécialités multiples depuis la spécialité principale existante
UPDATE public.doctors
SET specialties = ARRAY[coalesce(nullif(trim(specialty), ''), 'Médecine Générale')]
WHERE specialties IS NULL OR array_length(specialties, 1) IS NULL;

-- Index GIN haute performance pour filtrer par n'importe quelle spécialité en < 1ms
CREATE INDEX IF NOT EXISTS idx_doctors_specialties_gin
  ON public.doctors USING gin (specialties);

-- Index composite pour le routage instantané (Aléatoire Rapide / Spécialité / Région)
CREATE INDEX IF NOT EXISTS idx_doctors_avail_region
  ON public.doctors (availability_status, region, is_regional_capital)
  WHERE verification_status = 'verified';

-- Fonction utilitaire d'expiration automatique des statuts temporisés (optionnelle pg_cron)
CREATE OR REPLACE FUNCTION public.refresh_expired_doctor_availability()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.doctors
  SET availability_status = CASE WHEN auto_schedule_enabled THEN 'available' ELSE 'offline' END,
      availability_until = NULL,
      availability_note = ''
  WHERE availability_until IS NOT NULL
    AND availability_until <= now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

