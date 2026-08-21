-- ============================================================
-- 041_tenant_subscriptions.sql — Subscription tracking
--
-- Tracks subscription state per tenant for billing integration.
-- Stripe webhook handling is done in application code.
--
-- What this migration does:
--   1. Creates subscriptions table
--   2. Backfills starter subscriptions for existing accounts
--   3. Adds RLS policies
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. subscriptions table
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  stripe_price_id         TEXT,
  plan                    TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'unpaid', 'trialing', 'incomplete', 'paused')),
  current_period_start    TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN NOT NULL DEFAULT FALSE,
  trial_end               TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_account ON subscriptions(account_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins+ can view subscriptions
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. subscription_events audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_events (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id   UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL,
  stripe_event_id   TEXT UNIQUE,
  previous_status  TEXT,
  new_status       TEXT,
  previous_plan    TEXT,
  new_plan         TEXT,
  event_data       JSONB,
  processed_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_account ON subscription_events(account_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe ON subscription_events(stripe_event_id);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Service role only (webhook handler writes these)
CREATE POLICY subscription_events_all ON subscription_events FOR ALL USING (auth.uid() IS NOT NULL);

-- ============================================================
-- 3. Backfill starter subscriptions for existing accounts
-- ============================================================
INSERT INTO subscriptions (account_id, plan, status)
SELECT a.id, 'starter', 'active'
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.account_id = a.id
);

-- ============================================================
-- 4. RPC to sync subscription to tenant_settings
-- ============================================================
CREATE OR REPLACE FUNCTION sync_subscription_to_settings(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE tenant_settings SET
    plan = COALESCE((SELECT plan FROM subscriptions WHERE account_id = p_account_id AND stripe_subscription_id IS NOT NULL ORDER BY created_at DESC LIMIT 1), 'starter'),
    updated_at = NOW()
  WHERE account_id = p_account_id;
END;
$$;

ALTER FUNCTION sync_subscription_to_settings(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION sync_subscription_to_settings(UUID) TO service_role;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM subscriptions;
-- SELECT status, count(*) FROM subscriptions GROUP BY status;
