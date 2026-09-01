-- ================================================================
-- Pharma-Garde — Supabase Database Schema
-- Run this SQL in Supabase Dashboard > SQL Editor
-- ================================================================

-- 1. Table des pharmacies (avec mot de passe)
CREATE TABLE IF NOT EXISTS pharmacies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT,
  quarter TEXT,
  phone TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  whatsapp TEXT,
  email TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'guard', 'closed')),
  hours TEXT DEFAULT '08:00 - 21:00',
  services TEXT[] DEFAULT '{}',
  is_open BOOLEAN DEFAULT true,
  is_on_duty BOOLEAN DEFAULT false,
  rating NUMERIC(2,1) DEFAULT 4.5,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table des demandes de recherche (patients)
CREATE TABLE IF NOT EXISTS requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  medicines TEXT[] NOT NULL,
  user_phone TEXT,
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius INTEGER DEFAULT 5,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  insurance_name TEXT,
  pharmacy_id UUID REFERENCES pharmacies(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table des réponses des pharmacies
CREATE TABLE IF NOT EXISTS responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  pharmacy_name TEXT,
  pharmacy_phone TEXT,
  pharmacy_address TEXT,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'out_of_stock')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Index pour performance
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_created ON requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_request ON responses(request_id);
CREATE INDEX IF NOT EXISTS idx_responses_pharmacy ON responses(pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_pharmacies_phone ON pharmacies(phone);
CREATE INDEX IF NOT EXISTS idx_pharmacies_status ON pharmacies(status);

-- 5. Enable Realtime for tables
ALTER PUBLICATION supabase_realtime ADD TABLE requests;
ALTER PUBLICATION supabase_realtime ADD TABLE responses;
ALTER PUBLICATION supabase_realtime ADD TABLE pharmacies;

-- 6. Row Level Security (RLS)
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert on pharmacies (anon key)
CREATE POLICY "Public can read pharmacies" ON pharmacies FOR SELECT USING (true);
CREATE POLICY "Public can insert pharmacies" ON pharmacies FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update own pharmacy" ON pharmacies FOR UPDATE USING (true);

-- Allow public read/insert on requests
CREATE POLICY "Public can read requests" ON requests FOR SELECT USING (true);
CREATE POLICY "Public can insert requests" ON requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update requests" ON requests FOR UPDATE USING (true);

-- Allow public read/insert on responses
CREATE POLICY "Public can read responses" ON responses FOR SELECT USING (true);
CREATE POLICY "Public can insert responses" ON responses FOR INSERT WITH CHECK (true);
