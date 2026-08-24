-- ============================================================
-- 049_ai_credits.sql
-- Platform-provided AI with credit-based billing.
-- Replaces BYO-key with env-var keys + per-tenant credit budgets.
-- ============================================================

-- 1. Credit rates per model (platform-controlled, seeded)
CREATE TABLE IF NOT EXISTS ai_credit_rates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                  TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  model                     TEXT NOT NULL UNIQUE,
  display_name              TEXT NOT NULL,
  input_cost_per_mtok       NUMERIC(10,4) NOT NULL,  -- provider cost per million tokens
  output_cost_per_mtok      NUMERIC(10,4) NOT NULL,
  input_credits_per_mtok    NUMERIC(10,4) NOT NULL,   -- provider cost × 3 (platform markup)
  output_credits_per_mtok   NUMERIC(10,4) NOT NULL,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_credit_rates IS 'Platform-controlled AI model pricing. Input/output costs per million tokens with 3x markup.';

-- Seed with current models (3x markup on provider cost)
INSERT INTO ai_credit_rates (provider, model, display_name, input_cost_per_mtok, output_cost_per_mtok, input_credits_per_mtok, output_credits_per_mtok) VALUES
  ('openai',     'gpt-4o-mini',                     'GPT-4o Mini',              0.15,   0.60,   0.45,   1.80),
  ('openai',     'gpt-4o',                          'GPT-4o',                   2.50,  10.00,   7.50,  30.00),
  ('openai',     'gpt-4.1-mini',                    'GPT-4.1 Mini',             0.40,   1.60,   1.20,   4.80),
  ('openai',     'gpt-4.1-nano',                    'GPT-4.1 Nano',             0.10,   0.40,   0.30,   1.20),
  ('anthropic',  'claude-haiku-4-5-20251001',       'Claude Haiku 4.5',         1.00,   5.00,   3.00,  15.00),
  ('anthropic',  'claude-sonnet-4-5-20250929',      'Claude Sonnet 4.5',        3.00,  15.00,   9.00,  45.00),
  ('anthropic',  'claude-sonnet-4-20250514',        'Claude Sonnet 4',          3.00,  15.00,   9.00,  45.00),
  ('anthropic',  'claude-3-5-haiku-20241022',       'Claude 3.5 Haiku',         0.80,   4.00,   2.40,  12.00)
ON CONFLICT (model) DO UPDATE SET
  display_name            = EXCLUDED.display_name,
  input_cost_per_mtok     = EXCLUDED.input_cost_per_mtok,
  output_cost_per_mtok    = EXCLUDED.output_cost_per_mtok,
  input_credits_per_mtok  = EXCLUDED.input_credits_per_mtok,
  output_credits_per_mtok = EXCLUDED.output_credits_per_mtok;

-- 2. Per-tenant credit balance
CREATE TABLE IF NOT EXISTS ai_credits (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  credits_remaining   NUMERIC(12,6) NOT NULL DEFAULT 0,
  credits_used        NUMERIC(12,6) NOT NULL DEFAULT 0,
  last_reset_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ai_credits IS 'Per-tenant AI credit balance. Deducted on each LLM call based on model pricing.';

CREATE INDEX IF NOT EXISTS idx_ai_credits_account ON ai_credits(account_id);

-- 3. Add credits_used column to ai_usage_log
ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS credits_used NUMERIC(12,6) NOT NULL DEFAULT 0;

-- 4. Update get_plan_features to include AI credits per plan
CREATE OR REPLACE FUNCTION get_plan_features(p_plan TEXT)
RETURNS JSONB AS $$
  SELECT CASE p_plan
    WHEN 'starter' THEN '{
      "max_contacts": 1000,
      "max_team_members": 5,
      "max_broadcasts_per_month": 50,
      "max_automations": 20,
      "max_flows": 10,
      "ai_replies_per_month": 100,
      "ai_credits_per_month": 100
    }'::jsonb
    WHEN 'pro' THEN '{
      "max_contacts": 25000,
      "max_team_members": 25,
      "max_broadcasts_per_month": 500,
      "max_automations": 100,
      "max_flows": 50,
      "ai_replies_per_month": 1000,
      "ai_credits_per_month": 1000
    }'::jsonb
    WHEN 'enterprise' THEN '{
      "max_contacts": 1000000,
      "max_team_members": 999,
      "max_broadcasts_per_month": 999999,
      "max_automations": 9999,
      "max_flows": 9999,
      "ai_replies_per_month": 999999,
      "ai_credits_per_month": 999999
    }'::jsonb
    ELSE '{
      "max_contacts": 1000,
      "max_team_members": 5,
      "max_broadcasts_per_month": 50,
      "max_automations": 20,
      "max_flows": 10,
      "ai_replies_per_month": 100,
      "ai_credits_per_month": 100
    }'::jsonb
  END;
