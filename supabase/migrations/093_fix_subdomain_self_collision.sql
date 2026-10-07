-- ============================================================
-- 093_fix_subdomain_self_collision.sql
--
-- Bug: renaming a workspace (or re-saving the same name) checked
-- availability against ALL accounts — including the account itself.
-- Saving name "Tijwah" on account already holding subdomain "tijwah"
-- reported it as taken, so the flow renamed it to "tijwah-1",
-- breaking the Meta webhook URL .../webhook/tijwah
-- ("Cannot coerce the result to a single JSON object" = 0 rows).
--
-- Fix: allow callers to exclude the account being renamed.
-- ============================================================

-- Drop the old single-arg overload so callers that pass only
-- p_subdomain are not ambiguous between the two signatures.
DROP FUNCTION IF EXISTS is_subdomain_available(TEXT);

CREATE OR REPLACE FUNCTION is_subdomain_available(
  p_subdomain TEXT,
  p_except_account_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := slugify(p_subdomain);

  IF length(v_normalized) < 3 OR length(v_normalized) > 63 THEN
    RETURN FALSE;
  END IF;

  -- Reserved subdomains
  IF v_normalized IN ('www', 'app', 'api', 'admin', 'mail', 'ftp', 'ssh', 'dashboard', 'login', 'signup', 'pricing', 'docs', 'support', 'status', 'assets', 'static', 'cdn', 'images', 'img', 'files', 'default', 'null', 'undefined', 'test') THEN
    RETURN FALSE;
  END IF;

  -- Already taken by a DIFFERENT account
  IF EXISTS (
    SELECT 1 FROM accounts
    WHERE subdomain = v_normalized
      AND (p_except_account_id IS NULL OR id <> p_except_account_id)
  ) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION is_subdomain_available(TEXT, UUID) OWNER TO postgres;

REVOKE ALL ON FUNCTION is_subdomain_available(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_subdomain_available(TEXT, UUID) TO authenticated, service_role;

-- Restore the correct subdomain broken by the self-collision bug
-- (Meta webhook URL uses slug "tijwah"). Guarded so it is a no-op
-- if the slug is already in use elsewhere.
UPDATE accounts
SET subdomain = 'tijwah'
WHERE subdomain = 'tijwah-1'
  AND NOT EXISTS (SELECT 1 FROM accounts WHERE subdomain = 'tijwah');
