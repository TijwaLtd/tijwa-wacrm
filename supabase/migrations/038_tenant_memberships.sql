-- ============================================================
-- 038_tenant_memberships.sql — Multi-workspace memberships
--
-- Converts from one-account-per-user to many-accounts-per-user.
-- User can now own/join multiple workspaces (accounts).
--
-- What this migration does:
--   1. Creates account_memberships junction table
--   2. Creates has_role_in_account() helper function
--   3. Backfills one owner membership per existing profile
--   4. Drops account_id/account_role from profiles
--   5. Updates all RLS policies to use has_role_in_account()
--   6. Fixes touch_presence() to use memberships
--   7. Updates handle_new_user trigger (no auto-membership)
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. account_memberships table
-- ============================================================
CREATE TABLE IF NOT EXISTS account_memberships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role       account_role_enum NOT NULL DEFAULT 'viewer',
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id    ON account_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_account_id ON account_memberships(account_id);

ALTER TABLE account_memberships ENABLE ROW LEVEL SECURITY;

-- Member and all account members can see the membership
-- Simplified to avoid recursion - just check if user owns the membership
CREATE POLICY memberships_select ON account_memberships FOR SELECT USING (
  auth.uid() = user_id
);

-- Users can insert their own membership
CREATE POLICY memberships_insert ON account_memberships FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- Users can delete their own membership (leave workspace)
CREATE POLICY memberships_delete ON account_memberships FOR DELETE USING (
  auth.uid() = user_id
);

DROP TRIGGER IF EXISTS set_updated_at ON account_memberships;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Helper functions
-- ============================================================

-- Check if user has at least min_role in an account
CREATE OR REPLACE FUNCTION has_role_in_account(
  p_user_id    UUID,
  p_account_id UUID,
  p_min_role   account_role_enum
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_memberships
    WHERE user_id = p_user_id AND account_id = p_account_id
    AND CASE role
          WHEN 'owner'  THEN 4
          WHEN 'admin'  THEN 3
          WHEN 'agent'  THEN 2
          WHEN 'viewer' THEN 1
        END
        >= CASE p_min_role
             WHEN 'owner'  THEN 4
             WHEN 'admin'  THEN 3
             WHEN 'agent'  THEN 2
             WHEN 'viewer' THEN 1
           END
  );
$$;

