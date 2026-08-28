-- ============================================================
-- 064_fix_plan_enum.sql
-- Remove hardcoded plan constraint — plans are defined in the DB
-- via get_plan_features(), not SQL enums. Application validates.
-- ============================================================

ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_plan_check;
