-- ============================================================
-- 080_remove_default_plan.sql
--
-- User MUST select a plan at /billing after onboarding.
-- No default plan is assigned on workspace creation.
-- ============================================================

-- 1. Remove subscriptions insert from create_workspace
--    (subscription is only created when user picks a plan at /billing)
CREATE OR REPLACE FUNCTION create_workspace(
  p_name TEXT,
  p_subdomain TEXT,
  p_owner_user_id UUID,
  p_business_type TEXT DEFAULT NULL,
  p_logo_url TEXT DEFAULT NULL
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

  -- Create tenant settings (NO default plan — user picks at /billing)
  INSERT INTO tenant_settings (account_id, display_name, logo_url)
  VALUES (v_account_id, p_name, p_logo_url);

  -- NO subscriptions row here — created when user selects plan at /billing

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
  ON CONFLICT (user_id) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    account_role = EXCLUDED.account_role,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    email = COALESCE(NULLIF(EXCLUDED.email, ''), profiles.email);

  RETURN v_account_id;
END;
$$;

ALTER FUNCTION create_workspace(
  TEXT, TEXT, UUID, TEXT, TEXT
) OWNER TO postgres;

REVOKE ALL ON FUNCTION create_workspace(
  TEXT, TEXT, UUID, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION create_workspace(
  TEXT, TEXT, UUID, TEXT, TEXT
) TO authenticated;

-- 2. Change tenant_settings.plan default from 'starter' to NULL
--    (no plan until user selects one at /billing)
ALTER TABLE tenant_settings ALTER COLUMN plan DROP DEFAULT;
ALTER TABLE tenant_settings ALTER COLUMN plan TYPE TEXT;
-- NULL means "no plan selected yet"

COMMENT ON COLUMN tenant_settings.plan IS 'Selected plan (business, growth, enterprise). NULL = no plan selected — user must go to /billing.';

-- 3. Add subscription_status default to 'none' for new workspaces
--    (active/trial only set when user picks a plan)
-- Must update CHECK constraint first to allow 'none'
ALTER TABLE tenant_settings DROP CONSTRAINT IF EXISTS tenant_settings_subscription_status_check;
ALTER TABLE tenant_settings ADD CONSTRAINT tenant_settings_subscription_status_check
  CHECK (subscription_status IN ('none', 'active', 'trial', 'suspended', 'cancelled'));
ALTER TABLE tenant_settings ALTER COLUMN subscription_status SET DEFAULT 'none';
UPDATE tenant_settings ts
SET subscription_status = 'none'
WHERE ts.subscription_status IS NULL
   OR (
     ts.subscription_status = 'active'
     AND NOT EXISTS (
       SELECT 1 FROM subscriptions s
       WHERE s.account_id = ts.account_id
         AND s.status IN ('active', 'trialing', 'past_due')
     )
   );
