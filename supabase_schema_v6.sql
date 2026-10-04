-- ================================================================
-- Pharma-Garde v6.0 — Migration "Professionnelle"
-- A exécuter dans Supabase > SQL Editor APRES v1..v5.
-- Script IDEMPOTENT : peut être relancé sans danger.
-- ================================================================

-- ═══════════════════════════════════════
-- 0. Utilitaire : génération de codes lisibles (sans 0/O/1/I)
-- ═══════════════════════════════════════
CREATE OR REPLACE FUNCTION pg_readable_code(prefix TEXT, len INT DEFAULT 6)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := '';
  i INT;
BEGIN
  FOR i IN 1..len LOOP
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  END LOOP;
  RETURN prefix || result;
END $$;

-- ═══════════════════════════════════════
-- 1. IDENTIFIANTS UNIQUES (Délégués / Pharmacies)
-- ═══════════════════════════════════════
ALTER TABLE delegates  ADD COLUMN IF NOT EXISTS delegate_code TEXT;
ALTER TABLE delegates  ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE delegates  ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE delegates  ADD COLUMN IF NOT EXISTS last_lat DOUBLE PRECISION;
ALTER TABLE delegates  ADD COLUMN IF NOT EXISTS last_lng DOUBLE PRECISION;
UPDATE delegates SET delegate_code = pg_readable_code('DM-') WHERE delegate_code IS NULL;
ALTER TABLE delegates ALTER COLUMN delegate_code SET DEFAULT pg_readable_code('DM-');
CREATE UNIQUE INDEX IF NOT EXISTS uq_delegates_code ON delegates(delegate_code);

ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS pharmacy_code TEXT;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS gps_accuracy DOUBLE PRECISION;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS visit_slots TEXT;              -- ex: "Mar & Jeu 14h-16h"
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS auto_accept_visits BOOLEAN DEFAULT false;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS auto_reply_requests BOOLEAN DEFAULT false;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS response_mode TEXT DEFAULT 'manual';
UPDATE pharmacies SET pharmacy_code = pg_readable_code('PH-') WHERE pharmacy_code IS NULL;
ALTER TABLE pharmacies ALTER COLUMN pharmacy_code SET DEFAULT pg_readable_code('PH-');
CREATE UNIQUE INDEX IF NOT EXISTS uq_pharmacies_code ON pharmacies(pharmacy_code);

-- Les labos d'un délégué (table v4) — on s'assure qu'elle existe
CREATE TABLE IF NOT EXISTS delegate_labs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  lab_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(delegate_id, lab_name)
);

-- ═══════════════════════════════════════
-- 2. SESSIONS CLIENT (24h) — identifiant visible par pharmacie & client
-- ═══════════════════════════════════════
ALTER TABLE requests ALTER COLUMN session_id TYPE VARCHAR(20);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS session_id VARCHAR(20);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS reservation_code VARCHAR(10);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_requests_session ON requests(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_session ON reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_code ON reservations(reservation_code);
ALTER TABLE responses ALTER COLUMN reservation_code TYPE VARCHAR(10);

-- Vie privée : le numéro du patient n'est plus transmis aux pharmacies.
-- (Les anciennes lignes sont anonymisées.)
UPDATE requests SET user_phone = NULL WHERE user_phone IS NOT NULL;

-- ═══════════════════════════════════════
-- 3. PROMOTIONS : cycle de vie complet
-- ═══════════════════════════════════════
ALTER TABLE delegate_promotions ADD COLUMN IF NOT EXISTS offer TEXT;           -- ex: "10+2 gratuits"
ALTER TABLE delegate_promotions ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE delegate_promotions ADD COLUMN IF NOT EXISTS radius_km INTEGER;
ALTER TABLE delegate_promotions ADD COLUMN IF NOT EXISTS target_mode TEXT DEFAULT 'radius';

ALTER TABLE promotion_targets DROP CONSTRAINT IF EXISTS promotion_targets_status_check;
ALTER TABLE promotion_targets ADD CONSTRAINT promotion_targets_status_check
  CHECK (status IN ('sent','read','interested','not_interested','already_stocked','ordered','ignored'));
ALTER TABLE promotion_targets ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE promotion_targets ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE promotion_targets ADD COLUMN IF NOT EXISTS quantity INTEGER;

-- ═══════════════════════════════════════
-- 4. VISITES : sollicitations dans les deux sens
-- ═══════════════════════════════════════
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS initiated_by TEXT DEFAULT 'delegate';
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS object_type TEXT DEFAULT 'promotion';
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS product_name TEXT;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS lab_name TEXT;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS counter_date TIMESTAMPTZ;
ALTER TABLE visit_requests ADD COLUMN IF NOT EXISTS stock_alert_id UUID;
ALTER TABLE visit_requests ALTER COLUMN proposed_date DROP NOT NULL;

ALTER TABLE visit_requests DROP CONSTRAINT IF EXISTS visit_requests_status_check;
ALTER TABLE visit_requests ADD CONSTRAINT visit_requests_status_check
  CHECK (status IN ('requested','pending','confirmed','rescheduled','cancelled','completed'));

-- Une pharmacie peut solliciter une visite (initiated_by = 'pharmacy')
DROP POLICY IF EXISTS "visit_insert" ON visit_requests;
CREATE POLICY "visit_insert" ON visit_requests FOR INSERT WITH CHECK (
  auth.uid() = delegate_id OR auth.uid() = pharmacy_id
);

-- ═══════════════════════════════════════
-- 5. ALERTES STOCK : produit / labo + réponses délégués
-- ═══════════════════════════════════════
ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS lab_name TEXT;
ALTER TABLE stock_alerts ADD COLUMN IF NOT EXISTS responses_count INTEGER DEFAULT 0;

-- ═══════════════════════════════════════
-- 6. STOCK RAPIDE PHARMACIE (réponses automatiques aux patients)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS pharmacy_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_key TEXT NOT NULL,              -- nom normalisé (minuscules, sans accents)
  in_stock BOOLEAN DEFAULT true,
  insured BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pharmacy_id, product_key)
);
ALTER TABLE pharmacy_stock ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_owner_all" ON pharmacy_stock;
CREATE POLICY "stock_owner_all" ON pharmacy_stock FOR ALL
  USING (auth.uid() = pharmacy_id) WITH CHECK (auth.uid() = pharmacy_id);

