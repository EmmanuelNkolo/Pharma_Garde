-- ============================================================================
-- Pharma-Garde v9.0 — Espace Grossistes-Répartiteurs & Abonnements Pro
-- Inclut également le correctif de fin de script v6 (encodage UTF-8 propre).
-- À exécuter dans Supabase Dashboard > SQL Editor (APRÈS v1..v8).
-- Script 100% IDEMPOTENT : peut être relancé plusieurs fois sans risque.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. CORRECTIF V6 & FONCTION DE GÉNÉRATION DE CODES LISIBLES
-- ═══════════════════════════════════════════════════════════════════════════
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

-- Correctif des politiques RLS de fin de v6 (qui avaient subi une corruption UTF-16)
DROP POLICY IF EXISTS "promo_read" ON delegate_promotions;
CREATE POLICY "promo_read" ON delegate_promotions FOR SELECT
  USING (auth.uid() = delegate_id OR auth.role() = 'authenticated');

DROP POLICY IF EXISTS "target_read" ON promotion_targets;
CREATE POLICY "target_read" ON promotion_targets FOR SELECT
  USING (
    pharmacy_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM delegate_promotions
      WHERE delegate_promotions.id = promotion_targets.promotion_id
        AND delegate_promotions.delegate_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABLE WHOLESALERS (GROSSISTES-RÉPARTITEURS & DISTRIBUTEURS AGRÉÉS)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wholesalers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wholesaler_code TEXT UNIQUE DEFAULT pg_readable_code('GR-'),
  company_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  license_number TEXT NOT NULL,                  -- Agrément DPML / ONPC
  rccm_number TEXT,                              -- Registre du Commerce
  tax_id TEXT,                                   -- NIU / Identifiant fiscal
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  city TEXT NOT NULL DEFAULT 'Douala',
  quarter TEXT,
  address TEXT,
  lat DOUBLE PRECISION DEFAULT 4.0511,
  lng DOUBLE PRECISION DEFAULT 9.7679,
  gps_accuracy DOUBLE PRECISION,
  delivery_zones TEXT[] DEFAULT ARRAY['Douala', 'Yaoundé'],
  min_order_amount NUMERIC DEFAULT 50000,        -- Minimum de commande / Franco (FCFA)
  delivery_delay_hours INT DEFAULT 24,           -- Délai moyen de livraison (heures)
  opening_hours TEXT DEFAULT '07:30 - 18:30',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'urgent_service', 'closed')),
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT true,
  -- Abonnement Pro
  subscription_status TEXT DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'grace', 'expired', 'cancelled')),
  subscription_plan TEXT DEFAULT 'trial' CHECK (subscription_plan IN ('trial', 'monthly', 'quarterly', 'annual')),
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  subscription_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_wholesalers_code ON wholesalers(wholesaler_code);
CREATE INDEX IF NOT EXISTS idx_wholesalers_city ON wholesalers(city);
CREATE INDEX IF NOT EXISTS idx_wholesalers_status ON wholesalers(status);
CREATE INDEX IF NOT EXISTS idx_wholesalers_latlng ON wholesalers(lat, lng);

ALTER TABLE wholesalers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wholesalers_read_all" ON wholesalers;
CREATE POLICY "wholesalers_read_all" ON wholesalers FOR SELECT USING (true);

