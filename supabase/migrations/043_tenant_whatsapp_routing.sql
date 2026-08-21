-- ============================================================
-- 043_tenant_whatsapp_routing.sql — WhatsApp multi-number routing
--
-- Enables multiple WhatsApp phone numbers per tenant and proper
-- webhook routing based on phone_number_id.
--
-- What this migration does:
--   1. Creates whatsapp_phones table
--   2. Creates webhook routing function
--   3. Backfills from existing whatsapp_config
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. whatsapp_phones table
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_phones (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  phone_number        TEXT NOT NULL,
  phone_number_id     TEXT NOT NULL UNIQUE,
  waba_id            TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'disconnected', 'suspended')),
  can_send            BOOLEAN NOT NULL DEFAULT TRUE,
  can_receive         BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary          BOOLEAN NOT NULL DEFAULT FALSE,
  access_token_encrypted TEXT,
  verified_at         TIMESTAMPTZ,
  connected_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_phones_phone_number_id ON whatsapp_phones(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phones_account ON whatsapp_phones(account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phones_primary ON whatsapp_phones(account_id) WHERE is_primary = TRUE;

ALTER TABLE whatsapp_phones ENABLE ROW LEVEL SECURITY;

-- Account members can view phones
CREATE POLICY whatsapp_phones_select ON whatsapp_phones FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Admins can manage phones
CREATE POLICY whatsapp_phones_modify ON whatsapp_phones FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_phones;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_phones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Webhook routing function
-- ============================================================

-- Resolve account by phone_number_id (for webhook routing)
CREATE OR REPLACE FUNCTION resolve_account_by_phone_id(p_phone_number_id TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT account_id FROM whatsapp_phones WHERE phone_number_id = p_phone_number_id;
$$;

ALTER FUNCTION resolve_account_by_phone_id(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION resolve_account_by_phone_id(TEXT) TO authenticated, service_role, anon;

-- Get primary phone for account
CREATE OR REPLACE FUNCTION get_primary_whatsapp_phone(p_account_id UUID)
RETURNS whatsapp_phones
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM whatsapp_phones WHERE account_id = p_account_id AND is_primary = TRUE LIMIT 1;
$$;

ALTER FUNCTION get_primary_whatsapp_phone(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_primary_whatsapp_phone(UUID) TO authenticated, service_role;

-- ============================================================
-- 3. Backfill from existing whatsapp_config
-- ============================================================
INSERT INTO whatsapp_phones (account_id, phone_number, phone_number_id, waba_id, access_token_encrypted, status, is_primary)
SELECT
  (SELECT account_id FROM account_memberships WHERE user_id = wc.user_id LIMIT 1),
  wc.phone_number_id,
  wc.phone_number_id,
  wc.waba_id,
  wc.access_token,
  wc.status,
  TRUE
FROM whatsapp_config wc
WHERE wc.phone_number_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_phones wp WHERE wp.phone_number_id = wc.phone_number_id
  )
ON CONFLICT (phone_number_id) DO NOTHING;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM whatsapp_phones;
-- SELECT account_id, count(*) FROM whatsapp_phones GROUP BY account_id;
