-- ============================================================
-- Helper function to create workspace (bypasses RLS)
-- Uses SECURITY DEFINER to run with elevated privileges
-- auth.uid() is NULL in this context, so we trust the API layer
-- to validate the user before calling this function
-- ============================================================

CREATE OR REPLACE FUNCTION create_workspace(
  p_name TEXT,
  p_subdomain TEXT,
  p_owner_user_id UUID,
  p_logo_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Create the account (bypasses RLS due to SECURITY DEFINER)
  INSERT INTO accounts (name, subdomain, owner_user_id)
  VALUES (p_name, p_subdomain, p_owner_user_id)
  RETURNING id INTO v_account_id;

  -- Create membership
  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (p_owner_user_id, v_account_id, 'owner');

  -- Create tenant settings
  INSERT INTO tenant_settings (account_id, display_name, logo_url)
  VALUES (v_account_id, p_name, p_logo_url);

  -- Create starter subscription
  INSERT INTO subscriptions (account_id, plan, status)
  VALUES (v_account_id, 'starter', 'active');

  RETURN v_account_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_workspace(TEXT, TEXT, UUID, TEXT) TO authenticated;
