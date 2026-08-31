-- ============================================================
-- Migration 071: Catalogue Service
--
-- Adds infrastructure for the centralized catalogue service:
-- 1. catalogue_sources — tracks internal/external data sources
-- 2. catalogue_availability — extensible availability tracking
-- 3. catalogue_config on tenant_settings — per-account config
-- ============================================================

-- ============================================================
-- 1. Catalogue Sources
-- ============================================================

CREATE TABLE IF NOT EXISTS catalogue_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('internal', 'external')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disabled')),
  config JSONB NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, name)
);

-- RLS: Account members can view, owners/admins can manage
ALTER TABLE catalogue_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_members_view_catalogue_sources"
  ON catalogue_sources FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY "account_owners_manage_catalogue_sources"
  ON catalogue_sources FOR ALL
  USING (has_role_in_account('owner', account_id));

-- Index for account lookups
CREATE INDEX IF NOT EXISTS idx_catalogue_sources_account_id
  ON catalogue_sources(account_id);

-- ============================================================
-- 2. Catalogue Availability
-- ============================================================

CREATE TABLE IF NOT EXISTS catalogue_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  stock_count INTEGER,
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(offering_id)
);

-- RLS: Account members can view, owners/admins can manage
ALTER TABLE catalogue_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_members_view_catalogue_availability"
  ON catalogue_availability FOR SELECT
  USING (is_account_member(account_id));

CREATE POLICY "account_owners_manage_catalogue_availability"
  ON catalogue_availability FOR ALL
  USING (has_role_in_account('owner', account_id));

-- Index for account lookups
CREATE INDEX IF NOT EXISTS idx_catalogue_availability_account_id
  ON catalogue_availability(account_id);

-- Index for offering lookups
CREATE INDEX IF NOT EXISTS idx_catalogue_availability_offering_id
  ON catalogue_availability(offering_id);

-- ============================================================
-- 3. Add source_id to offerings (nullable, for future external sources)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'offerings' AND column_name = 'source_id'
  ) THEN
    ALTER TABLE offerings ADD COLUMN source_id UUID REFERENCES catalogue_sources(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_offerings_source_id ON offerings(source_id);
  END IF;
END $$;

-- ============================================================
-- 4. Add catalogue_config to tenant_settings
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_settings' AND column_name = 'catalogue_config'
  ) THEN
    ALTER TABLE tenant_settings ADD COLUMN catalogue_config JSONB NOT NULL DEFAULT '{
      "default_view": "list",
      "items_per_page": 10,
      "enable_multi_product": true,
      "show_prices": true,
      "show_availability": true
    }'::jsonb;
  END IF;
END $$;

-- ============================================================
-- 5. Seed default internal catalogue source for existing accounts
-- ============================================================

INSERT INTO catalogue_sources (account_id, name, source_type, status, config)
SELECT
  id AS account_id,
  'Internal Catalogue' AS name,
  'internal' AS source_type,
  'active' AS status,
  '{}'::jsonb AS config
FROM accounts
WHERE NOT EXISTS (
  SELECT 1 FROM catalogue_sources cs
  WHERE cs.account_id = accounts.id AND cs.name = 'Internal Catalogue'
)
ON CONFLICT (account_id, name) DO NOTHING;
