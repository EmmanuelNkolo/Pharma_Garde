-- ================================================================
-- Pharma-Garde v8 — Profils Délégués (photo) & Messagerie interne sécurisée
-- À exécuter dans Supabase Dashboard > SQL Editor (APRÈS v4 → v7)
-- Script idempotent : peut être relancé sans risque.
-- ================================================================

-- ─────────────────────────────────────────────
-- 1. PHOTO DE PROFIL DU DÉLÉGUÉ (style WhatsApp)
--    Stockée en Data-URL JPEG compressée (≈ 25-40 Ko, 320×320)
-- ─────────────────────────────────────────────
ALTER TABLE delegates ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE delegates ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

-- Les pharmacies (utilisateurs authentifiés) doivent pouvoir lire le
-- profil public des délégués qui les contactent (nom, photo, labo).
DROP POLICY IF EXISTS "delegates_read_authenticated" ON delegates;
CREATE POLICY "delegates_read_authenticated" ON delegates FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "labs_read_auth" ON delegate_labs;
CREATE POLICY "labs_read_auth" ON delegate_labs FOR SELECT
  USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────
-- 2. MESSAGERIE INTERNE PHARMACIE ⇄ DÉLÉGUÉ
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  delegate_id UUID NOT NULL REFERENCES delegates(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('pharmacy', 'delegate')),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dm_pair ON direct_messages(pharmacy_id, delegate_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dm_delegate ON direct_messages(delegate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_pharmacy ON direct_messages(pharmacy_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_unread ON direct_messages(read_at) WHERE read_at IS NULL;

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Lecture : uniquement les 2 participants de la conversation
DROP POLICY IF EXISTS "dm_read_participants" ON direct_messages;
CREATE POLICY "dm_read_participants" ON direct_messages FOR SELECT
  USING (auth.uid() = pharmacy_id OR auth.uid() = delegate_id);

-- Envoi : l'expéditeur doit être l'utilisateur connecté, dans son propre rôle
DROP POLICY IF EXISTS "dm_insert_sender" ON direct_messages;
CREATE POLICY "dm_insert_sender" ON direct_messages FOR INSERT
  WITH CHECK (
    (sender_role = 'pharmacy' AND auth.uid() = pharmacy_id)
    OR (sender_role = 'delegate' AND auth.uid() = delegate_id)
  );

-- Mise à jour (accusé de lecture) : uniquement les participants
DROP POLICY IF EXISTS "dm_update_participants" ON direct_messages;
CREATE POLICY "dm_update_participants" ON direct_messages FOR UPDATE
  USING (auth.uid() = pharmacy_id OR auth.uid() = delegate_id);

-- Le contenu d'un message ne peut pas être modifié : seul read_at peut changer
CREATE OR REPLACE FUNCTION dm_protect_body() RETURNS TRIGGER AS $$
BEGIN
  NEW.body := OLD.body;
  NEW.sender_role := OLD.sender_role;
  NEW.pharmacy_id := OLD.pharmacy_id;
  NEW.delegate_id := OLD.delegate_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_dm_protect_body ON direct_messages;
CREATE TRIGGER trg_dm_protect_body BEFORE UPDATE ON direct_messages
  FOR EACH ROW EXECUTE FUNCTION dm_protect_body();

-- ─────────────────────────────────────────────
-- 3. TEMPS RÉEL
-- ─────────────────────────────────────────────
DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages; EXCEPTION WHEN others THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE delegates; EXCEPTION WHEN others THEN NULL; END;
END $$;