$$ LANGUAGE sql STABLE;

-- 5. Drop BYO-key columns from ai_configs (platform provides keys via env vars)
ALTER TABLE ai_configs DROP COLUMN IF EXISTS api_key;
ALTER TABLE ai_configs DROP COLUMN IF EXISTS embeddings_api_key;

-- 6. RPC: Check if tenant has credits
CREATE OR REPLACE FUNCTION check_ai_credits(p_account_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM ai_credits
    WHERE account_id = p_account_id AND credits_remaining > 0
  );
$$ LANGUAGE sql STABLE;

-- 7. RPC: Deduct credits (atomic, fails if insufficient)
CREATE OR REPLACE FUNCTION deduct_ai_credits(
  p_account_id UUID,
  p_credits NUMERIC(12,6)
) RETURNS BOOLEAN AS $$
  UPDATE ai_credits
  SET credits_remaining = credits_remaining - p_credits,
      credits_used = credits_used + p_credits,
      updated_at = NOW()
  WHERE account_id = p_account_id AND credits_remaining >= p_credits
  RETURNING true;
$$ LANGUAGE sql;

-- 8. RPC: Monthly credit reset
CREATE OR REPLACE FUNCTION reset_ai_credits(
  p_account_id UUID,
  p_new_credits NUMERIC(12,6)
) RETURNS VOID AS $$
  UPDATE ai_credits
  SET credits_remaining = p_new_credits,
      credits_used = 0,
      last_reset_at = NOW(),
      updated_at = NOW()
  WHERE account_id = p_account_id;
$$ LANGUAGE sql;

-- 9. RPC: Add credits (for purchases / plan upgrades)
CREATE OR REPLACE FUNCTION add_ai_credits(
  p_account_id UUID,
  p_credits NUMERIC(12,6)
) RETURNS VOID AS $$
  INSERT INTO ai_credits (account_id, credits_remaining, credits_used, updated_at)
  VALUES (p_account_id, p_credits, 0, NOW())
  ON CONFLICT (account_id) DO UPDATE
  SET credits_remaining = ai_credits.credits_remaining + p_credits,
      updated_at = NOW();
$$ LANGUAGE sql;

-- 10. Auto-create credit row when a new account is created
CREATE OR REPLACE FUNCTION handle_new_account_ai_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ai_credits (account_id, credits_remaining, credits_used)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_account_created_ai_credits ON accounts;
CREATE TRIGGER on_account_created_ai_credits
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_account_ai_credits();

-- 11. RLS policies for ai_credits
ALTER TABLE ai_credits ENABLE ROW LEVEL SECURITY;

-- Any member can read credit balance (inbox needs to know if AI is available)
CREATE POLICY "ai_credits_select" ON ai_credits
  FOR SELECT USING (
    account_id IN (
      SELECT account_id FROM account_memberships WHERE user_id = auth.uid()
    )
  );

-- Only service role can insert/update (billing webhooks, plan upgrades)
-- No authenticated INSERT/UPDATE/DELETE policies — all writes go through RPCs with service role.

-- 12. RLS policies for ai_credit_rates
ALTER TABLE ai_credit_rates ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read rates (settings needs to show model list)
CREATE POLICY "ai_credit_rates_select" ON ai_credit_rates
  FOR SELECT USING (auth.role() = 'authenticated');

-- No authenticated writes — rates are platform-controlled.
