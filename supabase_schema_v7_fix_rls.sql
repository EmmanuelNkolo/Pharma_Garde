-- ================================================================
-- Pharma-Garde v7.0 — Correctif RLS & Communication Temps Réel
-- Résout l'erreur : "new row violates row-level security policy for table stock_alerts"
-- Permet la communication bidirectionnelle Client <-> Pharmacie <-> Délégué
-- Script IDEMPOTENT (peut être relancé en toute sécurité)
-- ================================================================

-- 1. Table stock_alerts (Alertes ruptures envoyées aux délégués)
CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID,
  product_name TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal',
  radius INTEGER DEFAULT 5,
  message TEXT,
  pharmacy_lat DOUBLE PRECISION,
  pharmacy_lng DOUBLE PRECISION,
  is_resolved BOOLEAN DEFAULT false,
  lab_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read stock alerts" ON stock_alerts;
DROP POLICY IF EXISTS "Pharmacy can insert stock alerts" ON stock_alerts;
DROP POLICY IF EXISTS "Pharmacy can update own alerts" ON stock_alerts;
DROP POLICY IF EXISTS "Allow public insert stock_alerts" ON stock_alerts;
DROP POLICY IF EXISTS "Allow public read stock_alerts" ON stock_alerts;
DROP POLICY IF EXISTS "Allow public update stock_alerts" ON stock_alerts;

CREATE POLICY "Allow public read stock_alerts" ON stock_alerts FOR SELECT USING (true);
CREATE POLICY "Allow public insert stock_alerts" ON stock_alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update stock_alerts" ON stock_alerts FOR UPDATE USING (true);

-- 2. Table reservations (Réservations patient 60 min médicament par médicament)
CREATE TABLE IF NOT EXISTS reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID,
  pharmacy_id UUID,
  session_id VARCHAR(20),
  reservation_code VARCHAR(10),
  medicines_status JSONB,
  status TEXT DEFAULT 'active',
  expires_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_read_all" ON reservations;
DROP POLICY IF EXISTS "reservations_insert_all" ON reservations;
DROP POLICY IF EXISTS "reservations_update_all" ON reservations;

CREATE POLICY "reservations_read_all" ON reservations FOR SELECT USING (true);
CREATE POLICY "reservations_insert_all" ON reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "reservations_update_all" ON reservations FOR UPDATE USING (true);

-- 3. Table pharmacy_stock (Gestion de stock officine & alertes ruptures)
CREATE TABLE IF NOT EXISTS pharmacy_stock (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID,
  product_name TEXT NOT NULL,
  product_key TEXT NOT NULL,
  in_stock BOOLEAN DEFAULT true,
  insured BOOLEAN DEFAULT true,
  category TEXT,
  price NUMERIC,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pharmacy_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pharmacy_stock_read" ON pharmacy_stock;
DROP POLICY IF EXISTS "pharmacy_stock_insert" ON pharmacy_stock;
DROP POLICY IF EXISTS "pharmacy_stock_update" ON pharmacy_stock;

CREATE POLICY "pharmacy_stock_read" ON pharmacy_stock FOR SELECT USING (true);
CREATE POLICY "pharmacy_stock_insert" ON pharmacy_stock FOR INSERT WITH CHECK (true);
CREATE POLICY "pharmacy_stock_update" ON pharmacy_stock FOR UPDATE USING (true);

-- 4. Publication Realtime pour synchronisation immédiate
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE stock_alerts; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE reservations; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE pharmacy_stock; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE responses; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE requests; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE visit_requests; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE promotion_targets; EXCEPTION WHEN others THEN NULL; END;
END $$;
