-- ============================================================
-- 047_fix_tenant_memberships.sql — Complete M:N SaaS Fix
--
-- ARCHITECTURE:
--   Signup     → profile ONLY (no account, no membership)
--   Onboarding → account + owner membership
--   Invite     → INSERT membership with invited role
--   Tenancy    → account_memberships ONLY (not profiles.account_id)
--
-- What this fixes:
--   1. handle_new_user — profile only (no account/membership)
--   2. create_workspace — account + owner membership + profile sync
--   3. redeem_invitation — INSERT membership (M:N join, not 1:1 move)
--   4. set_member_role — updates account_memberships
--   5. remove_account_member — DELETE membership (M:N leave)
--   6. transfer_account_ownership — updates account_memberships
--   7. get_user_account_role — new helper function
--   8. Backfill memberships for existing profile.account_id users
--   9. Storage policies — use account_memberships
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Fix handle_new_user — profile only
--    (removes account creation from signup)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Only create the profile; no account, no membership
  -- User creates/joins workspace during onboarding
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, v_full_name, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap profile for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. Add get_user_account_role helper
--    (tenant.md described this but it was missing)
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_account_role(
  p_user_id UUID,
  p_account_id UUID
) RETURNS account_role_enum
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM account_memberships
  WHERE user_id = p_user_id AND account_id = p_account_id;
$$;