DROP POLICY IF EXISTS "wholesalers_insert_own" ON wholesalers;
CREATE POLICY "wholesalers_insert_own" ON wholesalers FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "wholesalers_update_own" ON wholesalers;
CREATE POLICY "wholesalers_update_own" ON wholesalers FOR UPDATE
  USING (auth.uid() = id OR auth.role() = 'authenticated');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. TABLE WHOLESALER_CATALOG (CATALOGUE PRODUITS & STOCKS B2B)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wholesaler_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  product_code TEXT,                             -- Code CIP / EAN / SKU
  product_name TEXT NOT NULL,
  product_key TEXT NOT NULL,                     -- Clé normalisée minuscule pour recherche rapide
  dci TEXT,                                      -- Dénomination Commune Internationale
  lab_name TEXT,                                 -- Laboratoire fabricant
  category TEXT DEFAULT 'Médicament',
  form_dosage TEXT,                              -- Ex: Boîte de 20 cp 500mg
  wholesale_price NUMERIC NOT NULL DEFAULT 0,    -- Prix cession grossiste HT (FCFA)
  pharmacy_price NUMERIC DEFAULT 0,              -- Prix public officine conseillé (FCFA)
  stock_quantity INT DEFAULT 0,
  alert_threshold INT DEFAULT 20,
  min_order_qty INT DEFAULT 1,
  in_stock BOOLEAN DEFAULT true,
  is_promoted BOOLEAN DEFAULT false,
  promo_offer TEXT,                              -- Ex: "10+2 gratuits", "-12% sur lot de 50"
  expiry_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wcat_wholesaler ON wholesaler_catalog(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_wcat_product_key ON wholesaler_catalog(product_key);
CREATE INDEX IF NOT EXISTS idx_wcat_lab ON wholesaler_catalog(lab_name);
CREATE INDEX IF NOT EXISTS idx_wcat_instock ON wholesaler_catalog(in_stock);

ALTER TABLE wholesaler_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wcat_read_all" ON wholesaler_catalog;
CREATE POLICY "wcat_read_all" ON wholesaler_catalog FOR SELECT USING (true);

DROP POLICY IF EXISTS "wcat_write_owner" ON wholesaler_catalog;
CREATE POLICY "wcat_write_owner" ON wholesaler_catalog FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "wcat_update_owner" ON wholesaler_catalog;
CREATE POLICY "wcat_update_owner" ON wholesaler_catalog FOR UPDATE USING (true);

DROP POLICY IF EXISTS "wcat_delete_owner" ON wholesaler_catalog;
CREATE POLICY "wcat_delete_owner" ON wholesaler_catalog FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. TABLE WHOLESALER_ORDERS (COMMANDES B2B OFFICINES ⇄ GROSSISTES)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wholesaler_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_code TEXT UNIQUE DEFAULT pg_readable_code('CMD-'),
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  pharmacy_id UUID REFERENCES pharmacies(id) ON DELETE SET NULL,
  pharmacy_name TEXT,
  pharmacy_phone TEXT,
  pharmacy_city TEXT,
  delegate_id UUID REFERENCES delegates(id) ON DELETE SET NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,      -- [{product_id, product_name, qty, unit_price, subtotal}]
  total_amount NUMERIC NOT NULL DEFAULT 0,
  urgency TEXT DEFAULT 'normal' CHECK (urgency IN ('normal', 'urgent', 'critical')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'rejected')),
  delivery_address TEXT,
  notes TEXT,
  wholesaler_response TEXT,
  estimated_delivery_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_worders_wholesaler ON wholesaler_orders(wholesaler_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worders_pharmacy ON wholesaler_orders(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_worders_status ON wholesaler_orders(status);
CREATE INDEX IF NOT EXISTS idx_worders_code ON wholesaler_orders(order_code);

ALTER TABLE wholesaler_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "worders_read_all" ON wholesaler_orders;
CREATE POLICY "worders_read_all" ON wholesaler_orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "worders_insert_all" ON wholesaler_orders;
CREATE POLICY "worders_insert_all" ON wholesaler_orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "worders_update_all" ON wholesaler_orders;
CREATE POLICY "worders_update_all" ON wholesaler_orders FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. TABLE WHOLESALER_CAMPAIGNS (CAMPAGNES, ARRIVAGES & OFFRES B2B)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wholesaler_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  wholesaler_name TEXT,
  title TEXT NOT NULL,
  product_name TEXT NOT NULL,
  lab_name TEXT,
  offer_type TEXT DEFAULT 'arrivage' CHECK (offer_type IN ('arrivage', 'remise', 'gratuites', 'lot', 'urgence')),
  discount_percent NUMERIC DEFAULT 0,
  offer_details TEXT,                            -- Ex: "Nouvel arrivage 5000 boîtes - 10+1 gratuit"
  min_quantity INT DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  target_audience TEXT DEFAULT 'both' CHECK (target_audience IN ('pharmacies', 'delegates', 'both')),
  target_cities TEXT[] DEFAULT ARRAY['Douala', 'Yaoundé'],
  radius_km INT DEFAULT 50,
  valid_until DATE,
  views_count INT DEFAULT 0,
  orders_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wcamp_wholesaler ON wholesaler_campaigns(wholesaler_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wcamp_active ON wholesaler_campaigns(is_active, created_at DESC);

ALTER TABLE wholesaler_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wcamp_read_all" ON wholesaler_campaigns;
CREATE POLICY "wcamp_read_all" ON wholesaler_campaigns FOR SELECT USING (true);

DROP POLICY IF EXISTS "wcamp_insert_all" ON wholesaler_campaigns;
CREATE POLICY "wcamp_insert_all" ON wholesaler_campaigns FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "wcamp_update_all" ON wholesaler_campaigns;
CREATE POLICY "wcamp_update_all" ON wholesaler_campaigns FOR UPDATE USING (true);

DROP POLICY IF EXISTS "wcamp_delete_all" ON wholesaler_campaigns;
CREATE POLICY "wcamp_delete_all" ON wholesaler_campaigns FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. TABLE B2B_MESSAGES (MESSAGERIE GROSSISTE ⇄ PHARMACIE / DÉLÉGUÉ)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS b2b_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  wholesaler_id UUID NOT NULL REFERENCES wholesalers(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL,                      -- ID de la pharmacie ou du délégué
  partner_role TEXT NOT NULL CHECK (partner_role IN ('pharmacy', 'delegate')),
  partner_name TEXT,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('wholesaler', 'pharmacy', 'delegate')),
  subject TEXT,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 3000),
  related_order_id UUID REFERENCES wholesaler_orders(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_msg_wholesaler ON b2b_messages(wholesaler_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_msg_partner ON b2b_messages(partner_id, created_at DESC);

ALTER TABLE b2b_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "b2b_msg_read" ON b2b_messages;
CREATE POLICY "b2b_msg_read" ON b2b_messages FOR SELECT USING (true);

DROP POLICY IF EXISTS "b2b_msg_insert" ON b2b_messages;
CREATE POLICY "b2b_msg_insert" ON b2b_messages FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "b2b_msg_update" ON b2b_messages;
CREATE POLICY "b2b_msg_update" ON b2b_messages FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. SYSTÈME D'ABONNEMENTS PROFESSIONNELS (DÉLÉGUÉS, GROSSISTES, PHARMACIES)
-- ═══════════════════════════════════════════════════════════════════════════
-- Colonnes d'abonnement sur delegates
ALTER TABLE delegates ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'trial';
ALTER TABLE delegates ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'trial';
ALTER TABLE delegates ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');
ALTER TABLE delegates ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days');

-- Colonnes d'abonnement sur pharmacies
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'annual';
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days');
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '365 days');

-- Table centrale des abonnements
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL,
  subscriber_role TEXT NOT NULL CHECK (subscriber_role IN ('delegate', 'wholesaler', 'pharmacy')),
  subscriber_name TEXT,
  subscriber_email TEXT,
  subscriber_phone TEXT,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('trial', 'monthly', 'quarterly', 'annual')),
  plan_label TEXT,
  amount_fcfa INT NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'XAF',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'grace', 'expired', 'cancelled', 'failed')),
  payment_reference TEXT UNIQUE,
  payment_method TEXT CHECK (payment_method IN ('momo', 'om', 'free_trial', 'admin')),
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  reminder_j7_sent BOOLEAN DEFAULT false,
  reminder_j3_sent BOOLEAN DEFAULT false,
  reminder_j1_sent BOOLEAN DEFAULT false,
  reminder_expired_sent BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subs_subscriber ON subscriptions(subscriber_id, subscriber_role);
