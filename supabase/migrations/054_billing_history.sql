-- ============================================================
-- 054_billing_history.sql
-- Audit log for billing events: plan changes, credit purchases,
-- subscription cancellations, and renewals.
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'plan_changed',
    'subscription_cancelled',
    'subscription_reactivated',
    'credits_purchased',
    'credits_granted'
  )),
  description TEXT NOT NULL,
  amount_kes NUMERIC(10,2) DEFAULT 0,
  credits_delta NUMERIC(12,6) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_history_account ON billing_history(account_id, created_at DESC);

ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;

-- Users can see billing history for their own accounts
CREATE POLICY "billing_history_select" ON billing_history
  FOR SELECT
  USING (
    account_id IN (
      SELECT account_id FROM account_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Only service role can insert (API-controlled)
CREATE POLICY "billing_history_insert" ON billing_history
  FOR INSERT
  WITH CHECK (true);

COMMENT ON TABLE billing_history IS 'Audit log for billing events: plan changes, credit purchases, cancellations, renewals.';