-- ═══════════════════════════════════════
-- 7. TABLEAU NATIONAL DES GARDES
--    Alimenté chaque semaine à partir de la liste officielle publiée
--    (Ordre National des Pharmaciens du Cameroun / Délégations régionales).
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS guard_schedule (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_name TEXT NOT NULL,
  city TEXT NOT NULL,
  quarter TEXT,
  phone TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guard_dates ON guard_schedule(start_date, end_date);
ALTER TABLE guard_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "guard_public_read" ON guard_schedule;
CREATE POLICY "guard_public_read" ON guard_schedule FOR SELECT USING (true);
-- L'écriture se fait uniquement via le service_role (tableau de bord Supabase / import CSV).

-- ═══════════════════════════════════════
-- 8. SÉCURITÉ / RLS
-- ═══════════════════════════════════════
-- Les pharmacies authentifiées voient l'identité professionnelle des délégués.
DROP POLICY IF EXISTS "delegate_read_own" ON delegates;
DROP POLICY IF EXISTS "delegates_read_authenticated" ON delegates;
CREATE POLICY "delegates_read_authenticated" ON delegates FOR SELECT
  USING (auth.role() = 'authenticated');

-- Les clés API des pharmacies ne doivent jamais être lisibles publiquement :
-- on les déplace dans une table privée.
CREATE TABLE IF NOT EXISTS pharmacy_private (
  pharmacy_id UUID PRIMARY KEY REFERENCES pharmacies(id) ON DELETE CASCADE,
  api_endpoint TEXT,
  api_key TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE pharmacy_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "private_owner_all" ON pharmacy_private;
CREATE POLICY "private_owner_all" ON pharmacy_private FOR ALL
  USING (auth.uid() = pharmacy_id) WITH CHECK (auth.uid() = pharmacy_id);
INSERT INTO pharmacy_private (pharmacy_id, api_endpoint, api_key)
  SELECT id, api_endpoint, api_key FROM pharmacies
  WHERE api_endpoint IS NOT NULL OR api_key IS NOT NULL
  ON CONFLICT (pharmacy_id) DO NOTHING;
UPDATE pharmacies SET api_key = NULL WHERE api_key IS NOT NULL;

-- Labos : lisibles par tout utilisateur authentifié (rapports, filtres)
DROP POLICY IF EXISTS "labs_read_own" ON delegate_labs;
DROP POLICY IF EXISTS "labs_read_auth" ON delegate_labs;
CREATE POLICY "labs_read_auth" ON delegate_labs FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "labs_insert_own" ON delegate_labs;
CREATE POLICY "labs_insert_own" ON delegate_labs FOR INSERT WITH CHECK (auth.uid() = delegate_id);
DROP POLICY IF EXISTS "labs_delete_own" ON delegate_labs;
CREATE POLICY "labs_delete_own" ON delegate_labs FOR DELETE USING (auth.uid() = delegate_id);

-- Réservations : seule la pharmacie concernée peut les mettre à jour
DROP POLICY IF EXISTS "Public can update reservations" ON reservations;
DROP POLICY IF EXISTS "reservations_update_pharmacy" ON reservations;
CREATE POLICY "reservations_update_pharmacy" ON reservations FOR UPDATE
  USING (auth.uid() = pharmacy_id);

-- Réponses : insertion uniquement par la pharmacie authentifiée elle-même
DROP POLICY IF EXISTS "Public can insert responses" ON responses;
DROP POLICY IF EXISTS "responses_insert_pharmacy" ON responses;
CREATE POLICY "responses_insert_pharmacy" ON responses FOR INSERT
  WITH CHECK (auth.uid() = pharmacy_id);

-- ═══════════════════════════════════════
-- 9. REALTIME (ignorer l'erreur "already member" si elle apparaît)
-- ═══════════════════════════════════════
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stock_alerts; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE reservations; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE visit_requests; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE promotion_targets; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- ═══════════════════════════════════════
-- 10. INDEX DE PERFORMANCE
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_visit_status ON visit_requests(status);
CREATE INDEX IF NOT EXISTS idx_visit_created ON visit_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_targets_status ON promotion_targets(status);
CREATE INDEX IF NOT EXISTS idx_promos_created ON delegate_promotions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacies_latlng ON pharmacies(lat, lng);
