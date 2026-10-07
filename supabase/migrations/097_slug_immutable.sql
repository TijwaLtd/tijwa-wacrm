-- ============================================================
-- 097: Workspace slug (accounts.subdomain) is immutable
-- ============================================================
-- The slug is assigned once at creation (POST /api/workspaces) and is a
-- permanent identifier:
--   • webhook URLs       /api/whatsapp/v1/webhook/<slug>
--   • public pages       /<slug>/c/<contactId>, /<slug>/legal/*
--   • branded subdomain  <slug>.wacrm.com
--
-- Renaming a workspace used to silently regenerate the slug (API layer no
-- longer does that either). This trigger makes the guarantee structural:
-- no UPDATE can ever change it, regardless of which code path runs.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_subdomain_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.subdomain IS DISTINCT FROM OLD.subdomain THEN
    RAISE EXCEPTION
      'accounts.subdomain is immutable (attempted %, was %)',
      NEW.subdomain, OLD.subdomain
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_subdomain_immutable ON accounts;
CREATE TRIGGER trg_accounts_subdomain_immutable
  BEFORE UPDATE ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_subdomain_immutable();