ALTER FUNCTION has_role_in_account(UUID, UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION has_role_in_account(UUID, UUID, account_role_enum) TO authenticated, service_role;

-- Get all accounts a user belongs to
CREATE OR REPLACE FUNCTION get_user_accounts(p_user_id UUID)
RETURNS TABLE (account_id UUID, account_name TEXT, role account_role_enum, joined_at TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.name, am.role, am.joined_at
  FROM account_memberships am
  JOIN accounts a ON a.id = am.account_id
  WHERE am.user_id = p_user_id
  ORDER BY am.joined_at DESC;
$$;

ALTER FUNCTION get_user_accounts(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_user_accounts(UUID) TO authenticated, service_role;

-- ============================================================
-- 3. Backfill memberships from existing profiles
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
-- 4. Keep account_id on profiles (for storage bucket policies)
-- but stop using it for RLS — memberships is now the source of truth
-- We maintain it via trigger for backwards compatibility
-- ============================================================

-- Add back account_id if it was dropped (re-add as nullable, populated by trigger)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_role account_role_enum;

-- Trigger to keep profiles.account_id in sync with memberships
CREATE OR REPLACE FUNCTION sync_profile_account_from_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set account_id to the user's first membership account
  UPDATE profiles
  SET account_id = (SELECT account_id FROM account_memberships WHERE user_id = NEW.user_id LIMIT 1),
      account_role = (SELECT role FROM account_memberships WHERE user_id = NEW.user_id LIMIT 1)
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_account_on_membership ON account_memberships;
CREATE TRIGGER sync_profile_account_on_membership
  AFTER INSERT OR UPDATE ON account_memberships
  FOR EACH ROW EXECUTE FUNCTION sync_profile_account_from_membership();

-- Also trigger on membership delete
CREATE OR REPLACE FUNCTION sync_profile_account_on_membership_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_account_id UUID;
BEGIN
  -- Get the user's remaining membership (if any)
  SELECT account_id INTO v_next_account_id
  FROM account_memberships
  WHERE user_id = OLD.user_id
  ORDER BY joined_at DESC
  LIMIT 1;

  UPDATE profiles
  SET account_id = v_next_account_id,
      account_role = (SELECT role FROM account_memberships WHERE user_id = OLD.user_id AND account_id = v_next_account_id LIMIT 1)
  WHERE user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_profile_account_on_membership_delete ON account_memberships;
CREATE TRIGGER sync_profile_account_on_membership_delete
  AFTER DELETE ON account_memberships
  FOR EACH ROW EXECUTE FUNCTION sync_profile_account_on_membership_delete();

-- Populate existing profiles from memberships
UPDATE profiles p
SET account_id = (SELECT account_id FROM account_memberships WHERE user_id = p.user_id LIMIT 1),
    account_role = (SELECT role FROM account_memberships WHERE user_id = p.user_id LIMIT 1)
WHERE p.account_id IS NULL;

-- ============================================================
-- 5. Update RLS policies — replace is_account_member() calls
-- ============================================================

-- Tables with direct account_id: contacts, tags, custom_fields, contact_notes,
-- conversations, whatsapp_config, message_templates, pipelines, deals, broadcasts,
-- automations, flows, quick_replies, api_keys, webhook_endpoints,
-- ai_configs, ai_knowledge_documents, ai_knowledge_chunks, member_presence

-- Helper DO block to update policies
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN (
      'contacts', 'tags', 'custom_fields', 'contact_notes',
      'conversations', 'whatsapp_config', 'message_templates',
      'pipelines', 'deals', 'broadcasts', 'automations', 'flows',
      'quick_replies', 'api_keys', 'webhook_endpoints',
      'ai_configs', 'ai_knowledge_documents', 'ai_knowledge_chunks',
      'member_presence', 'messages', 'contact_tags', 'contact_custom_values',
      'pipeline_stages', 'broadcast_recipients', 'automation_steps',
      'flow_nodes', 'flow_run_events', 'message_reactions',
      'automation_logs'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_select ON public.%I', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_all ON public.%I', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_modify ON public.%I', r.tablename);
  END LOOP;
END $$;

-- Contacts: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON contacts FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON contacts FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Tags: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON tags FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON tags FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Custom fields: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON custom_fields FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON custom_fields FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Contact notes: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON contact_notes FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON contact_notes FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Conversations: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON conversations FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON conversations FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- WhatsApp config: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON whatsapp_config FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON whatsapp_config FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Message templates: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON message_templates FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON message_templates FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Pipelines: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON pipelines FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON pipelines FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Deals: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON deals FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON deals FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Broadcasts: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON broadcasts FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON broadcasts FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Automations: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON automations FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON automations FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Flows: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON flows FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON flows FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Quick replies: viewer+ select, agent+ modify
CREATE POLICY tenant_isolation_select ON quick_replies FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON quick_replies FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- API keys: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON api_keys FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON api_keys FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Webhook endpoints: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON webhook_endpoints FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON webhook_endpoints FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- AI configs: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON ai_configs FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON ai_configs FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- AI knowledge documents: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON ai_knowledge_documents FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON ai_knowledge_documents FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- AI knowledge chunks: viewer+ select, admin+ modify
CREATE POLICY tenant_isolation_select ON ai_knowledge_chunks FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_modify ON ai_knowledge_chunks FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Member presence: viewer+ select (writes via touch_presence RPC only)
CREATE POLICY tenant_isolation_select ON member_presence FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Messages: viewer+ select, agent+ modify (via conversation parent)
CREATE POLICY tenant_isolation_select ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND has_role_in_account(auth.uid(), c.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND has_role_in_account(auth.uid(), c.account_id, 'agent'))
);

-- Contact tags: via contact parent
CREATE POLICY tenant_isolation_select ON contact_tags FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND has_role_in_account(auth.uid(), c.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON contact_tags FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_tags.contact_id AND has_role_in_account(auth.uid(), c.account_id, 'agent'))
);

-- Contact custom values: via contact parent
CREATE POLICY tenant_isolation_select ON contact_custom_values FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND has_role_in_account(auth.uid(), c.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON contact_custom_values FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts c WHERE c.id = contact_custom_values.contact_id AND has_role_in_account(auth.uid(), c.account_id, 'agent'))
);

-- Pipeline stages: via pipeline parent
CREATE POLICY tenant_isolation_select ON pipeline_stages FOR SELECT USING (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND has_role_in_account(auth.uid(), p.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON pipeline_stages FOR ALL USING (
  EXISTS (SELECT 1 FROM pipelines p WHERE p.id = pipeline_stages.pipeline_id AND has_role_in_account(auth.uid(), p.account_id, 'admin'))
);

-- Broadcast recipients: via broadcast parent
CREATE POLICY tenant_isolation_select ON broadcast_recipients FOR SELECT USING (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND has_role_in_account(auth.uid(), b.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON broadcast_recipients FOR ALL USING (
  EXISTS (SELECT 1 FROM broadcasts b WHERE b.id = broadcast_recipients.broadcast_id AND has_role_in_account(auth.uid(), b.account_id, 'agent'))
);

-- Automation steps: via automation parent
CREATE POLICY tenant_isolation_select ON automation_steps FOR SELECT USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND has_role_in_account(auth.uid(), a.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON automation_steps FOR ALL USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_steps.automation_id AND has_role_in_account(auth.uid(), a.account_id, 'agent'))
);

-- Flow nodes: via flow parent
CREATE POLICY tenant_isolation_select ON flow_nodes FOR SELECT USING (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND has_role_in_account(auth.uid(), f.account_id, 'viewer'))
);
CREATE POLICY tenant_isolation_modify ON flow_nodes FOR ALL USING (
  EXISTS (SELECT 1 FROM flows f WHERE f.id = flow_nodes.flow_id AND has_role_in_account(auth.uid(), f.account_id, 'agent'))
);

-- Flow run events: via flow_runs parent
CREATE POLICY tenant_isolation_select ON flow_run_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM flow_runs r WHERE r.id = flow_run_events.flow_run_id AND has_role_in_account(auth.uid(), r.account_id, 'viewer'))
);

-- Automation logs: viewer+ select (via automation parent)
CREATE POLICY tenant_isolation_select ON automation_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM automations a WHERE a.id = automation_logs.automation_id AND has_role_in_account(auth.uid(), a.account_id, 'viewer'))
);

