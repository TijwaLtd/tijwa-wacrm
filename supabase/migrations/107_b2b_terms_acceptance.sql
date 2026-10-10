-- ============================================================
-- Migration 107: B2B terms acceptance tracking on accounts.
--
-- Records which version of the platform Terms of Service the
-- business owner accepted, and when. Captured at workspace
-- creation (onboarding review step) and visible in Settings.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS terms_version TEXT,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terms_accepted_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_accounts_terms_version
  ON accounts (terms_version)
  WHERE terms_version IS NOT NULL;

COMMENT ON COLUMN accounts.terms_version IS
  'Version of the platform B2B Terms of Service accepted by the owner (e.g. b2b-v1).';
COMMENT ON COLUMN accounts.terms_accepted_at IS
  'Timestamp when the owner accepted the platform B2B Terms.';
COMMENT ON COLUMN accounts.terms_accepted_by IS
  'auth.users.id of the owner who accepted the Terms.';
