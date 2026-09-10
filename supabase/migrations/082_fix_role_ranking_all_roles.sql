-- Fix has_role_in_account and is_account_member to handle ALL account_role_enum values.
--
-- The original functions only mapped owner/admin/agent/viewer (4 roles) but the enum
-- now has 12+ values (manager, driver, rider, receptionist, doctor, instructor,
-- waiter, cleaner, technician, provider, specialist). Any unmapped role returns NULL
-- in the CASE expression, causing the >= comparison to fail silently → RLS blocks
-- all access for team members with extended roles.
--
-- This migration replaces both functions with versions that use integer ranking
-- matching src/lib/auth/roles.ts roleRank().

-- Drop both functions (they have different signatures so safe to DROP IF EXISTS)
DROP FUNCTION IF EXISTS has_role_in_account(UUID, UUID, account_role_enum);
DROP FUNCTION IF EXISTS is_account_member(UUID, account_role_enum);
DROP FUNCTION IF EXISTS is_account_member(UUID);

-- ============================================================
-- Helper: convert any account_role_enum to a numeric rank.
-- Must handle every value in the enum or the CASE returns NULL.
-- ============================================================
CREATE OR REPLACE FUNCTION role_to_rank(p_role account_role_enum)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_role
    WHEN 'owner'        THEN 100
    WHEN 'admin'        THEN 80
    WHEN 'manager'      THEN 60
    WHEN 'agent'        THEN 40
    WHEN 'receptionist' THEN 35
    WHEN 'instructor'   THEN 35
    WHEN 'doctor'       THEN 35
    WHEN 'waiter'       THEN 30
    WHEN 'driver'       THEN 30
    WHEN 'rider'        THEN 30
    WHEN 'cleaner'      THEN 30
    WHEN 'technician'   THEN 30
    WHEN 'provider'     THEN 30
    WHEN 'specialist'   THEN 30
    WHEN 'viewer'       THEN 10
    ELSE 10  -- unknown roles get lowest privilege
  END;
$$;

ALTER FUNCTION role_to_rank(account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION role_to_rank(account_role_enum) TO authenticated, service_role;

-- ============================================================
-- has_role_in_account(p_user_id, p_account_id, p_min_role)
-- Used by migration 038 RLS policies.
-- ============================================================
CREATE OR REPLACE FUNCTION has_role_in_account(
  p_user_id    UUID,
  p_account_id UUID,
  p_min_role   account_role_enum
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_memberships
    WHERE user_id = p_user_id
      AND account_id = p_account_id
      AND role_to_rank(role) >= role_to_rank(p_min_role)
  );
$$;

ALTER FUNCTION has_role_in_account(UUID, UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION has_role_in_account(UUID, UUID, account_role_enum) TO authenticated, service_role;

-- ============================================================
-- is_account_member(target_account_id, min_role)
-- Used by migration 017 RLS policies (reads from profiles).
-- ============================================================
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_memberships am
    WHERE am.user_id = auth.uid()
      AND am.account_id = target_account_id
      AND role_to_rank(am.role) >= role_to_rank(min_role)
  );
$$;

ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

-- ============================================================
-- is_account_member(target_account_id) — no-role overload
-- Used in some older policies: is_account_member(account_id)
-- ============================================================
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM account_memberships am
    WHERE am.user_id = auth.uid()
      AND am.account_id = target_account_id
  );
$$;

ALTER FUNCTION is_account_member(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID) TO authenticated, service_role;
