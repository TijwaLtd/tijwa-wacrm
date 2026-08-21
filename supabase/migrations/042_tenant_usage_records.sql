-- ============================================================
-- 042_tenant_usage_records.sql — Usage tracking
--
-- Tracks usage per metric per month for plan limit enforcement.
--
-- What this migration does:
--   1. Creates usage_records table
--   2. Creates functions to increment/check usage
--   3. Creates view for current usage
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. usage_records table (current period)
-- ============================================================
CREATE TABLE IF NOT EXISTS usage_records (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  metric        TEXT NOT NULL,
  count         INTEGER NOT NULL DEFAULT 0,
  period_start  TIMESTAMPTZ NOT NULL,
  period_end    TIMESTAMPTZ NOT NULL,
  UNIQUE(account_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_account_period ON usage_records(account_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric ON usage_records(metric, period_start);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Account members can view their own usage
CREATE POLICY usage_records_select ON usage_records FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- ============================================================
-- 2. Helper functions
-- ============================================================

-- Get current period boundaries
CREATE OR REPLACE FUNCTION get_current_period()
RETURNS TABLE (period_start TIMESTAMPTZ, period_end TIMESTAMPTZ)
LANGUAGE sql
STABLE AS $$
  SELECT
    DATE_TRUNC('month', NOW())::TIMESTAMPTZ,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::TIMESTAMPTZ;
$$;

ALTER FUNCTION get_current_period() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_current_period() TO authenticated, service_role;

-- Increment usage for a metric
CREATE OR REPLACE FUNCTION increment_usage(
  p_account_id UUID,
  p_metric      TEXT,
  p_increment   INTEGER DEFAULT 1
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_new_count INTEGER;
BEGIN
  SELECT * INTO v_period FROM get_current_period();

  INSERT INTO usage_records (account_id, metric, count, period_start, period_end)
  VALUES (p_account_id, p_metric, p_increment, v_period.period_start, v_period.period_end)
  ON CONFLICT (account_id, metric, period_start)
  DO UPDATE SET count = usage_records.count + p_increment, updated_at = NOW()
  RETURNING count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

ALTER FUNCTION increment_usage(UUID, TEXT, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated, service_role;

-- Check if operation would exceed limit
CREATE OR REPLACE FUNCTION check_usage_limit(
  p_account_id UUID,
  p_metric     TEXT,
  p_increment  INTEGER DEFAULT 1
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit   INTEGER;
  v_current INTEGER;
  v_period  RECORD;
BEGIN
  SELECT * INTO v_period FROM get_current_period();

  -- Get limit from plan features
  SELECT (get_plan_features(plan)->>p_metric)::INTEGER INTO v_limit
  FROM tenant_settings
  WHERE account_id = p_account_id;

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COALESCE(count, 0) INTO v_current
  FROM usage_records
  WHERE account_id = p_account_id AND metric = p_metric AND period_start = v_period.period_start;

  RETURN v_current + p_increment <= v_limit;
END;
$$;

ALTER FUNCTION check_usage_limit(UUID, TEXT, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION check_usage_limit(UUID, TEXT, INTEGER) TO authenticated, service_role;

-- Get current usage for all metrics
CREATE OR REPLACE FUNCTION get_current_usage(p_account_id UUID)
RETURNS TABLE (metric TEXT, current_count INTEGER, limit_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
BEGIN
  SELECT * INTO v_period FROM get_current_period();

  RETURN QUERY
  WITH limits AS (
    SELECT jsonb_object_keys(get_plan_features(plan)) as metric,
           (get_plan_features(plan)::jsonb ->> jsonb_object_keys(get_plan_features(plan))::text)::integer as limit_val
    FROM tenant_settings WHERE account_id = p_account_id
  ),
  current AS (
    SELECT metric, count
    FROM usage_records
    WHERE account_id = p_account_id AND period_start = v_period.period_start
  )
  SELECT l.metric, COALESCE(c.count, 0)::INTEGER, COALESCE(l.limit_val, 0)::INTEGER
  FROM limits l
  LEFT JOIN current c ON c.metric = l.metric;
END;
$$;

ALTER FUNCTION get_current_usage(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_current_usage(UUID) TO authenticated, service_role;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT * FROM get_current_usage((SELECT account_id FROM account_memberships LIMIT 1));
