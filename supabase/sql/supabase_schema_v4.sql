-- ================================================================
-- Pharma-Garde v4.0 — Database Schema Migration
-- Run this SQL in Supabase Dashboard > SQL Editor
-- AFTER having run supabase_schema.sql (v1)
-- ================================================================

-- ═══════════════════════════════════════
--  1. REQUESTS: add session_id if missing
-- ═══════════════════════════════════════
ALTER TABLE requests ADD COLUMN IF NOT EXISTS session_id VARCHAR(9);

-- ═══════════════════════════════════════
--  2. DELEGATES TABLE
-- ═══════════════════════════════════════
DROP TABLE IF EXISTS promotion_targets CASCADE;
DROP TABLE IF EXISTS visit_requests CASCADE;
DROP TABLE IF EXISTS delegate_promotions CASCADE;
DROP TABLE IF EXISTS delegate_labs CASCADE;
DROP TABLE IF EXISTS delegate_interactions CASCADE;
DROP TABLE IF EXISTS delegates CASCADE;

CREATE TABLE delegates (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  pro_card_number TEXT NOT NULL,
  cni_number TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
--  3. DELEGATE LABS (N:N relationship)
-- ═══════════════════════════════════════
CREATE TABLE delegate_labs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  lab_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(delegate_id, lab_name)
);

-- ═══════════════════════════════════════
--  4. DELEGATE PROMOTIONS
-- ═══════════════════════════════════════
CREATE TABLE delegate_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  lab_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_type TEXT CHECK (product_type IN ('medicament', 'complement', 'materiel', 'cosmetique')),
  description TEXT,
  document_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
--  5. PROMOTION TARGETS (one row per pharmacy targeted)
-- ═══════════════════════════════════════
CREATE TABLE promotion_targets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  promotion_id UUID NOT NULL REFERENCES delegate_promotions(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'interested', 'already_stocked', 'ignored')),
  pharmacy_notes TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  UNIQUE(promotion_id, pharmacy_id)
);

-- ═══════════════════════════════════════
--  6. VISIT REQUESTS
-- ═══════════════════════════════════════
CREATE TABLE visit_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  proposed_date TIMESTAMPTZ NOT NULL,
  purpose TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rescheduled', 'cancelled', 'completed')),
  pharmacy_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════
--  7. PHARMACY AUTOMATION COLUMNS
-- ═══════════════════════════════════════
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS response_mode TEXT DEFAULT 'manual';
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS api_endpoint TEXT;
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS api_key TEXT;

-- ═══════════════════════════════════════
--  8. INDEXES
-- ═══════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_delegate_labs_delegate ON delegate_labs(delegate_id);
CREATE INDEX IF NOT EXISTS idx_delegate_promotions_delegate ON delegate_promotions(delegate_id);
CREATE INDEX IF NOT EXISTS idx_promotion_targets_promotion ON promotion_targets(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_targets_pharmacy ON promotion_targets(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_delegate ON visit_requests(delegate_id);
CREATE INDEX IF NOT EXISTS idx_visit_requests_pharmacy ON visit_requests(pharmacy_id);

-- ═══════════════════════════════════════
--  9. REALTIME
-- ═══════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE delegates;
ALTER PUBLICATION supabase_realtime ADD TABLE delegate_promotions;
ALTER PUBLICATION supabase_realtime ADD TABLE promotion_targets;
ALTER PUBLICATION supabase_realtime ADD TABLE visit_requests;

-- ═══════════════════════════════════════
-- 10. ROW LEVEL SECURITY
-- ═══════════════════════════════════════
ALTER TABLE delegates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegate_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegate_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_requests ENABLE ROW LEVEL SECURITY;

-- Delegates: own profile only
CREATE POLICY "delegate_read_own" ON delegates FOR SELECT USING (auth.uid() = id);
CREATE POLICY "delegate_insert_own" ON delegates FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "delegate_update_own" ON delegates FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "delegate_delete_own" ON delegates FOR DELETE USING (auth.uid() = id);

-- Delegate Labs: own labs only
CREATE POLICY "labs_read_own" ON delegate_labs FOR SELECT USING (auth.uid() = delegate_id);
CREATE POLICY "labs_insert_own" ON delegate_labs FOR INSERT WITH CHECK (auth.uid() = delegate_id);
CREATE POLICY "labs_delete_own" ON delegate_labs FOR DELETE USING (auth.uid() = delegate_id);

-- Promotions: owner can CRUD, pharmacies can read if targeted
CREATE POLICY "promo_read" ON delegate_promotions FOR SELECT USING (
  auth.uid() = delegate_id
  OR EXISTS (
    SELECT 1 FROM promotion_targets
    WHERE promotion_targets.promotion_id = delegate_promotions.id
    AND promotion_targets.pharmacy_id = auth.uid()
  )
);
CREATE POLICY "promo_insert" ON delegate_promotions FOR INSERT WITH CHECK (auth.uid() = delegate_id);
CREATE POLICY "promo_update" ON delegate_promotions FOR UPDATE USING (auth.uid() = delegate_id);
CREATE POLICY "promo_delete" ON delegate_promotions FOR DELETE USING (auth.uid() = delegate_id);

-- Promotion Targets: delegate owner or targeted pharmacy
CREATE POLICY "target_read" ON promotion_targets FOR SELECT USING (
  pharmacy_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM delegate_promotions
    WHERE delegate_promotions.id = promotion_targets.promotion_id
    AND delegate_promotions.delegate_id = auth.uid()
  )
);
CREATE POLICY "target_insert" ON promotion_targets FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM delegate_promotions
    WHERE delegate_promotions.id = promotion_targets.promotion_id
    AND delegate_promotions.delegate_id = auth.uid()
  )
);
CREATE POLICY "target_update" ON promotion_targets FOR UPDATE USING (
  pharmacy_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM delegate_promotions
    WHERE delegate_promotions.id = promotion_targets.promotion_id
    AND delegate_promotions.delegate_id = auth.uid()
  )
);

-- Visit Requests: delegate or pharmacy involved
CREATE POLICY "visit_read" ON visit_requests FOR SELECT USING (
  auth.uid() = delegate_id OR auth.uid() = pharmacy_id
);
CREATE POLICY "visit_insert" ON visit_requests FOR INSERT WITH CHECK (auth.uid() = delegate_id);
CREATE POLICY "visit_update" ON visit_requests FOR UPDATE USING (
  auth.uid() = delegate_id OR auth.uid() = pharmacy_id
);
