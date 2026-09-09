-- ============================================================
-- NUCLEAR RESET — Drop ALL tables and functions
--
-- This is a complete database wipe. After running, re-apply
-- all migrations with: supabase db push
--
-- WARNING: IRREVERSIBLE
-- ============================================================

-- 1. Drop all tables in dependency order (children first)
DROP TABLE IF EXISTS pending_orders CASCADE;
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS offering_embeddings CASCADE;
DROP TABLE IF EXISTS offering_media CASCADE;
DROP TABLE IF EXISTS catalogue_availability CASCADE;
DROP TABLE IF EXISTS catalogue_sources CASCADE;
DROP TABLE IF EXISTS catalogue_ai_response_templates CASCADE;
DROP TABLE IF EXISTS offerings CASCADE;
DROP TABLE IF EXISTS offering_categories CASCADE;
DROP TABLE IF EXISTS capability_offering_types CASCADE;
DROP TABLE IF EXISTS capability_nodes CASCADE;
DROP TABLE IF EXISTS flow_template_installs CASCADE;
DROP TABLE IF EXISTS account_capabilities CASCADE;
DROP TABLE IF EXISTS business_capabilities CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS team_conversation_participants CASCADE;
DROP TABLE IF EXISTS conversation_topics CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS contact_custom_values CASCADE;
DROP TABLE IF EXISTS contact_notes CASCADE;
DROP TABLE IF EXISTS contact_tags CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS custom_fields CASCADE;
DROP TABLE IF EXISTS flow_run_events CASCADE;
DROP TABLE IF EXISTS flow_runs CASCADE;
DROP TABLE IF EXISTS flow_nodes CASCADE;
DROP TABLE IF EXISTS flows CASCADE;
DROP TABLE IF EXISTS automation_logs CASCADE;
DROP TABLE IF EXISTS automation_steps CASCADE;
DROP TABLE IF EXISTS automation_pending_executions CASCADE;
DROP TABLE IF EXISTS automations CASCADE;
DROP TABLE IF EXISTS broadcast_recipients CASCADE;
DROP TABLE IF EXISTS broadcasts CASCADE;
DROP TABLE IF EXISTS deals CASCADE;
DROP TABLE IF EXISTS pipeline_stages CASCADE;
DROP TABLE IF EXISTS pipelines CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS deal_activity CASCADE;
DROP TABLE IF EXISTS agent_skills CASCADE;
DROP TABLE IF EXISTS agent_departments CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS account_invitations CASCADE;
DROP TABLE IF EXISTS member_presence CASCADE;
DROP TABLE IF EXISTS ai_credit_rates CASCADE;
DROP TABLE IF EXISTS ai_credits CASCADE;
DROP TABLE IF EXISTS ai_configs CASCADE;
DROP TABLE IF EXISTS ai_knowledge_chunks CASCADE;
DROP TABLE IF EXISTS ai_knowledge_documents CASCADE;
DROP TABLE IF EXISTS ai_usage_log CASCADE;
DROP TABLE IF EXISTS webhook_endpoints CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS quick_replies CASCADE;
DROP TABLE IF EXISTS message_templates CASCADE;
DROP TABLE IF EXISTS whatsapp_phones CASCADE;
DROP TABLE IF EXISTS whatsapp_config CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS user_email_preferences CASCADE;
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS billing_history CASCADE;
DROP TABLE IF EXISTS usage_records CASCADE;
DROP TABLE IF EXISTS subscription_events CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS account_schedules CASCADE;
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP TABLE IF EXISTS account_memberships CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

-- 2. Drop all auth users (cascades to auth.identities, auth.sessions)
TRUNCATE TABLE auth.users CASCADE;

-- 3. Drop all functions that reference dropped tables
DROP FUNCTION IF EXISTS create_workspace(TEXT, TEXT, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS is_subdomain_available(TEXT);
DROP FUNCTION IF EXISTS is_within_working_hours(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_plan_features(TEXT);
DROP FUNCTION IF EXISTS get_department_agents(UUID, UUID);
DROP FUNCTION IF EXISTS get_eligible_agents(UUID);
DROP FUNCTION IF EXISTS _nuke_truncate(TEXT);

-- 4. Recreate essential functions
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

  IF v_hours IS NULL THEN RETURN TRUE; END IF;

  v_days := ARRAY(SELECT jsonb_array_elements_text(v_hours->'days'));
  v_start := v_hours->>'start';
  v_end := v_hours->>'end';
  v_timezone := COALESCE(v_hours->>'timezone', 'UTC');
  v_day := LOWER(TO_CHAR(p_at AT TIME ZONE v_timezone, 'Dy'));
  v_local_time := (p_at AT TIME ZONE v_timezone)::TIME;

  IF NOT (v_day = ANY(v_days)) THEN RETURN FALSE; END IF;
  IF v_start IS NULL OR v_end IS NULL THEN RETURN TRUE; END IF;

  IF v_start <= v_end THEN
    RETURN v_local_time >= v_start::TIME AND v_local_time <= v_end::TIME;
  ELSE
    RETURN v_local_time >= v_start::TIME OR v_local_time <= v_end::TIME;
  END IF;
END;
$$;

ALTER FUNCTION public.is_within_working_hours(UUID, TIMESTAMPTZ) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_within_working_hours(UUID, TIMESTAMPTZ) TO authenticated;

-- 5. Verify — should return 0 for everything
SELECT 'accounts' AS tbl, COUNT(*) AS cnt FROM accounts
UNION ALL SELECT 'account_memberships', COUNT(*) FROM account_memberships
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'offerings', COUNT(*) FROM offerings
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'conversations', COUNT(*) FROM conversations
UNION ALL SELECT 'auth.users', COUNT(*) FROM auth.users;