CREATE INDEX IF NOT EXISTS idx_subs_status_exp ON subscriptions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_subs_ref ON subscriptions(payment_reference);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subs_read_all" ON subscriptions;
CREATE POLICY "subs_read_all" ON subscriptions FOR SELECT USING (true);

DROP POLICY IF EXISTS "subs_insert_all" ON subscriptions;
CREATE POLICY "subs_insert_all" ON subscriptions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "subs_update_all" ON subscriptions;
CREATE POLICY "subs_update_all" ON subscriptions FOR UPDATE USING (true);

-- Table des rappels d'échéance d'abonnement (J-7, J-3, J-1, Expiré)
CREATE TABLE IF NOT EXISTS subscription_reminders_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  subscriber_id UUID NOT NULL,
  subscriber_role TEXT NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('J-7', 'J-3', 'J-1', 'EXPIRED')),
  channel TEXT DEFAULT 'in_app',
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_rem_user ON subscription_reminders_log(subscriber_id, is_read);

ALTER TABLE subscription_reminders_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sub_rem_read_all" ON subscription_reminders_log;
CREATE POLICY "sub_rem_read_all" ON subscription_reminders_log FOR SELECT USING (true);

DROP POLICY IF EXISTS "sub_rem_insert_all" ON subscription_reminders_log;
CREATE POLICY "sub_rem_insert_all" ON subscription_reminders_log FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "sub_rem_update_all" ON subscription_reminders_log;
CREATE POLICY "sub_rem_update_all" ON subscription_reminders_log FOR UPDATE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. FONCTIONS SQL MÉTIER (ACTIVATION & VÉRIFICATION D'ABONNEMENT)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION activate_subscription_by_reference(p_reference TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_duration INTERVAL;
  v_new_start TIMESTAMPTZ := NOW();
  v_new_exp TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_sub FROM subscriptions WHERE payment_reference = p_reference LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Subscription reference not found');
  END IF;

  IF v_sub.plan_id = 'monthly' THEN
    v_duration := INTERVAL '30 days';
  ELSIF v_sub.plan_id = 'quarterly' THEN
    v_duration := INTERVAL '90 days';
  ELSIF v_sub.plan_id = 'annual' THEN
    v_duration := INTERVAL '365 days';
  ELSE
    v_duration := INTERVAL '14 days';
  END IF;

  v_new_exp := v_new_start + v_duration;

  UPDATE subscriptions
  SET status = 'active',
      starts_at = v_new_start,
      expires_at = v_new_exp,
      confirmed_at = NOW(),
      updated_at = NOW()
  WHERE id = v_sub.id;

  IF v_sub.subscriber_role = 'delegate' THEN
    UPDATE delegates
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp
    WHERE id = v_sub.subscriber_id;
  ELSIF v_sub.subscriber_role = 'wholesaler' THEN
    UPDATE wholesalers
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp,
        updated_at = NOW()
    WHERE id = v_sub.subscriber_id;
  ELSIF v_sub.subscriber_role = 'pharmacy' THEN
    UPDATE pharmacies
    SET subscription_status = 'active',
        subscription_plan = v_sub.plan_id,
        subscription_expires_at = v_new_exp
    WHERE id = v_sub.subscriber_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', v_sub.id,
    'subscriber_id', v_sub.subscriber_id,
    'subscriber_role', v_sub.subscriber_role,
    'plan_id', v_sub.plan_id,
    'expires_at', v_new_exp
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. PUBLICATION REALTIME SUPABASE
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE wholesalers; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE wholesaler_catalog; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE wholesaler_orders; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE wholesaler_campaigns; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE b2b_messages; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE subscriptions; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE subscription_reminders_log; EXCEPTION WHEN others THEN NULL; END;
END $$;
