-- ============================================================
-- 095_relax_subscriptions_enums.sql — fix silent plan/period writes
--
-- Migration 064 dropped the plan CHECK on tenant_settings but missed
-- subscriptions, whose inline CHECK still reads
--   plan   IN ('starter', 'pro', 'enterprise')
--   status IN ('active', 'past_due', 'cancelled', ...)
--
-- /api/workspaces/plan accepts modern plans ('business', 'growth') and
-- writes them together with current_period_start/end in ONE update to
-- subscriptions. That statement failed atomically on the plan CHECK and
-- the error was ignored upstream — so rows kept plan='starter' and NULL
-- billing periods, and the billing page rendered "—" for
-- "Current period started" / "Next billing date".
--
-- Same rationale as 064: plans are defined in the DB via
-- get_plan_features() (application validates), and subscription status
-- mirrors tenant_settings.subscription_status (which has its own CHECK).
-- ============================================================

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
