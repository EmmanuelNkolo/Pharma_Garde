-- ================================================================
-- Pharma-Garde v5.0 — Schema Migration
-- Run this SQL in Supabase Dashboard > SQL Editor
-- AFTER having run supabase_schema_v4.sql
-- ================================================================

-- ═══════════════════════════════════════
--  1. RESERVATION CODES on responses
-- ═══════════════════════════════════════
ALTER TABLE responses ADD COLUMN IF NOT EXISTS reservation_code VARCHAR(8);
ALTER TABLE responses ADD COLUMN IF NOT EXISTS is_reserved BOOLEAN DEFAULT false;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;
ALTER TABLE responses ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- ═══════════════════════════════════════
--  2. STOCK ALERTS (pharmacy → delegates)
-- ═══════════════════════════════════════
CREATE TABLE IF NOT EXISTS stock_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'critical')),
  message TEXT,
  radius INTEGER DEFAULT 5,
  pharmacy_lat DOUBLE PRECISION,
  pharmacy_lng DOUBLE PRECISION,
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
--  3. INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_stock_alerts_pharmacy ON stock_alerts(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_created ON stock_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_code ON responses(reservation_code);

-- ═══════════════════════════════════════
--  4. REALTIME
-- ═══════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE stock_alerts;

-- ═══════════════════════════════════════
--  5. ROW LEVEL SECURITY
-- ═══════════════════════════════════════
ALTER TABLE stock_alerts ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read stock alerts (delegates need to see them)
CREATE POLICY "Anyone can read stock alerts" ON stock_alerts FOR SELECT USING (true);
-- Only the pharmacy owner can create alerts
CREATE POLICY "Pharmacy can insert stock alerts" ON stock_alerts FOR INSERT WITH CHECK (auth.uid() = pharmacy_id);
-- Pharmacy owner can update their own alerts
CREATE POLICY "Pharmacy can update own alerts" ON stock_alerts FOR UPDATE USING (auth.uid() = pharmacy_id);

-- Allow updating responses (for reservation codes)
DROP POLICY IF EXISTS "Public can update responses" ON responses;
CREATE POLICY "Public can update responses" ON responses FOR UPDATE USING (true);
