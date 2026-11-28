-- ============================================================================
-- Pharma-Garde v17.0 — Planification SQL Native (Optionnelle) via pg_cron + pg_net
-- ────────────────────────────────────────────────────────────────────────────
-- Note : Un cron automatique gratuit tourne déjà chaque matin à 08h00 (Douala)
-- via GitHub Actions (.github/workflows/daily-reminders.yml) et peut aussi être
-- exécuté en 1 clic depuis la Console Super-Admin (onglet Revenus & KPIs).
--
-- Ce script SQL est fourni en option si vous souhaitez également activer
-- l'exécution native dans PostgreSQL Supabase (pg_cron).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Supprimer un éventuel ancien job du même nom pour garantir l'idempotence
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'pharma_garde_daily_subscription_reminders'
  LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

-- Planifier chaque jour à 07:00 UTC (08:00 Africa/Douala)
SELECT cron.schedule(
  'pharma_garde_daily_subscription_reminders',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://kcbcvdinuhckrpotngbw.supabase.co/functions/v1/subscription-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_kqCs9fGvxPvxOUfolarnPA_5N_d846O'
    ),
    body := jsonb_build_object('trigger', 'pg_cron_daily')
  );
  $$
);
