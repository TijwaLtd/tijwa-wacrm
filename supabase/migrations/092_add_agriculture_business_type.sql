-- ============================================================
-- 092_add_agriculture_business_type.sql
--
-- Adds 'agriculture' as a first-class business type:
--   1. accounts_business_type_check allows it
--   2. create_workspace() validates it
--   3. Commerce capabilities recommend it (so onboarding enables
--      products / catalog / inventory / orders / inquiries)
-- ============================================================

-- 1. accounts constraint (full valid list + agriculture)
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_business_type_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_business_type_check
  CHECK (business_type IS NULL OR business_type IN (
    'retailer',
    'wholesaler',
    'agriculture',
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

-- 2. create_workspace() — same body as 080, plus 'agriculture'
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
    'retailer', 'wholesaler', 'agriculture', 'restaurant', 'hotel', 'hotel_restaurant',
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

-- 3. Recommend commerce capabilities for agriculture workspaces
UPDATE business_capabilities
SET recommended_business_types = recommended_business_types || '["agriculture"]'::jsonb
WHERE key IN ('products', 'product_catalog', 'inventory', 'orders', 'inquiries')
  AND NOT (recommended_business_types @> '["agriculture"]'::jsonb);
