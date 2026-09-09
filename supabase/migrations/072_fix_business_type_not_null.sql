-- ============================================================
-- 072_fix_business_type_not_null.sql
--
-- Fixes critical issue where business_type can be NULL.
-- Ensures all accounts have a business_type as required.
-- ============================================================

-- ============================================================
-- 1. Backfill existing NULL business_type with 'other'
-- ============================================================
UPDATE accounts
SET business_type = 'other'
WHERE business_type IS NULL;

-- ============================================================
-- 2. Make business_type NOT NULL with default 'other'
-- ============================================================
ALTER TABLE accounts
  ALTER COLUMN business_type SET NOT NULL;

ALTER TABLE accounts
  ALTER COLUMN business_type SET DEFAULT 'other';

-- ============================================================
-- 3. Update constraint (remove NULL check since it's now NOT NULL)
-- ============================================================
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_business_type_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_business_type_check
  CHECK (business_type IN (
    'retailer',
    'wholesaler',
    'restaurant',
    'hotel',
    'hotel_restaurant',
    'service_business',
    'professional_services',
    'education',
    'ngo_nonprofit',
    'property_real_estate',
    'healthcare',
    'events',
    'logistics_delivery',
    'courier',
    'transportation',
    'cleaning_services',
    'maintenance',
    'beauty_wellness',
    'fitness',
    'automotive',
    'pet_services',
    'healthcare_clinic',
    'other'
  ));

-- ============================================================
-- 4. Update create_workspace to accept and set business_type
-- ============================================================
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

  -- Sync profile for storage backwards compat
  UPDATE profiles
  SET account_id = v_account_id,
      account_role = 'owner'
  WHERE user_id = p_owner_user_id
    AND (account_id IS NULL OR account_role IS NULL);

  RETURN v_account_id;
END;
$$;

ALTER FUNCTION public.create_workspace(TEXT, TEXT, UUID, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.create_workspace(TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM accounts WHERE business_type IS NULL;  -- Should be 0
-- SELECT business_type, count(*) FROM accounts GROUP BY business_type;