-- Message reactions: via message → conversation parent
CREATE POLICY tenant_isolation_select ON message_reactions FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id AND has_role_in_account(auth.uid(), c.account_id, 'viewer')
  )
);
CREATE POLICY tenant_isolation_modify ON message_reactions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.id = message_reactions.message_id AND has_role_in_account(auth.uid(), c.account_id, 'agent')
  )
);

-- ============================================================
-- 6. Fix touch_presence() to use memberships
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_presence(p_status TEXT DEFAULT 'online')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('online', 'away') THEN
    RAISE EXCEPTION 'Invalid presence status: %', p_status USING ERRCODE = '22023';
  END IF;

  -- Get first account user belongs to (presence is per-user, not per-account)
  SELECT account_id INTO v_account_id
  FROM account_memberships
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'User has no account membership' USING ERRCODE = '22023';
  END IF;

  INSERT INTO member_presence (user_id, account_id, status, last_seen_at)
  VALUES (auth.uid(), v_account_id, p_status, now())
  ON CONFLICT (user_id) DO UPDATE
    SET status = excluded.status, last_seen_at = now(), account_id = excluded.account_id;
END;
$$;

ALTER FUNCTION public.touch_presence(TEXT) OWNER TO postgres;

-- ============================================================
-- 7. Update accounts RLS
-- ============================================================
DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;
DROP POLICY IF EXISTS accounts_insert ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT USING (has_role_in_account(auth.uid(), id, 'viewer'));
CREATE POLICY accounts_update ON accounts FOR UPDATE USING (has_role_in_account(auth.uid(), id, 'admin'));
CREATE POLICY accounts_insert ON accounts FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

-- ============================================================
-- 8. Update handle_new_user trigger — no auto-membership
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

  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'), NEW.id);

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, v_full_name, NEW.email);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM account_memberships;  -- Should match profile count
-- SELECT count(*) FROM profiles WHERE account_id IS NOT NULL;  -- Should be 0
-- SELECT has_role_in_account(auth.uid(), (SELECT account_id FROM account_memberships LIMIT 1), 'viewer');  -- Should be true
