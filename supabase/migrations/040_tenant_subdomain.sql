-- ============================================================
-- 040_tenant_subdomain.sql — Subdomain routing
--
-- Adds subdomain column for SaaS multi-tenant routing.
--
-- What this migration does:
--   1. Adds subdomain column to accounts
--   2. Creates slugify helper
--   3. Creates subdomain validation function
--   4. Backfills subdomains from account names
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Add subdomain column
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_accounts_subdomain ON accounts(subdomain) WHERE subdomain IS NOT NULL;

-- ============================================================
-- 2. Slugify function
-- ============================================================
CREATE OR REPLACE FUNCTION slugify(text) RETURNS TEXT AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(trim($1), '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  )
$$ LANGUAGE sql IMMUTABLE STRICT;

ALTER FUNCTION slugify(TEXT) OWNER TO postgres;

-- ============================================================
-- 3. Subdomain validation
-- ============================================================
CREATE OR REPLACE FUNCTION is_subdomain_available(p_subdomain TEXT)
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

  -- Already taken
  IF EXISTS (SELECT 1 FROM accounts WHERE subdomain = v_normalized) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

ALTER FUNCTION is_subdomain_available(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_subdomain_available(TEXT) TO authenticated, service_role;

-- ============================================================
-- 4. Backfill subdomains from account names
-- ============================================================
UPDATE accounts a SET subdomain = slugify(a.name)
WHERE a.subdomain IS NULL
  AND slugify(a.name) IS NOT NULL
  AND is_subdomain_available(slugify(a.name));

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT name, subdomain FROM accounts WHERE subdomain IS NOT NULL LIMIT 10;
-- SELECT count(*) FROM accounts WHERE subdomain IS NULL;
