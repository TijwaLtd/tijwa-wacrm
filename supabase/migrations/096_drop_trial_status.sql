-- ============================================================
-- 096_drop_trial_status.sql — no trial tier, ever
--
-- Plans are packages (none/active/suspended/cancelled); trials don't
-- exist in this product. Migration 080's CHECK still allowed 'trial',
-- which invited dead branches in app code ('Trial' badges, trial in
-- active-status lists). Verified no rows use it before tightening.
-- ============================================================

ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_subscription_status_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_subscription_status_check
  CHECK (subscription_status IN ('none', 'active', 'suspended', 'cancelled'));
