-- ============================================================
-- NUKE ACCOUNT DATA
--
-- Run this in the Supabase SQL Editor to delete ALL data for
-- every account, including the auth users. This is a full reset.
--
-- WARNING: This is irreversible. It deletes:
--   - All auth users (profiles cascade)
--   - All accounts and their data
--   - All conversations, messages, contacts
--   - All offerings, orders, bookings
--   - All automations, flows, broadcasts
--   - All knowledge base, audit logs
--   - All invitations, memberships
--   - Everything else tied to accounts
--
-- After running, sign up fresh and re-seed via /seed-data.
-- ============================================================

-- Helper: safely truncate a table if it exists
CREATE OR REPLACE FUNCTION _nuke_truncate(tbl TEXT) RETURNS VOID AS $$
BEGIN
  EXECUTE format('TRUNCATE TABLE %I CASCADE', tbl);
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'Table % does not exist, skipping', tbl;
END;
$$ LANGUAGE plpgsql;

-- 1. Wipe child tables first (to avoid FK violations)
--    Order matters: delete from most-dependent → least-dependent.

-- Conversations & messages
SELECT _nuke_truncate('messages');
SELECT _nuke_truncate('team_conversation_participants');
SELECT _nuke_truncate('conversations');

-- Contacts
SELECT _nuke_truncate('contacts');

-- Offerings & media
SELECT _nuke_truncate('offering_embeddings');
SELECT _nuke_truncate('offering_media');
SELECT _nuke_truncate('catalogue_availability');
SELECT _nuke_truncate('catalogue_sources');
SELECT _nuke_truncate('pending_orders');
SELECT _nuke_truncate('order_items');
SELECT _nuke_truncate('orders');
SELECT _nuke_truncate('bookings');
SELECT _nuke_truncate('offerings');
SELECT _nuke_truncate('offering_categories');

-- Capability config
SELECT _nuke_truncate('account_capabilities');
SELECT _nuke_truncate('flow_template_installs');

-- Automations & flows
SELECT _nuke_truncate('flow_runs');
SELECT _nuke_truncate('flows');
SELECT _nuke_truncate('automations');

-- Broadcasts
SELECT _nuke_truncate('broadcasts');

-- Knowledge
SELECT _nuke_truncate('knowledge_base');

-- Audit
SELECT _nuke_truncate('audit_log');

-- Pipelines & deals
SELECT _nuke_truncate('deal_activity');
SELECT _nuke_truncate('deals');
SELECT _nuke_truncate('deal_stages');
SELECT _nuke_truncate('pipelines');

-- Departments, skills, schedules
SELECT _nuke_truncate('agent_skills');
SELECT _nuke_truncate('departments');

-- Invitations
SELECT _nuke_truncate('account_invitations');

-- Presence
SELECT _nuke_truncate('member_presence');

-- Subscriptions
SELECT _nuke_truncate('subscriptions');

-- Tenant settings
SELECT _nuke_truncate('tenant_settings');

-- Team memberships
SELECT _nuke_truncate('account_memberships');

-- Profiles
SELECT _nuke_truncate('profiles');

-- 2. Wipe parent tables
SELECT _nuke_truncate('accounts');

-- 3. Delete all auth users
SELECT _nuke_truncate('auth.users');

-- 4. Cleanup helper
DROP FUNCTION IF EXISTS _nuke_truncate(TEXT);

-- 5. Recreate functions dropped by TRUNCATE auth.users CASCADE
--    (functions in public schema are owned by postgres and get dropped)

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

  INSERT INTO accounts (name, subdomain, owner_user_id, business_type)
  VALUES (p_name, p_subdomain, p_owner_user_id, COALESCE(p_business_type, 'other'))
  RETURNING id INTO v_account_id;

  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (p_owner_user_id, v_account_id, 'owner');

  INSERT INTO tenant_settings (account_id, display_name, logo_url)
  VALUES (v_account_id, p_name, p_logo_url);

  INSERT INTO subscriptions (account_id, plan, status)
  VALUES (v_account_id, 'starter', 'active');

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

-- Recreate is_subdomain_available
CREATE OR REPLACE FUNCTION public.is_subdomain_available(p_subdomain TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM accounts WHERE subdomain = p_subdomain
  );
END;
$$;

ALTER FUNCTION public.is_subdomain_available(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_subdomain_available(TEXT) TO authenticated;

-- Recreate is_within_working_hours
CREATE OR REPLACE FUNCTION public.is_within_working_hours(p_account_id UUID, p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hours JSONB;
  v_day TEXT;
  v_start TEXT;
  v_end TEXT;
  v_days TEXT[];
  v_timezone TEXT;
  v_local_time TIME;
BEGIN
  SELECT operating_hours INTO v_hours
  FROM tenant_settings WHERE account_id = p_account_id;

  IF v_hours IS NULL THEN
    RETURN TRUE;
  END IF;

  v_days := ARRAY(SELECT jsonb_array_elements_text(v_hours->'days'));
  v_start := v_hours->>'start';
  v_end := v_hours->>'end';
  v_timezone := COALESCE(v_hours->>'timezone', 'UTC');

  v_day := LOWER(TO_CHAR(p_at AT TIME ZONE v_timezone, 'Dy'));
  v_local_time := (p_at AT TIME ZONE v_timezone)::TIME;

  IF NOT (v_day = ANY(v_days)) THEN
    RETURN FALSE;
  END IF;

  IF v_start IS NULL OR v_end IS NULL THEN
    RETURN TRUE;
  END IF;

  IF v_start <= v_end THEN
    RETURN v_local_time >= v_start::TIME AND v_local_time <= v_end::TIME;
  ELSE
    RETURN v_local_time >= v_start::TIME OR v_local_time <= v_end::TIME;
  END IF;
END;
$$;

ALTER FUNCTION public.is_within_working_hours(UUID, TIMESTAMPTZ) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_within_working_hours(UUID, TIMESTAMPTZ) TO authenticated;

-- Recreate get_plan_features
CREATE OR REPLACE FUNCTION public.get_plan_features(p_plan TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_plan
    WHEN 'starter' THEN '{"max_contacts": 1000, "max_team_members": 5, "max_broadcasts_per_month": 50, "max_automations": 20, "max_flows": 10, "ai_replies_per_month": 100}'::jsonb
    WHEN 'pro' THEN '{"max_contacts": 25000, "max_team_members": 25, "max_broadcasts_per_month": 500, "max_automations": 100, "max_flows": 50, "ai_replies_per_month": 1000}'::jsonb
    WHEN 'enterprise' THEN '{"max_contacts": 1000000, "max_team_members": 999, "max_broadcasts_per_month": 999999, "max_automations": 9999, "max_flows": 9999, "ai_replies_per_month": 999999}'::jsonb
    ELSE '{"max_contacts": 1000, "max_team_members": 5, "max_broadcasts_per_month": 50, "max_automations": 20, "max_flows": 10, "ai_replies_per_month": 100}'::jsonb
  END;
$$;

ALTER FUNCTION public.get_plan_features(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.get_plan_features(TEXT) TO authenticated, service_role;

-- 6. Verify
SELECT 'accounts' AS tbl, COUNT(*) AS cnt FROM accounts
UNION ALL SELECT 'account_memberships', COUNT(*) FROM account_memberships
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'offerings', COUNT(*) FROM offerings
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'bookings', COUNT(*) FROM bookings
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL SELECT 'flows', COUNT(*) FROM flows
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users;
