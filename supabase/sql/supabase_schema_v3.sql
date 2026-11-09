-- ================================================================
-- Pharma-Garde v3.0 — Database Schema Updates
-- Run this SQL in Supabase Dashboard > SQL Editor
-- ================================================================

-- 1. Add session_id to requests
ALTER TABLE requests ADD COLUMN IF NOT EXISTS session_id VARCHAR(9);

-- 2. Create delegates table
CREATE TABLE IF NOT EXISTS delegates (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  laboratory TEXT NOT NULL,
  pro_card_number TEXT NOT NULL,
  cni_number TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create delegate_promotions table
CREATE TABLE IF NOT EXISTS delegate_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_type TEXT,
  description TEXT,
  document_url TEXT, -- Link to a PDF catalog, etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create delegate_interactions table
-- This handles requests sent by pharmacies to delegates AND vice-versa
CREATE TABLE IF NOT EXISTS delegate_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  sender_type TEXT CHECK (sender_type IN ('delegate', 'pharmacy')),
  interaction_type TEXT NOT NULL, -- e.g., 'catalog_sent', 'visit_request', 'product_inquiry'
  content TEXT,
  related_promotion_id UUID REFERENCES delegate_promotions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending',
  response_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safely add the column if the table was created previously without it
ALTER TABLE delegate_interactions ADD COLUMN IF NOT EXISTS response_notes TEXT;

-- Drop and recreate the status constraint to allow the new statuses
ALTER TABLE delegate_interactions DROP CONSTRAINT IF EXISTS delegate_interactions_status_check;
ALTER TABLE delegate_interactions ADD CONSTRAINT delegate_interactions_status_check 
CHECK (status IN ('pending', 'read', 'replied', 'archived', 'sample_requested', 'visit_requested', 'interested', 'already_stocked', 'rejected', 'visit_confirmed', 'accepted'));

-- 5. RLS Policies
ALTER TABLE delegates ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegate_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE delegate_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Delegates can view all delegates (public profiles)" ON delegates;
CREATE POLICY "Delegates can view all delegates (public profiles)" ON delegates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Delegates can insert own profile" ON delegates;
CREATE POLICY "Delegates can insert own profile" ON delegates FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Delegates can update own profile" ON delegates;
CREATE POLICY "Delegates can update own profile" ON delegates FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Public can view delegate promotions" ON delegate_promotions;
CREATE POLICY "Public can view delegate promotions" ON delegate_promotions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Delegates can insert own promotions" ON delegate_promotions;
CREATE POLICY "Delegates can insert own promotions" ON delegate_promotions FOR INSERT WITH CHECK (auth.uid() = delegate_id);

DROP POLICY IF EXISTS "Delegates can update own promotions" ON delegate_promotions;
CREATE POLICY "Delegates can update own promotions" ON delegate_promotions FOR UPDATE USING (auth.uid() = delegate_id);

DROP POLICY IF EXISTS "Delegates can delete own promotions" ON delegate_promotions;
CREATE POLICY "Delegates can delete own promotions" ON delegate_promotions FOR DELETE USING (auth.uid() = delegate_id);

DROP POLICY IF EXISTS "Users can view relevant interactions" ON delegate_interactions;
CREATE POLICY "Users can view relevant interactions" ON delegate_interactions FOR SELECT USING (
  auth.uid() = delegate_id OR auth.uid() = pharmacy_id
);

DROP POLICY IF EXISTS "Users can insert interactions" ON delegate_interactions;
CREATE POLICY "Users can insert interactions" ON delegate_interactions FOR INSERT WITH CHECK (
  auth.uid() = delegate_id OR auth.uid() = pharmacy_id
);

DROP POLICY IF EXISTS "Users can update relevant interactions" ON delegate_interactions;
CREATE POLICY "Users can update relevant interactions" ON delegate_interactions FOR UPDATE USING (
  auth.uid() = delegate_id OR auth.uid() = pharmacy_id
);
