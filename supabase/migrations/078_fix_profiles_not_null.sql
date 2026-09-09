-- ============================================================
-- Fix: profiles NOT NULL constraints preventing profile creation
--
-- Root cause: Migration 017 set profiles.account_id and
-- profiles.account_role to NOT NULL. But handle_new_user
-- trigger (migration 047) only inserts (user_id, full_name,
-- email) — missing the required columns. INSERT fails
-- silently due to EXCEPTION WHEN OTHERS, so no profiles
-- row is ever created for new signups.
--
-- Fix 1: Drop NOT NULL constraints (columns are nullable now,
-- tenancy lives in account_memberships)
-- Fix 2: create_workspace uses UPSERT so profiles row is
-- guaranteed to exist after workspace creation
-- ============================================================

-- 1. Drop NOT NULL on profiles.account_id and profiles.account_role
ALTER TABLE profiles ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE profiles ALTER COLUMN account_role DROP NOT NULL;

-- 2. Fix create_workspace to UPSERT profiles (guarantees row exists)
CREATE OR REPLACE FUNCTION public.create_workspace(
  p_name TEXT,
  p_subdomain TEXT,
  p_owner_user_id UUID,
  p_logo_url TEXT DEFAULT NULL,
  p_business_type TEXT DEFAULT 'other'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
  v_full_name TEXT;
  v_email TEXT;
BEGIN
  -- Validate business_type if provided
  IF p_business_type IS NOT NULL AND p_business_type NOT IN (
    'retailer', 'wholesaler', 'restaurant', 'hotel', 'hotel_restaurant',
    'service_business', 'professional_services', 'education', 'ngo_nonprofit',
    'property_real_estate', 'healthcare', 'events', 'logistics_delivery',
    'courier', 'transportation', 'cleaning_services', 'maintenance',
    'beauty_wellness', 'fitness', 'automotive', 'pet_services',
    'healthcare_clinic', 'other'
  ) THEN
    RAISE EXCEPTION 'Invalid business_type: %', p_business_type;
  END IF;

  -- Create account with business_type
  INSERT INTO accounts (name, subdomain, owner_user_id, business_type)
  VALUES (p_name, p_subdomain, p_owner_user_id, COALESCE(p_business_type, 'other'))
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

  -- Get user info for profile upsert
  SELECT full_name, email INTO v_full_name, v_email
  FROM profiles WHERE user_id = p_owner_user_id;

  -- UPSERT profile — guarantees row exists after workspace creation
  INSERT INTO profiles (user_id, full_name, email, account_id, account_role)
  VALUES (
    p_owner_user_id,
    COALESCE(v_full_name, ''),
    COALESCE(v_email, ''),
    v_account_id,
    'owner'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET account_id = v_account_id,
      account_role = 'owner'
  WHERE profiles.account_id IS NULL OR profiles.account_role IS NULL;

  RETURN v_account_id;
END;
$$;

ALTER FUNCTION public.create_workspace(TEXT, TEXT, UUID, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
