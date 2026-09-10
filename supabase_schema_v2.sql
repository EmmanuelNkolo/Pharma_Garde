-- ================================================================
-- Pharma-Garde v2.0 — Database Schema Updates
-- Run this SQL in Supabase Dashboard > SQL Editor
-- ================================================================

-- 1. Add expires_at to requests (2h after creation)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Set default: 2 hours after created_at
UPDATE requests SET expires_at = created_at + INTERVAL '2 hours' WHERE expires_at IS NULL;

-- 2. Add responded_at and ignored to responses
ALTER TABLE responses ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE responses ADD COLUMN IF NOT EXISTS ignored BOOLEAN DEFAULT false;

-- 3. Create reservations table
CREATE TABLE IF NOT EXISTS reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  patient_phone TEXT,
  medicines TEXT[] NOT NULL,
  medicines_status JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- 4. Indexes for reservations
CREATE INDEX IF NOT EXISTS idx_reservations_pharmacy ON reservations(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_expires ON reservations(expires_at);

-- 5. Enable Realtime for reservations
ALTER PUBLICATION supabase_realtime ADD TABLE reservations;

-- 6. RLS for reservations
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read reservations" ON reservations FOR SELECT USING (true);
CREATE POLICY "Public can insert reservations" ON reservations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update reservations" ON reservations FOR UPDATE USING (true);

-- 7. Allow pharmacies to delete their own profile
CREATE POLICY "Pharmacy can delete own profile" ON pharmacies FOR DELETE USING (auth.uid() = id);

-- 8. Allow public update on responses (for ignored flag)
CREATE POLICY "Public can update responses" ON responses FOR UPDATE USING (true);

-- 9. Create payments table (for Campay Webhooks)
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,
  amount NUMERIC,
  operator TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Enable Realtime & RLS for payments
ALTER PUBLICATION supabase_realtime ADD TABLE payments;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can insert payments" ON payments FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update payments" ON payments FOR UPDATE USING (true);
CREATE POLICY "Public can read payments" ON payments FOR SELECT USING (true);