ALTER FUNCTION get_user_account_role(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_user_account_role(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- 3. Backfill account_memberships for existing users
--    (users who have profiles with account_id from 017)
-- ============================================================
INSERT INTO account_memberships (user_id, account_id, role, joined_at)
SELECT p.user_id, p.account_id, COALESCE(p.account_role, 'owner'), NOW()
FROM profiles p
WHERE p.account_id IS NOT NULL
  AND p.account_role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM account_memberships am
    WHERE am.user_id = p.user_id AND am.account_id = p.account_id
  )
ON CONFLICT (user_id, account_id) DO NOTHING;

-- ============================================================
-- 4. Fix set_member_role — update account_memberships
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_role(
  p_user_id UUID,
  p_account_id UUID,
  p_new_role account_role_enum
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role account_role_enum;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get caller's role in the target account
  SELECT role INTO v_caller_role
  FROM account_memberships
  WHERE user_id = v_caller_id AND account_id = p_account_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of this account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher' USING ERRCODE = '42501';
  END IF;

  -- Can't change own role
  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot change your own role' USING ERRCODE = '22023';
  END IF;

  -- Owner role changes go through transfer_account_ownership
  IF p_new_role = 'owner' THEN
    RAISE EXCEPTION 'Use transfer_account_ownership to promote a member to owner' USING ERRCODE = '22023';
  END IF;

  -- Verify target is a member of same account
  IF NOT EXISTS (
    SELECT 1 FROM account_memberships
    WHERE user_id = p_user_id AND account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Target user is not a member of this account' USING ERRCODE = '22023';
  END IF;

  -- Update membership role
  UPDATE account_memberships
  SET role = p_new_role
  WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

ALTER FUNCTION public.set_member_role(UUID, UUID, account_role_enum) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_member_role(UUID, UUID, account_role_enum) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_role(UUID, UUID, account_role_enum) TO authenticated;

-- ============================================================
-- 5. Fix remove_account_member — M:N leave (no orphan account)
-- ============================================================
CREATE OR REPLACE FUNCTION public.remove_account_member(
  p_user_id UUID,
  p_account_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role account_role_enum;
  v_target_role account_role_enum;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM account_memberships
  WHERE user_id = v_caller_id AND account_id = p_account_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of this account' USING ERRCODE = '42501';
  END IF;

  -- Caller must be admin+
  IF v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'This action requires the admin role or higher' USING ERRCODE = '42501';
  END IF;

  -- Can't remove yourself (use leave_account instead)
  IF p_user_id = v_caller_id THEN
    RAISE EXCEPTION 'Cannot remove yourself; use leave_account instead' USING ERRCODE = '22023';
  END IF;

  -- Get target's role
  SELECT role INTO v_target_role
  FROM account_memberships
  WHERE user_id = p_user_id AND account_id = p_account_id;

  IF v_target_role IS NULL THEN
    RAISE EXCEPTION 'Target user is not a member of this account' USING ERRCODE = '22023';
  END IF;

  -- Can't remove owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot remove the account owner; transfer ownership first' USING ERRCODE = '22023';
  END IF;

  -- M:N leave: just delete the membership
  DELETE FROM account_memberships
  WHERE user_id = p_user_id AND account_id = p_account_id;
END;
$$;

ALTER FUNCTION public.remove_account_member(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.remove_account_member(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_account_member(UUID, UUID) TO authenticated;

-- ============================================================
-- 6. Add leave_account function (user leaves themselves)
-- ============================================================
CREATE OR REPLACE FUNCTION public.leave_account(
  p_account_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_role account_role_enum;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get user's role
  SELECT role INTO v_role
  FROM account_memberships
  WHERE user_id = v_caller_id AND account_id = p_account_id;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this account' USING ERRCODE = '22023';
  END IF;

  -- Owner can't leave; must transfer or delete account
  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'Cannot leave as owner; transfer ownership or delete the account' USING ERRCODE = '22023';
  END IF;

  DELETE FROM account_memberships
  WHERE user_id = v_caller_id AND account_id = p_account_id;
END;
$$;

ALTER FUNCTION public.leave_account(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.leave_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.leave_account(UUID) TO authenticated;

-- ============================================================
-- 7. Fix transfer_account_ownership — M:N aware
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_account_ownership(
  p_new_owner_user_id UUID,
  p_account_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role account_role_enum;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get caller's role
  SELECT role INTO v_caller_role
  FROM account_memberships
  WHERE user_id = v_caller_id AND account_id = p_account_id;

  IF v_caller_role IS NULL THEN
    RAISE EXCEPTION 'Caller is not a member of this account' USING ERRCODE = '42501';
  END IF;

  -- Only owner can transfer
  IF v_caller_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the account owner can transfer ownership' USING ERRCODE = '42501';
  END IF;

  IF p_new_owner_user_id = v_caller_id THEN
    RAISE EXCEPTION 'You are already the owner' USING ERRCODE = '22023';
  END IF;

  -- Verify target is a member
  IF NOT EXISTS (
    SELECT 1 FROM account_memberships
    WHERE user_id = p_new_owner_user_id AND account_id = p_account_id
  ) THEN
    RAISE EXCEPTION 'Target user is not a member of this account' USING ERRCODE = '22023';
  END IF;

  -- Demote current owner to admin
  UPDATE account_memberships
  SET role = 'admin'
  WHERE user_id = v_caller_id AND account_id = p_account_id;

  -- Promote new owner
  UPDATE account_memberships
  SET role = 'owner'
  WHERE user_id = p_new_owner_user_id AND account_id = p_account_id;

  -- Update denormalized owner on accounts
  UPDATE accounts
  SET owner_user_id = p_new_owner_user_id, updated_at = NOW()
  WHERE id = p_account_id;
END;
$$;

ALTER FUNCTION public.transfer_account_ownership(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(UUID, UUID) TO authenticated;

-- ============================================================
-- 8. Fix redeem_invitation — M:N join (not 1:1 move)
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get invitation
  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been used' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- M:N JOIN: Insert membership (don't delete old account, don't update profile)
  -- User keeps their existing workspaces AND gets access to this one
  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (v_caller_id, v_inv.account_id, v_inv.role)
  ON CONFLICT (user_id, account_id) DO NOTHING;

  -- Mark invitation accepted
  UPDATE account_invitations
  SET accepted_at = NOW(), accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  RETURN v_inv.account_id;
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;

-- ============================================================
-- 9. Fix create_workspace — ensure owner membership + sync
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name TEXT,
  p_subdomain TEXT,
  p_owner_user_id UUID,
  p_logo_url TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Create account
  INSERT INTO accounts (name, subdomain, owner_user_id)
  VALUES (p_name, p_subdomain, p_owner_user_id)
  RETURNING id INTO v_account_id;

  -- Create owner membership
  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (p_owner_user_id, v_account_id, 'owner');

  -- Create tenant settings
  INSERT INTO tenant_settings (account_id, display_name, logo_url)
  VALUES (v_account_id, p_name, p_logo_url);

  -- Create starter subscription
  INSERT INTO subscriptions (account_id, plan, status)
  VALUES (v_account_id, 'starter', 'active');

  -- Sync profile for storage backwards compat
  UPDATE profiles
  SET account_id = v_account_id,
      account_role = 'owner'
  WHERE user_id = p_owner_user_id
    AND (account_id IS NULL OR account_role IS NULL);

  RETURN v_account_id;
END;
$$;

ALTER FUNCTION public.create_workspace(TEXT, TEXT, UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, UUID, TEXT) TO authenticated;

-- ============================================================
-- 10. Update API routes that call old RPC signatures
--    The RPCs now take account_id as a parameter where needed
-- ============================================================

-- ============================================================
-- 11. Update storage policies to use account_memberships
--    (replaces profiles.account_id dependency)
-- ============================================================
DROP POLICY IF EXISTS "Members can upload flow media" ON storage.objects;
CREATE POLICY "Members can upload flow media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'flow-media'
    AND (
      -- New: any account member uploading under their account's folder
      EXISTS (
        SELECT 1 FROM public.account_memberships am
        WHERE am.user_id = auth.uid()
          AND ('account-' || am.account_id::text) = (storage.foldername(name))[1]
      )
      -- Legacy: original uploader keeps access to their files
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can update flow media" ON storage.objects;
CREATE POLICY "Members can update flow media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.account_memberships am
        WHERE am.user_id = auth.uid()
          AND ('account-' || am.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete flow media" ON storage.objects;
CREATE POLICY "Members can delete flow media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'flow-media'
    AND (
      EXISTS (
        SELECT 1 FROM public.account_memberships am
        WHERE am.user_id = auth.uid()
          AND ('account-' || am.account_id::text) = (storage.foldername(name))[1]
      )
      OR auth.uid()::text = (storage.foldername(name))[1]
    )
  );

-- ============================================================
-- 12. Verify
-- ============================================================
-- SELECT count(*) FROM account_memberships;
-- SELECT count(*) FROM profiles WHERE account_id IS NOT NULL;
-- SELECT has_role_in_account(auth.uid(), (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() LIMIT 1), 'viewer');

-- ============================================================
-- 13. Update get_user_accounts to include workspace details
--    (needed because direct RLS queries on account_memberships
--     cause infinite recursion in some PostgreSQL configurations)
-- ============================================================
DROP FUNCTION IF EXISTS get_user_accounts(UUID);

CREATE OR REPLACE FUNCTION get_user_accounts(p_user_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  role account_role_enum,
  joined_at TIMESTAMPTZ,
  default_currency TEXT,
  plan TEXT,
  subscription_status TEXT,
  subdomain TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.name,
    am.role,
    am.joined_at,
    a.default_currency,
    ts.plan,
    ts.subscription_status,
    a.subdomain
  FROM account_memberships am
  JOIN accounts a ON a.id = am.account_id
  LEFT JOIN tenant_settings ts ON ts.account_id = a.id
  WHERE am.user_id = p_user_id
  ORDER BY am.joined_at DESC;
$$;

ALTER FUNCTION get_user_accounts(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_user_accounts(UUID) TO authenticated, service_role;

-- ============================================================
-- 14. Get conversations across all workspaces for multi-workspace inbox
-- ============================================================
DROP FUNCTION IF EXISTS get_user_conversations(UUID);

CREATE OR REPLACE FUNCTION get_user_conversations(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  account_id UUID,
  contact_id UUID,
  status conversation_status,
  assigned_agent_id UUID,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  contact_name TEXT,
  contact_phone TEXT,
  contact_company TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.account_id,
    c.contact_id,
    c.status,
    c.assigned_agent_id,
    c.last_message_text,
    c.last_message_at,
    c.unread_count,
    c.created_at,
    c.updated_at,
    co.name as contact_name,
    co.phone as contact_phone,
    co.company as contact_company
  FROM account_memberships am
  JOIN conversations c ON c.account_id = am.account_id
  LEFT JOIN contacts co ON co.id = c.contact_id
  WHERE am.user_id = p_user_id
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;

ALTER FUNCTION get_user_conversations(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_user_conversations(UUID) TO authenticated, service_role;

-- ============================================================
-- 15. Get contacts across all workspaces for multi-workspace view
-- ============================================================
DROP FUNCTION IF EXISTS get_user_contacts(UUID);

CREATE OR REPLACE FUNCTION get_user_contacts(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  account_id UUID,
  name TEXT,
  phone TEXT,
  email TEXT,
  company TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.account_id,
    c.name,
    c.phone,
    c.email,
    c.company,
    c.created_at,
    c.updated_at
  FROM account_memberships am
  JOIN contacts c ON c.account_id = am.account_id
  WHERE am.user_id = p_user_id
  ORDER BY c.created_at DESC;
$$;

ALTER FUNCTION get_user_contacts(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_user_contacts(UUID) TO authenticated, service_role;
