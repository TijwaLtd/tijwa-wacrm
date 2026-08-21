-- ============================================================
-- 039_tenant_settings.sql — Tenant settings and plans
--
-- Per-tenant configuration: branding, plan, subscription status.
-- Usage tracking is separate (042), Stripe billing is separate (041).
--
-- What this migration does:
--   1. Creates tenant_settings table
--   2. Backfills for existing accounts
--   3. Adds RLS policies
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. tenant_settings table
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_settings (
  account_id           UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  display_name         TEXT,
  logo_url             TEXT,
  plan                 TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  subscription_status  TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'suspended', 'cancelled', 'trial')),
  features             JSONB NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_plan ON tenant_settings(plan);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- Any account member can read settings
CREATE POLICY tenant_settings_select ON tenant_settings FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Only admins can update settings
CREATE POLICY tenant_settings_update ON tenant_settings FOR UPDATE
  USING (has_role_in_account(auth.uid(), account_id, 'admin'))
  WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON tenant_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Backfill for existing accounts
-- ============================================================
INSERT INTO tenant_settings (account_id, display_name)
SELECT a.id, a.name
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_settings ts WHERE ts.account_id = a.id
)
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================
-- 3. Helper function: get plan features
-- ============================================================
CREATE OR REPLACE FUNCTION get_plan_features(p_plan TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_plan
    WHEN 'starter' THEN '{"max_contacts": 1000, "max_team_members": 5, "max_broadcasts_per_month": 50, "max_automations": 20, "max_flows": 10, "ai_replies_per_month": 100}'::jsonb
    WHEN 'pro' THEN '{"max_contacts": 25000, "max_team_members": 25, "max_broadcasts_per_month": 500, "max_automations": 100, "max_flows": 50, "ai_replies_per_month": 1000}'::jsonb
    WHEN 'enterprise' THEN '{"max_contacts": 1000000, "max_team_members": 999, "max_broadcasts_per_month": 999999, "max_automations": 9999, "max_flows": 9999, "ai_replies_per_month": 999999}'::jsonb
    ELSE '{"max_contacts": 1000, "max_team_members": 5, "max_broadcasts_per_month": 50, "max_automations": 20, "max_flows": 10, "ai_replies_per_month": 100}'::jsonb
  END;
$$;

ALTER FUNCTION get_plan_features(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_plan_features(TEXT) TO authenticated, service_role;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM tenant_settings;  -- Should equal account count
-- SELECT plan, count(*) FROM tenant_settings GROUP BY plan;
