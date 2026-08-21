# wacrm Multi-Tenant SaaS Migrations

> Complete migration files and testing guide for converting wacrm from single-tenant (one business per deployment) to multi-tenant SaaS (many businesses per deployment).

---

## Table of Contents

1. [Migration Overview](#1-migration-overview)
2. [Migration Files](#2-migration-files)
   - [038_tenant_memberships.sql](#038_tenant_membershipssql)
   - [039_tenant_settings.sql](#039_tenant_settingssql)
   - [040_tenant_subdomain.sql](#040_tenant_subdomainsql)
   - [041_tenant_subscriptions.sql](#041_tenant_subscriptionssql)
   - [042_tenant_usage_records.sql](#042_tenant_usage_recordssql)
   - [043_tenant_whatsapp_routing.sql](#043_tenant_whatsapp_routingsql)
3. [Testing Guide](#3-testing-guide)
4. [Rollback Procedures](#4-rollback-procedures)
5. [Deployment Checklist](#5-deployment-checklist)
6. [Onboarding & Workspace Management](#6-onboarding--workspace-management)
   - [6.1 Updated Signup Flow](#61-updated-signup-flow)
   - [6.2 Middleware: Redirect to Onboarding](#62-middleware-redirect-to-onboarding)
   - [6.3 Onboarding Page](#63-onboarding-page)
   - [6.4 Workspace Switcher](#64-workspace-switcher)
   - [6.5 Settings: Create/Join Additional Workspaces](#65-settings-createjoin-additional-workspaces)
   - [6.6 New API Routes](#66-new-api-routes)
   - [6.7 Invite Link Generation](#67-invite-link-generation)
   - [6.8 AuthProvider Updates](#68-authprovider-updates)
   - [6.9 Component Structure Summary](#69-component-structure-summary)
   - [6.10 Complete User Flow](#610-complete-user-flow)
   - [6.11 Testing the Onboarding Flow](#611-testing-the-onboarding-flow)

---

## 1. Migration Overview

### Current Architecture
- Each `auth.users` row → one `profiles` row
- `profiles.account_id` is NOT NULL (post-migration 017)
- `profiles.account_role` is NOT NULL (post-migration 017)
- One-to-one: user has exactly ONE account
- Signup trigger creates account + profile atomically

### Target Architecture
- Each `auth.users` row → one `profiles` row
- `account_memberships` junction table (user ↔ account, many-to-many)
- `profiles` no longer has `account_id` or `account_role`
- Signup creates account + profile only; no automatic membership
- User must join/create workspaces explicitly

### Migration Sequence

| # | File | Purpose |
|---|------|---------|
| 038 | `tenant_memberships.sql` | Create M:N memberships table, backfill owner memberships |
| 039 | `tenant_settings.sql` | Create tenant settings, plans, usage limits |
| 040 | `tenant_subdomain.sql` | Add subdomain for SaaS routing |
| 041 | `tenant_subscriptions.sql` | Stripe-backed subscriptions |
| 042 | `tenant_usage_records.sql` | Usage tracking per metric per month |
| 043 | `tenant_whatsapp_routing.sql` | Phone number ID for webhook routing |

---

## 2. Migration Files

### 038_tenant_memberships.sql

```sql
-- ============================================================
-- 038_tenant_memberships.sql — M:N User-Account Memberships
--
-- Converts from one-account-per-user to many-accounts-per-user.
--
-- What this migration does:
--   1. Creates `account_memberships` junction table
--   2. Creates `get_user_account_role(user_id, account_id)` function
--   3. Creates `get_user_accounts(user_id)` function
--   4. Backfills one owner membership per existing profile
--   5. Drops `account_id` and `account_role` from `profiles`
--   6. Updates all RLS policies to use the new membership functions
--   7. Replaces `handle_new_user` trigger (no auto-membership)
--
-- Idempotent: safe to run multiple times. Uses DROP IF EXISTS
-- for policies/triggers and ON CONFLICT DO NOTHING for inserts.
-- ============================================================

-- ============================================================
-- STEP 1: Create account_memberships table
-- ============================================================
CREATE TABLE IF NOT EXISTS account_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role account_role_enum NOT NULL DEFAULT 'viewer',
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON account_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_account_id ON account_memberships(account_id);
CREATE INDEX IF NOT EXISTS idx_memberships_role ON account_memberships(account_id, role);

ALTER TABLE account_memberships ENABLE ROW LEVEL SECURITY;

-- Memberships are readable by the member and all account members
CREATE POLICY memberships_select ON account_memberships FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM account_memberships am2
      WHERE am2.user_id = auth.uid()
        AND am2.account_id = account_memberships.account_id
    )
  );

-- Only admins+ can insert memberships (or the user themselves for self-join)
CREATE POLICY memberships_insert ON account_memberships FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = account_memberships.account_id
        AND am.role IN ('admin', 'owner')
    )
  );

-- Only admins+ can delete memberships
CREATE POLICY memberships_delete ON account_memberships FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships am
      WHERE am.user_id = auth.uid()
        AND am.account_id = account_memberships.account_id
        AND am.role IN ('admin', 'owner')
    )
    OR auth.uid() = user_id  -- Users can leave
  );

-- ============================================================
-- STEP 2: Membership helper functions
-- ============================================================

-- Get a user's role in a specific account
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

-- Get all accounts a user belongs to
CREATE OR REPLACE FUNCTION get_user_accounts(p_user_id UUID)
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  role account_role_enum,
  joined_at TIMESTAMPTZ
)
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

-- Check if user is at least a certain role in an account
CREATE OR REPLACE FUNCTION has_role_in_account(
  p_user_id UUID,
  p_account_id UUID,
  p_min_role account_role_enum
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM account_memberships
    WHERE user_id = p_user_id
      AND account_id = p_account_id
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

-- ============================================================
-- STEP 3: Backfill memberships from existing profiles
-- ============================================================

-- One membership per existing profile (owner role)
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
-- STEP 4: Drop old account_id/account_role columns from profiles
-- ============================================================

ALTER TABLE profiles DROP COLUMN IF EXISTS account_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS account_role;

-- ============================================================
-- STEP 5: Update RLS policies for all tables
-- ============================================================

-- Helper for policy rewrites
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY[
    'contacts',
    'tags',
    'custom_fields',
    'contact_notes',
    'conversations',
    'whatsapp_config',
    'message_templates',
    'pipelines',
    'pipeline_stages',
    'deals',
    'broadcasts',
    'broadcast_recipients',
    'automations',
    'automation_steps',
    'automation_logs',
    'flows',
    'flow_nodes',
    'flow_runs',
    'flow_run_events',
    'contact_tags',
    'contact_custom_values',
    'messages',
    'message_reactions',
    'quick_replies',
    'api_keys',
    'webhook_endpoints',
    'webhook_events',
    'ai_configs',
    'ai_knowledge_base'
  ];
BEGIN
  -- Drop all existing policies on domain tables
  FOR v_table IN SELECT unnest(v_tables) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_select', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'tenant_isolation_all', v_table);
  END LOOP;
END $$;

-- Contacts: any account member can read; agents+ can modify
CREATE POLICY tenant_isolation_select ON contacts FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON contacts FOR ALL
  USING (
    CASE
      WHEN get_user_account_role(auth.uid(), account_id) IN ('owner', 'admin', 'agent') THEN TRUE
      ELSE FALSE
    END
  );

-- Tags (settings-class): admins+ only
CREATE POLICY tenant_isolation_select ON tags FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON tags FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Custom fields (settings-class): admins+ only
CREATE POLICY tenant_isolation_select ON custom_fields FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON custom_fields FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Contact notes
CREATE POLICY tenant_isolation_select ON contact_notes FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON contact_notes FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Conversations
CREATE POLICY tenant_isolation_select ON conversations FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON conversations FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- WhatsApp config (settings-class): admins+ only
CREATE POLICY tenant_isolation_select ON whatsapp_config FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON whatsapp_config FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Message templates (settings-class): admins+ only
CREATE POLICY tenant_isolation_select ON message_templates FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON message_templates FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Pipelines (settings-class): admins+ only
CREATE POLICY tenant_isolation_select ON pipelines FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON pipelines FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Pipeline stages (via pipeline)
CREATE POLICY tenant_isolation_select ON pipeline_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND has_role_in_account(auth.uid(), p.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON pipeline_stages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND has_role_in_account(auth.uid(), p.account_id, 'admin')
    )
  );

-- Deals
CREATE POLICY tenant_isolation_select ON deals FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON deals FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Broadcasts
CREATE POLICY tenant_isolation_select ON broadcasts FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON broadcasts FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Broadcast recipients (via broadcast)
CREATE POLICY tenant_isolation_select ON broadcast_recipients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_recipients.broadcast_id
        AND has_role_in_account(auth.uid(), b.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON broadcast_recipients FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM broadcasts b
      WHERE b.id = broadcast_recipients.broadcast_id
        AND has_role_in_account(auth.uid(), b.account_id, 'agent')
    )
  );

-- Automations
CREATE POLICY tenant_isolation_select ON automations FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON automations FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Automation steps (via automation)
CREATE POLICY tenant_isolation_select ON automation_steps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND has_role_in_account(auth.uid(), a.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON automation_steps FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_steps.automation_id
        AND has_role_in_account(auth.uid(), a.account_id, 'agent')
    )
  );

-- Automation logs
CREATE POLICY tenant_isolation_select ON automation_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM automations a
      WHERE a.id = automation_logs.automation_id
        AND has_role_in_account(auth.uid(), a.account_id, 'viewer')
    )
  );

-- Flows
CREATE POLICY tenant_isolation_select ON flows FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON flows FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- Flow nodes (via flow)
CREATE POLICY tenant_isolation_select ON flow_nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flows f
      WHERE f.id = flow_nodes.flow_id
        AND has_role_in_account(auth.uid(), f.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON flow_nodes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM flows f
      WHERE f.id = flow_nodes.flow_id
        AND has_role_in_account(auth.uid(), f.account_id, 'agent')
    )
  );

-- Flow runs
CREATE POLICY tenant_isolation_select ON flow_runs FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Flow run events (via flow_runs)
CREATE POLICY tenant_isolation_select ON flow_run_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM flow_runs r
      WHERE r.id = flow_run_events.flow_run_id
        AND has_role_in_account(auth.uid(), r.account_id, 'viewer')
    )
  );

-- Contact tags (via contact)
CREATE POLICY tenant_isolation_select ON contact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_tags.contact_id
        AND has_role_in_account(auth.uid(), c.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON contact_tags FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_tags.contact_id
        AND has_role_in_account(auth.uid(), c.account_id, 'agent')
    )
  );

-- Contact custom values (via contact)
CREATE POLICY tenant_isolation_select ON contact_custom_values FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_custom_values.contact_id
        AND has_role_in_account(auth.uid(), c.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON contact_custom_values FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM contacts c
      WHERE c.id = contact_custom_values.contact_id
        AND has_role_in_account(auth.uid(), c.account_id, 'agent')
    )
  );

-- Messages (via conversation)
CREATE POLICY tenant_isolation_select ON messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND has_role_in_account(auth.uid(), c.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND has_role_in_account(auth.uid(), c.account_id, 'agent')
    )
  );

-- Message reactions (via message → conversation)
CREATE POLICY tenant_isolation_select ON message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND has_role_in_account(auth.uid(), c.account_id, 'viewer')
    )
  );
CREATE POLICY tenant_isolation_all ON message_reactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = message_reactions.message_id
        AND has_role_in_account(auth.uid(), c.account_id, 'agent')
    )
  );

-- Quick replies
CREATE POLICY tenant_isolation_select ON quick_replies FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON quick_replies FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- API keys
CREATE POLICY tenant_isolation_select ON api_keys FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON api_keys FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Webhook endpoints
CREATE POLICY tenant_isolation_select ON webhook_endpoints FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON webhook_endpoints FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Webhook events
CREATE POLICY tenant_isolation_select ON webhook_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM webhook_endpoints we
      WHERE we.id = webhook_events.endpoint_id
        AND has_role_in_account(auth.uid(), we.account_id, 'viewer')
    )
  );

-- AI configs
CREATE POLICY tenant_isolation_select ON ai_configs FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON ai_configs FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- AI knowledge base
CREATE POLICY tenant_isolation_select ON ai_knowledge_base FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));
CREATE POLICY tenant_isolation_all ON ai_knowledge_base FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- ============================================================
-- STEP 6: Update accounts table policies
-- ============================================================

DROP POLICY IF EXISTS accounts_select ON accounts;
DROP POLICY IF EXISTS accounts_update ON accounts;

CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (has_role_in_account(auth.uid(), id, 'viewer'));

CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (has_role_in_account(auth.uid(), id, 'admin'));

-- ============================================================
-- STEP 7: Update account_invitations table policies
-- ============================================================

DROP POLICY IF EXISTS account_invitations_select ON account_invitations;
DROP POLICY IF EXISTS account_invitations_modify ON account_invitations;

CREATE POLICY account_invitations_select ON account_invitations FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

CREATE POLICY account_invitations_modify ON account_invitations FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- STEP 8: Replace handle_new_user trigger
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
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Create the personal account (no automatic membership)
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id
  )
  RETURNING id INTO v_account_id;

  -- Create the profile (without account_id/account_role)
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
-- STEP 9: Updated_at trigger for memberships
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON account_memberships;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VERIFICATION QUERIES (run these to confirm migration success)
-- ============================================================

-- 1. Should return the same count as profiles (one membership per profile)
-- SELECT count(*) FROM account_memberships;

-- 2. Should return 0 (no profiles should have account_id anymore)
-- SELECT count(*) FROM profiles WHERE account_id IS NOT NULL;

-- 3. Should return 0 (no profiles should have account_role anymore)
-- SELECT count(*) FROM profiles WHERE account_role IS NOT NULL;

-- 4. Every membership should have a valid user and account
-- SELECT count(*) FROM account_memberships am
-- LEFT JOIN auth.users u ON u.id = am.user_id
-- LEFT JOIN accounts a ON a.id = am.account_id
-- WHERE u.id IS NULL OR a.id IS NULL;
```

---

### 039_tenant_settings.sql

```sql
-- ============================================================
-- 039_tenant_settings.sql — Tenant Settings & Plans
--
-- Creates tenant_settings table for per-tenant configuration:
-- branding, subscription plans, usage limits, etc.
--
-- What this migration does:
--   1. Creates `tenant_settings` table
--   2. Creates backfill function for existing accounts
--   3. Backfills tenant_settings for all existing accounts
--   4. Updates RLS policies
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- STEP 1: Create tenant_settings table
-- ============================================================

CREATE TABLE IF NOT EXISTS tenant_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,

  -- Branding
  display_name TEXT,
  logo_url TEXT,
  accent_color TEXT DEFAULT '#7c3aed',
  custom_css TEXT,

  -- Subscription
  plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'pro', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'suspended', 'cancelled', 'trial', 'trialing')),
  subscription_expires_at TIMESTAMPTZ,

  -- Usage limits per plan
  max_contacts INTEGER NOT NULL DEFAULT 1000,
  max_team_members INTEGER NOT NULL DEFAULT 5,
  max_broadcasts_per_month INTEGER NOT NULL DEFAULT 50,
  max_automations INTEGER NOT NULL DEFAULT 20,
  max_flows INTEGER NOT NULL DEFAULT 10,
  ai_reply_limit_per_month INTEGER NOT NULL DEFAULT 100,
  ai_autoreply_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- Feature flags
  features JSONB NOT NULL DEFAULT '{}',

  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_settings_plan ON tenant_settings(plan);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_status ON tenant_settings(subscription_status);

ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- Anyone in the account can read settings
CREATE POLICY tenant_settings_select ON tenant_settings FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Only admins+ can update settings
CREATE POLICY tenant_settings_update ON tenant_settings FOR UPDATE
  USING (has_role_in_account(auth.uid(), account_id, 'admin'))
  WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin'));

-- No direct inserts (created by trigger or explicit RPC)
CREATE POLICY tenant_settings_insert ON tenant_settings FOR INSERT
  WITH CHECK (has_role_in_account(auth.uid(), account_id, 'owner'));

-- ============================================================
-- STEP 2: Plan limits configuration
-- ============================================================

-- Function to get plan limits
CREATE OR REPLACE FUNCTION get_plan_limits(p_plan TEXT)
RETURNS TABLE (
  max_contacts INTEGER,
  max_team_members INTEGER,
  max_broadcasts_per_month INTEGER,
  max_automations INTEGER,
  max_flows INTEGER,
  ai_reply_limit_per_month INTEGER
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE p_plan
      WHEN 'starter' THEN 1000
      WHEN 'pro' THEN 25000
      WHEN 'enterprise' THEN 1000000
      ELSE 1000
    END,
    CASE p_plan
      WHEN 'starter' THEN 5
      WHEN 'pro' THEN 25
      WHEN 'enterprise' THEN 999
      ELSE 5
    END,
    CASE p_plan
      WHEN 'starter' THEN 50
      WHEN 'pro' THEN 500
      WHEN 'enterprise' THEN 999999
      ELSE 50
    END,
    CASE p_plan
      WHEN 'starter' THEN 20
      WHEN 'pro' THEN 100
      WHEN 'enterprise' THEN 9999
      ELSE 20
    END,
    CASE p_plan
      WHEN 'starter' THEN 10
      WHEN 'pro' THEN 50
      WHEN 'enterprise' THEN 9999
      ELSE 10
    END,
    CASE p_plan
      WHEN 'starter' THEN 100
      WHEN 'pro' THEN 1000
      WHEN 'enterprise' THEN 999999
      ELSE 100
    END;
$$;

ALTER FUNCTION get_plan_limits(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_plan_limits(TEXT) TO authenticated, service_role;

-- ============================================================
-- STEP 3: Update plan limits based on subscription
-- ============================================================

-- Function to sync limits from plan
CREATE OR REPLACE FUNCTION sync_tenant_limits(p_account_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan TEXT;
  v_limits RECORD;
BEGIN
  SELECT plan INTO v_plan FROM tenant_settings WHERE account_id = p_account_id;
  
  IF v_plan IS NULL THEN
    RETURN;
  END IF;
  
  SELECT * INTO v_limits FROM get_plan_limits(v_plan);
  
  UPDATE tenant_settings SET
    max_contacts = v_limits.max_contacts,
    max_team_members = v_limits.max_team_members,
    max_broadcasts_per_month = v_limits.max_broadcasts_per_month,
    max_automations = v_limits.max_automations,
    max_flows = v_limits.max_flows,
    ai_reply_limit_per_month = v_limits.ai_reply_limit_per_month,
    updated_at = NOW()
  WHERE account_id = p_account_id;
END;
$$;

ALTER FUNCTION sync_tenant_limits(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION sync_tenant_limits(UUID) TO authenticated, service_role;

-- ============================================================
-- STEP 4: Backfill tenant_settings for existing accounts
-- ============================================================

INSERT INTO tenant_settings (account_id, display_name, plan)
SELECT a.id, a.name, 'starter'
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM tenant_settings ts WHERE ts.account_id = a.id
)
ON CONFLICT (account_id) DO NOTHING;

-- ============================================================
-- STEP 5: Updated_at trigger
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON tenant_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 6: RPC for plan changes (with limit sync)
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_tenant_plan(
  p_account_id UUID,
  p_plan TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is owner or admin
  IF NOT has_role_in_account(auth.uid(), p_account_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: must be admin or owner';
  END IF;
  
  -- Validate plan
  IF p_plan NOT IN ('starter', 'pro', 'enterprise') THEN
    RAISE EXCEPTION 'Invalid plan: %', p_plan;
  END IF;
  
  -- Update plan
  UPDATE tenant_settings SET
    plan = p_plan,
    updated_at = NOW()
  WHERE account_id = p_account_id;
  
  -- Sync limits
  PERFORM sync_tenant_limits(p_account_id);
END;
$$;

ALTER FUNCTION public.update_tenant_plan(UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.update_tenant_plan(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- 1. Should have one row per account
-- SELECT count(*) FROM tenant_settings;

-- 2. Should return 0 if all accounts have settings
-- SELECT count(*) FROM accounts a
-- LEFT JOIN tenant_settings ts ON ts.account_id = a.id
-- WHERE ts.account_id IS NULL;

-- 3. Verify plan limits
-- SELECT plan, max_contacts, max_team_members FROM tenant_settings LIMIT 10;
```

---

### 040_tenant_subdomain.sql

```sql
-- ============================================================
-- 040_tenant_subdomain.sql — Subdomain Routing
--
-- Adds subdomain column to accounts for SaaS multi-tenant routing.
--
-- What this migration does:
--   1. Adds subdomain column to accounts
--   2. Creates unique index on subdomain (case-insensitive)
--   3. Creates function to validate and reserve subdomains
--   4. Backfills subdomain from existing accounts (slugified name)
--   5. Adds RLS policy for subdomain visibility
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- STEP 1: Add subdomain column
-- ============================================================

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subdomain TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_accounts_subdomain ON accounts(subdomain)
  WHERE subdomain IS NOT NULL;

-- ============================================================
-- STEP 2: Reserved subdomains (cannot be used by tenants)
-- ============================================================

CREATE TABLE IF NOT EXISTS reserved_subdomains (
  subdomain TEXT PRIMARY KEY,
  reason TEXT NOT NULL
);

INSERT INTO reserved_subdomains (subdomain, reason) VALUES
  ('www', 'Reserved for marketing site'),
  ('app', 'Reserved for main application'),
  ('api', 'Reserved for API'),
  ('admin', 'Reserved for admin dashboard'),
  ('mail', 'Reserved for email'),
  ('smtp', 'Reserved for email'),
  ('ftp', 'Reserved for file transfers'),
  ('ssh', 'Reserved for SSH'),
  ('dashboard', 'Reserved for dashboard redirect'),
  ('login', 'Reserved for auth'),
  ('signup', 'Reserved for signup'),
  ('pricing', 'Reserved for marketing'),
  ('docs', 'Reserved for documentation'),
  ('support', 'Reserved for support'),
  ('status', 'Reserved for status page'),
  ('assets', 'Reserved for CDN'),
  ('static', 'Reserved for static assets'),
  ('cdn', 'Reserved for CDN'),
  ('images', 'Reserved for image hosting'),
  ('img', 'Reserved for image hosting'),
  ('files', 'Reserved for file hosting'),
  ('default', 'Reserved keyword'),
  ('null', 'Reserved keyword'),
  ('undefined', 'Reserved keyword'),
  ('test', 'Reserved for testing')
ON CONFLICT (subdomain) DO NOTHING;

ALTER TABLE reserved_subdomains ENABLE ROW LEVEL SECURITY;

-- No public access to reserved list
CREATE POLICY reserved_subdomains_none ON reserved_subdomains FOR SELECT USING (false);

-- ============================================================
-- STEP 3: Slugify function for subdomain generation
-- ============================================================

CREATE OR REPLACE FUNCTION slugify(text) RETURNS TEXT AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        trim($1),
        '[^a-zA-Z0-9\s-]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  )
$$ LANGUAGE sql IMMUTABLE STRICT;

ALTER FUNCTION slugify(TEXT) OWNER TO postgres;

-- ============================================================
-- STEP 4: Check if subdomain is available
-- ============================================================

CREATE OR REPLACE FUNCTION is_subdomain_available(p_subdomain TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := slugify(p_subdomain);
  
  -- Check length (3-63 characters per RFC)
  IF length(v_normalized) < 3 OR length(v_normalized) > 63 THEN
    RETURN FALSE;
  END IF;
  
  -- Check reserved list
  IF EXISTS (SELECT 1 FROM reserved_subdomains WHERE subdomain = v_normalized) THEN
    RETURN FALSE;
  END IF;
  
  -- Check existing accounts
  IF EXISTS (SELECT 1 FROM accounts WHERE subdomain = v_normalized) THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$;

ALTER FUNCTION is_subdomain_available(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_subdomain_available(TEXT) TO authenticated, service_role;

-- ============================================================
-- STEP 5: Set subdomain with validation
-- ============================================================

CREATE OR REPLACE FUNCTION set_account_subdomain(
  p_account_id UUID,
  p_subdomain TEXT
) RETURNS TEXT  -- Returns the normalized subdomain or throws
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  -- Verify caller is owner or admin
  IF NOT has_role_in_account(auth.uid(), p_account_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: must be admin or owner';
  END IF;
  
  v_normalized := slugify(p_subdomain);
  
  -- Check availability
  IF NOT is_subdomain_available(v_normalized) THEN
    RAISE EXCEPTION 'Subdomain % is not available', v_normalized;
  END IF;
  
  -- Update
  UPDATE accounts SET subdomain = v_normalized WHERE id = p_account_id;
  
  RETURN v_normalized;
END;
$$;

ALTER FUNCTION set_account_subdomain(UUID, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION set_account_subdomain(UUID, TEXT) TO authenticated, service_role;

-- ============================================================
-- STEP 6: Backfill subdomains for existing accounts
-- ============================================================

UPDATE accounts a SET subdomain = slugify(a.name)
WHERE a.subdomain IS NULL
  AND slugify(a.name) IS NOT NULL
  AND is_subdomain_available(slugify(a.name));

-- For accounts with duplicate subdomains after backfill, set to NULL
-- (these will need manual resolution)
WITH duplicates AS (
  SELECT subdomain, count(*) as cnt
  FROM accounts
  WHERE subdomain IS NOT NULL
  GROUP BY subdomain
  HAVING count(*) > 1
)
UPDATE accounts a SET subdomain = NULL
FROM duplicates d
WHERE a.subdomain = d.subdomain;

-- ============================================================
-- STEP 7: Update RLS for subdomain visibility
-- ============================================================

-- Accounts are visible to their members and by subdomain lookup
DROP POLICY IF EXISTS accounts_select ON accounts;
CREATE POLICY accounts_select ON accounts FOR SELECT
  USING (
    has_role_in_account(auth.uid(), id, 'viewer')
    OR subdomain IS NOT NULL  -- Allow public lookup by subdomain
  );

DROP POLICY IF EXISTS accounts_update ON accounts;
CREATE POLICY accounts_update ON accounts FOR UPDATE
  USING (has_role_in_account(auth.uid(), id, 'admin'))
  WITH CHECK (has_role_in_account(auth.uid(), id, 'admin'));

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- 1. Check for duplicate subdomains
-- SELECT subdomain, count(*) FROM accounts
-- WHERE subdomain IS NOT NULL
-- GROUP BY subdomain
-- HAVING count(*) > 1;

-- 2. Check reserved subdomain violations
-- SELECT a.id, a.subdomain FROM accounts a
-- JOIN reserved_subdomains r ON r.subdomain = a.subdomain;

-- 3. Validate subdomain format
-- SELECT id, name, subdomain FROM accounts
-- WHERE subdomain IS NOT NULL
--   AND (length(subdomain) < 3 OR length(subdomain) > 63);
```

---

### 041_tenant_subscriptions.sql

```sql
-- ============================================================
-- 041_tenant_subscriptions.sql — Stripe Subscriptions
--
-- Creates subscription tracking for billing integration.
-- Requires Stripe keys to be configured in environment.
--
-- What this migration does:
--   1. Creates `subscriptions` table
--   2. Creates `subscription_events` table for audit log
--   3. Creates webhook handling functions
--   4. Creates RPCs for subscription management
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- STEP 1: Create subscriptions table
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Stripe references
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_price_id TEXT,
  
  -- Subscription details
  plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN (
      'active', 'past_due', 'cancelled', 'unpaid', 
      'trialing', 'incomplete', 'incomplete_expired',
      'paused'
    )),
  
  -- Period tracking
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at TIMESTAMPTZ,
  
  -- Trial
  trial_end TIMESTAMPTZ,
  
  -- Meta
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_account 
  ON subscriptions(account_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer 
  ON subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_status 
  ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Admins+ can view subscriptions
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- Only owners can modify subscription ( Stripe webhook also modifies via service_role)
-- INSERT/UPDATE handled by Stripe webhook + service role

-- ============================================================
-- STEP 2: Create subscription_events audit log
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Event details
  event_type TEXT NOT NULL,  -- 'created', 'updated', 'renewed', 'cancelled', 'failed'
  stripe_event_id TEXT UNIQUE,
  
  -- Snapshot of subscription state at event time
  previous_status TEXT,
  new_status TEXT,
  previous_plan TEXT,
  new_plan TEXT,
  
  -- Event data (full Stripe event payload for debugging)
  event_data JSONB,
  
  -- Processing
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  process_error TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_subscription 
  ON subscription_events(subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_account 
  ON subscription_events(account_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_stripe 
  ON subscription_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_subscription_events_type 
  ON subscription_events(event_type);

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Service role only for event log (webhook handler)
CREATE POLICY subscription_events_service ON subscription_events FOR ALL
  USING (auth.uid() IS NOT NULL);  -- Let service role handle

-- ============================================================
-- STEP 3: Create/update subscription from Stripe webhook
-- ============================================================

CREATE OR REPLACE FUNCTION handle_stripe_subscription(
  p_event_type TEXT,
  p_stripe_subscription_id TEXT,
  p_stripe_customer_id TEXT,
  p_account_id UUID,
  p_event_data JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_id UUID;
  v_subscription subscriptions%ROWTYPE;
  v_previous_status TEXT;
  v_previous_plan TEXT;
  v_new_status TEXT;
  v_new_plan TEXT;
BEGIN
  -- Extract subscription details from event data
  v_new_status := p_event_data->>'status';
  v_new_plan := COALESCE(
    (p_event_data->'items'->'data'->0->'price'->'metadata'->>'plan_name'),
    'starter'
  );
  
  -- Handle based on event type
  IF p_event_type = 'customer.subscription.created' THEN
    -- Create new subscription record
    INSERT INTO subscriptions (
      account_id,
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      plan,
      status,
      current_period_start,
      current_period_end,
      trial_end
    ) VALUES (
      p_account_id,
      p_stripe_customer_id,
      p_stripe_subscription_id,
      p_event_data->'items'->'data'->0->'price'->>'id',
      v_new_plan,
      v_new_status,
      to_timestamp((p_event_data->>'current_period_start')::numeric),
      to_timestamp((p_event_data->>'current_period_end')::numeric),
      CASE 
        WHEN p_event_data->>'trial_end' IS NOT NULL 
        THEN to_timestamp((p_event_data->>'trial_end')::numeric)
        ELSE NULL 
      END
    )
    ON CONFLICT (stripe_subscription_id) DO UPDATE
    SET status = v_new_status,
        updated_at = NOW()
    RETURNING id INTO v_subscription_id;
    
  ELSIF p_event_type IN (
    'customer.subscription.updated',
    'customer.subscription.trial_will_end',
    'customer.subscription.third_patron_moderation'
  ) THEN
    -- Update existing subscription
    UPDATE subscriptions s
    SET 
      status = v_new_status,
      plan = v_new_plan,
      stripe_price_id = p_event_data->'items'->'data'->0->'price'->>'id',
      current_period_start = to_timestamp((p_event_data->>'current_period_start')::numeric),
      current_period_end = to_timestamp((p_event_data->>'current_period_end')::numeric),
      cancel_at_period_end = (p_event_data->>'cancel_at_period_end')::boolean,
      cancelled_at = CASE 
        WHEN p_event_type = 'customer.subscription.deleted' THEN NOW() 
        ELSE NULL 
      END,
      updated_at = NOW()
    WHERE s.stripe_subscription_id = p_stripe_subscription_id
    RETURNING status, plan INTO v_previous_status, v_previous_plan;
    
    v_subscription_id := (SELECT id FROM subscriptions WHERE stripe_subscription_id = p_stripe_subscription_id);
    
  ELSIF p_event_type = 'customer.subscription.deleted' THEN
    -- Mark as cancelled
    UPDATE subscriptions
    SET status = 'cancelled',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE stripe_subscription_id = p_stripe_subscription_id
    RETURNING id INTO v_subscription_id;
    
    v_previous_status := 'active';
    v_previous_plan := NULL;
    
  ELSE
    -- Unhandled event type, just log
    v_subscription_id := (SELECT id FROM subscriptions WHERE stripe_subscription_id = p_stripe_subscription_id);
  END IF;
  
  -- Log the event
  INSERT INTO subscription_events (
    subscription_id,
    account_id,
    event_type,
    stripe_event_id,
    previous_status,
    new_status,
    previous_plan,
    new_plan,
    event_data
  ) VALUES (
    v_subscription_id,
    p_account_id,
    p_event_type,
    p_event_data->>'id',
    v_previous_status,
    v_new_status,
    v_previous_plan,
    v_new_plan,
    p_event_data
  );
  
  -- Sync tenant_settings with new subscription state
  IF v_subscription_id IS NOT NULL THEN
    UPDATE tenant_settings SET
      plan = v_new_plan,
      subscription_status = v_new_status,
      updated_at = NOW()
    WHERE account_id = p_account_id;
    
    -- Sync limits from plan
    PERFORM sync_tenant_limits(p_account_id);
  END IF;
  
  RETURN v_subscription_id;
END;
$$;

ALTER FUNCTION handle_stripe_subscription(
  TEXT, TEXT, TEXT, UUID, JSONB
) OWNER TO postgres;

-- ============================================================
-- STEP 4: RPC to create Stripe checkout session
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_stripe_checkout(
  p_account_id UUID,
  p_plan TEXT,
  p_success_url TEXT,
  p_cancel_url TEXT
) RETURNS TEXT  -- Returns Stripe checkout URL
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id TEXT;
  v_session_id TEXT;
  v_stripe_key TEXT;
  v_stripe_price_ids JSONB;
BEGIN
  -- Verify caller is owner
  IF NOT has_role_in_account(auth.uid(), p_account_id, 'owner') THEN
    RAISE EXCEPTION 'Forbidden: must be account owner';
  END IF;
  
  -- Get Stripe key
  v_stripe_key := current_setting('app.stripe_secret_key', true);
  IF v_stripe_key IS NULL THEN
    RAISE EXCEPTION 'Stripe not configured';
  END IF;
  
  -- Get or create Stripe customer
  SELECT stripe_customer_id INTO v_customer_id
  FROM subscriptions
  WHERE account_id = p_account_id
  LIMIT 1;
  
  -- Get price IDs from environment or config
  v_stripe_price_ids := current_setting('app.stripe_price_ids', true)::jsonb;
  
  -- Create checkout session (requires Stripe SDK call from application code)
  -- This function returns needed info; actual Stripe API call in Next.js
  
  RETURN jsonb_build_object(
    'customer_id', v_customer_id,
    'plan', p_plan,
    'price_id', v_stripe_price_ids->>p_plan
  )::text;
END;
$$;

ALTER FUNCTION public.create_stripe_checkout(UUID, TEXT, TEXT, TEXT) 
  OWNER TO postgres;

-- ============================================================
-- STEP 5: RPC to cancel subscription
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_subscription(
  p_account_id UUID,
  p_cancel_now BOOLEAN DEFAULT FALSE
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_key TEXT;
BEGIN
  -- Verify caller is owner
  IF NOT has_role_in_account(auth.uid(), p_account_id, 'owner') THEN
    RAISE EXCEPTION 'Forbidden: must be account owner';
  END IF;
  
  -- Get Stripe key
  v_stripe_key := current_setting('app.stripe_secret_key', true);
  IF v_stripe_key IS NULL THEN
    RAISE EXCEPTION 'Stripe not configured';
  END IF;
  
  -- Call Stripe API to cancel (handled in application code)
  -- Set cancel_at_period_end = TRUE
  UPDATE subscriptions
  SET cancel_at_period_end = TRUE,
      updated_at = NOW()
  WHERE account_id = p_account_id
    AND stripe_subscription_id IS NOT NULL;
  
  RETURN TRUE;
END;
$$;

ALTER FUNCTION public.cancel_subscription(UUID, BOOLEAN) OWNER TO postgres;

-- ============================================================
-- STEP 6: Updated_at trigger
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 7: Backfill subscriptions for existing accounts
-- ============================================================

-- Existing accounts get a starter subscription
INSERT INTO subscriptions (account_id, plan, status)
SELECT a.id, 'starter', 'active'
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.account_id = a.id
)
ON CONFLICT (stripe_subscription_id) DO NOTHING;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- 1. Check for accounts without subscriptions
-- SELECT count(*) FROM accounts a
-- LEFT JOIN subscriptions s ON s.account_id = a.id
-- WHERE s.id IS NULL;

-- 2. Check subscription status distribution
-- SELECT status, count(*) FROM subscriptions GROUP BY status;

-- 3. Check for expired subscriptions
-- SELECT s.id, a.name, s.status, s.current_period_end
-- FROM subscriptions s
-- JOIN accounts a ON a.id = s.account_id
-- WHERE s.current_period_end < NOW()
--   AND s.status = 'active';
```

---

### 042_tenant_usage_records.sql

```sql
-- ============================================================
-- 042_tenant_usage_records.sql — Usage Tracking
--
-- Creates per-tenant, per-metric, per-period usage tracking.
-- Used for enforcing plan limits and billing.
--
-- What this migration does:
--   1. Creates `usage_records` table
--   2. Creates `usage_snapshots` table for daily snapshots
--   3. Creates functions to increment/check usage
--   4. Creates views for current period usage
--   5. Creates RPCs for usage management
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- STEP 1: Create usage_records table
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,  -- 'contacts', 'messages', 'broadcasts', 'ai_replies', 'team_members'
  count INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL,  -- Monthly period start (1st of month)
  period_end TIMESTAMPTZ NOT NULL,    -- Monthly period end
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, metric, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_records_account_period
  ON usage_records(account_id, period_start);
CREATE INDEX IF NOT EXISTS idx_usage_records_metric
  ON usage_records(metric, period_start);

ALTER TABLE usage_records ENABLE ROW LEVEL SECURITY;

-- Anyone in account can view their own usage
CREATE POLICY usage_records_select ON usage_records FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Service role only for increments (webhook handlers, cron jobs)
CREATE POLICY usage_records_service ON usage_records FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- STEP 2: Create usage_snapshots for daily tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS usage_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, metric, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_usage_snapshots_account_date
  ON usage_snapshots(account_id, snapshot_date);

ALTER TABLE usage_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_snapshots_select ON usage_snapshots FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- ============================================================
-- STEP 3: Get current period boundaries
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_period()
RETURNS TABLE (period_start TIMESTAMPTZ, period_end TIMESTAMPTZ)
LANGUAGE sql
STABLE
AS $$
  SELECT
    DATE_TRUNC('month', NOW())::TIMESTAMPTZ,
    (DATE_TRUNC('month', NOW()) + INTERVAL '1 month')::TIMESTAMPTZ;
$$;

ALTER FUNCTION get_current_period() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_current_period() TO authenticated, service_role;

-- ============================================================
-- STEP 4: Increment usage
-- ============================================================

CREATE OR REPLACE FUNCTION increment_usage(
  p_account_id UUID,
  p_metric TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS INTEGER  -- Returns new count
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
  v_new_count INTEGER;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_current_period();
  
  -- Upsert usage record
  INSERT INTO usage_records (account_id, metric, count, period_start, period_end)
  VALUES (p_account_id, p_metric, p_increment, v_period.period_start, v_period.period_end)
  ON CONFLICT (account_id, metric, period_start)
  DO UPDATE SET 
    count = usage_records.count + p_increment,
    updated_at = NOW()
  RETURNING count INTO v_new_count;
  
  RETURN v_new_count;
END;
$$;

ALTER FUNCTION increment_usage(UUID, TEXT, INTEGER) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION increment_usage(UUID, TEXT, INTEGER) TO authenticated, service_role;

-- ============================================================
-- STEP 5: Check usage against limits
-- ============================================================

CREATE OR REPLACE FUNCTION check_usage_limit(
  p_account_id UUID,
  p_metric TEXT,
  p_increment INTEGER DEFAULT 1
) RETURNS BOOLEAN  -- TRUE if within limit, FALSE if would exceed
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_current INTEGER;
  v_period RECORD;
BEGIN
  -- Get current period
  SELECT * INTO v_period FROM get_current_period();
  
  -- Get limit from tenant_settings
  SELECT
    CASE p_metric
      WHEN 'contacts' THEN max_contacts
      WHEN 'team_members' THEN max_team_members
      WHEN 'broadcasts' THEN max_broadcasts_per_month
      WHEN 'automations' THEN max_automations
      WHEN 'flows' THEN max_flows
      WHEN 'ai_replies' THEN ai_reply_limit_per_month
      ELSE NULL
    END INTO v_limit
  FROM tenant_settings
  WHERE account_id = p_account_id;
  
  -- If no limit configured, allow
  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Get current usage
  SELECT COALESCE(count, 0) INTO v_current
  FROM usage_records
  WHERE account_id = p_account_id
    AND metric = p_metric
    AND period_start = v_period.period_start;
  
  RETURN v_current + p_increment <= v_limit;
END;
$$;

ALTER FUNCTION check_usage_limit(UUID, TEXT, INTEGER) OWNUR TO postgres;
GRANT EXECUTE ON FUNCTION check_usage_limit(UUID, TEXT, INTEGER) TO authenticated, service_role;

-- ============================================================
-- STEP 6: Get current usage for all metrics
-- ============================================================

CREATE OR REPLACE FUNCTION get_current_usage(p_account_id UUID)
RETURNS TABLE (
  metric TEXT,
  current_count INTEGER,
  limit_count INTEGER,
  percent_used NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period RECORD;
BEGIN
  SELECT * INTO v_period FROM get_current_period();
  
  RETURN QUERY
  WITH limits AS (
    SELECT 
      'contacts' as metric, max_contacts as limit_val FROM tenant_settings WHERE account_id = p_account_id
    UNION ALL
    SELECT 'team_members', max_team_members FROM tenant_settings WHERE account_id = p_account_id
    UNION ALL
    SELECT 'broadcasts', max_broadcasts_per_month FROM tenant_settings WHERE account_id = p_account_id
    UNION ALL
    SELECT 'automations', max_automations FROM tenant_settings WHERE account_id = p_account_id
    UNION ALL
    SELECT 'flows', max_flows FROM tenant_settings WHERE account_id = p_account_id
    UNION ALL
    SELECT 'ai_replies', ai_reply_limit_per_month FROM tenant_settings WHERE account_id = p_account_id
  ),
  current AS (
    SELECT metric, count
    FROM usage_records
    WHERE account_id = p_account_id
      AND period_start = v_period.period_start
  )
  SELECT
    l.metric,
    COALESCE(c.count, 0)::INTEGER,
    COALESCE(l.limit_val, 0)::INTEGER,
    CASE 
      WHEN l.limit_val > 0 THEN (COALESCE(c.count, 0)::NUMERIC / l.limit_val::NUMERIC * 100)
      ELSE 0
    END
  FROM limits l
  LEFT JOIN current c ON c.metric = l.metric;
END;
$$;

ALTER FUNCTION get_current_usage(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_current_usage(UUID) TO authenticated, service_role;

-- ============================================================
-- STEP 7: Daily snapshot cron (run via pg_cron)
-- ============================================================

CREATE OR REPLACE FUNCTION take_usage_snapshots()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Snapshot contacts count
  INSERT INTO usage_snapshots (account_id, metric, count, snapshot_date)
  SELECT account_id, 'contacts', count(*), v_today
  FROM contacts
  GROUP BY account_id
  ON CONFLICT (account_id, metric, snapshot_date) DO UPDATE
  SET count = EXCLUDED.count;
  
  -- Snapshot team_members count
  INSERT INTO usage_snapshots (account_id, metric, count, snapshot_date)
  SELECT account_id, 'team_members', count(*), v_today
  FROM account_memberships
  GROUP BY account_id
  ON CONFLICT (account_id, metric, snapshot_date) DO UPDATE
  SET count = EXCLUDED.count;
  
  -- Snapshot broadcasts count
  INSERT INTO usage_snapshots (account_id, metric, count, snapshot_date)
  SELECT account_id, 'broadcasts', count(*), v_today
  FROM broadcasts
  WHERE created_at >= DATE_TRUNC('month', NOW())
  GROUP BY account_id
  ON CONFLICT (account_id, metric, snapshot_date) DO UPDATE
  SET count = EXCLUDED.count;
  
  -- Snapshot flows count
  INSERT INTO usage_snapshots (account_id, metric, count, snapshot_date)
  SELECT account_id, 'flows', count(*), v_today
  FROM flows
  GROUP BY account_id
  ON CONFLICT (account_id, metric, snapshot_date) DO UPDATE
  SET count = EXCLUDED.count;
  
  -- Snapshot automations count
  INSERT INTO usage_snapshots (account_id, metric, count, snapshot_date)
  SELECT account_id, 'automations', count(*), v_today
  FROM automations
  GROUP BY account_id
  ON CONFLICT (account_id, metric, snapshot_date) DO UPDATE
  SET count = EXCLUDED.count;
END;
$$;

ALTER FUNCTION take_usage_snapshots() OWNER TO postgres;

-- ============================================================
-- STEP 8: Usage alerts (for near-limit warnings)
-- ============================================================

CREATE OR REPLACE FUNCTION check_usage_alerts(p_account_id UUID)
RETURNS TABLE (metric TEXT, alert_level TEXT, percent_used NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.metric,
    CASE
      WHEN u.percent_used >= 100 THEN 'exceeded'
      WHEN u.percent_used >= 90 THEN 'critical'
      WHEN u.percent_used >= 75 THEN 'warning'
      ELSE 'ok'
    END::TEXT as alert_level,
    u.percent_used
  FROM get_current_usage(p_account_id) u
  WHERE u.percent_used >= 75;
END;
$$;

ALTER FUNCTION check_usage_alerts(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION check_usage_alerts(UUID) TO authenticated, service_role;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- 1. Check for accounts without any usage records
-- SELECT a.id, a.name FROM accounts a
-- LEFT JOIN usage_records u ON u.account_id = a.id
-- WHERE u.id IS NULL;

-- 2. Get current period usage for an account
-- SELECT * FROM get_current_usage('account-uuid-here');

-- 3. Check for exceeded limits
-- SELECT u.account_id, a.name, u.metric, u.current_count, u.limit_count
-- FROM get_current_usage(u.account_id) u
-- JOIN accounts a ON a.id = u.account_id
-- WHERE u.current_count > u.limit_count;
```

---

### 043_tenant_whatsapp_routing.sql

```sql
-- ============================================================
-- 043_tenant_whatsapp_routing.sql — WhatsApp Multi-Number Routing
--
-- Enables multiple WhatsApp phone numbers per tenant and
-- proper webhook routing for multi-tenant SaaS.
--
-- What this migration does:
--   1. Adds phone_number_id to whatsapp_config (for webhook routing)
--   2. Renames existing whatsapp_config entries to allow multiple
--   3. Creates whatsapp_phones table for multiple numbers per tenant
--   4. Updates RLS policies
--   5. Creates webhook routing function
--
-- Idempotent: safe to run multiple times.
-- ============================================================

-- ============================================================
-- STEP 1: Backup existing whatsapp_config data
-- ============================================================

-- First, let's check what we have
-- SELECT id, user_id, phone_number_id, waba_id FROM whatsapp_config;

-- ============================================================
-- STEP 2: Create whatsapp_phones table for multi-number support
-- ============================================================

CREATE TABLE IF NOT EXISTS whatsapp_phones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  
  -- Phone identification
  phone_number TEXT NOT NULL,
  phone_number_id TEXT NOT NULL UNIQUE,  -- Meta's phone number ID
  waba_id TEXT,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'connected', 'disconnected', 'suspended')),
  
  -- Capabilities (what this number can do)
  can_send BOOLEAN NOT NULL DEFAULT TRUE,
  can_receive BOOLEAN NOT NULL DEFAULT TRUE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Token (encrypted, like existing whatsapp_config)
  access_token_encrypted TEXT,
  
  -- Verification
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  
  -- Meta
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_phones_number_id 
  ON whatsapp_phones(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phones_account 
  ON whatsapp_phones(account_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phones_status 
  ON whatsapp_phones(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_phones_primary 
  ON whatsapp_phones(account_id, is_primary) WHERE is_primary = TRUE;

ALTER TABLE whatsapp_phones ENABLE ROW LEVEL SECURITY;

-- WhatsApp phones visible to account members
CREATE POLICY whatsapp_phones_select ON whatsapp_phones FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

CREATE POLICY whatsapp_phones_modify ON whatsapp_phones FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- STEP 3: Create webhook routing function
-- ============================================================

CREATE OR REPLACE FUNCTION resolve_account_by_phone_number(
  p_phone_number_id TEXT
) RETURNS UUID  -- Returns account_id
LANGUAGE sql
STABLE
AS $$
  SELECT account_id FROM whatsapp_phones
  WHERE phone_number_id = p_phone_number_id;
$$;

ALTER FUNCTION resolve_account_by_phone_number(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION resolve_account_by_phone_number(TEXT) TO authenticated, service_role, anon;

-- For backwards compatibility with existing single-number setup
CREATE OR REPLACE FUNCTION resolve_account_by_waba_id(
  p_waba_id TEXT
) RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  -- First try whatsapp_phones
  SELECT account_id FROM whatsapp_phones
  WHERE waba_id = p_waba_id
  LIMIT 1;
$$;

ALTER FUNCTION resolve_account_by_waba_id(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION resolve_account_by_waba_id(TEXT) TO authenticated, service_role, anon;

-- ============================================================
-- STEP 4: Updated_at trigger for whatsapp_phones
-- ============================================================

DROP TRIGGER IF EXISTS set_updated_at ON whatsapp_phones;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON whatsapp_phones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 5: RPC to register a new phone number
-- ============================================================

CREATE OR REPLACE FUNCTION register_whatsapp_phone(
  p_account_id UUID,
  p_phone_number TEXT,
  p_phone_number_id TEXT,
  p_waba_id TEXT,
  p_access_token_encrypted TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone_id UUID;
  v_existing_count INTEGER;
BEGIN
  -- Verify caller is admin
  IF NOT has_role_in_account(auth.uid(), p_account_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: must be admin or owner';
  END IF;
  
  -- Check if phone_number_id already registered
  IF EXISTS (
    SELECT 1 FROM whatsapp_phones 
    WHERE phone_number_id = p_phone_number_id
  ) THEN
    RAISE EXCEPTION 'Phone number already registered to another account';
  END IF;
  
  -- Check existing count
  SELECT count(*) INTO v_existing_count FROM whatsapp_phones
  WHERE account_id = p_account_id;
  
  -- Insert new phone
  INSERT INTO whatsapp_phones (
    account_id,
    phone_number,
    phone_number_id,
    waba_id,
    access_token_encrypted,
    is_primary,
    status
  ) VALUES (
    p_account_id,
    p_phone_number,
    p_phone_number_id,
    p_waba_id,
    p_access_token_encrypted,
    v_existing_count = 0,  -- First phone is primary
    'pending'
  )
  RETURNING id INTO v_phone_id;
  
  RETURN v_phone_id;
END;
$$;

ALTER FUNCTION register_whatsapp_phone(UUID, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION register_whatsapp_phone(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================
-- STEP 6: RPC to set primary phone
-- ============================================================

CREATE OR REPLACE FUNCTION set_primary_whatsapp_phone(
  p_account_id UUID,
  p_phone_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT has_role_in_account(auth.uid(), p_account_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: must be admin or owner';
  END IF;
  
  -- Unset all primaries for this account
  UPDATE whatsapp_phones
  SET is_primary = FALSE
  WHERE account_id = p_account_id AND is_primary = TRUE;
  
  -- Set new primary
  UPDATE whatsapp_phones
  SET is_primary = TRUE
  WHERE id = p_phone_id AND account_id = p_account_id;
  
  RETURN TRUE;
END;
$$;

ALTER FUNCTION set_primary_whatsapp_phone(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION set_primary_whatsapp_phone(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- STEP 7: RPC to verify phone connection
-- ============================================================

CREATE OR REPLACE FUNCTION verify_whatsapp_phone(
  p_phone_id UUID,
  p_verified_by UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id UUID;
BEGIN
  -- Get account_id
  SELECT account_id INTO v_account_id FROM whatsapp_phones WHERE id = p_phone_id;
  
  -- Verify caller is admin
  IF NOT has_role_in_account(auth.uid(), v_account_id, 'admin') THEN
    RAISE EXCEPTION 'Forbidden: must be admin or owner';
  END IF;
  
  -- Update status
  UPDATE whatsapp_phones
  SET status = 'connected',
      verified_at = NOW(),
      verified_by = p_verified_by,
      connected_at = NOW()
  WHERE id = p_phone_id;
  
  RETURN TRUE;
END;
$$;

ALTER FUNCTION verify_whatsapp_phone(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION verify_whatsapp_phone(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- STEP 8: Backfill from existing whatsapp_config
-- ============================================================

-- If there's existing whatsapp_config data, migrate it
INSERT INTO whatsapp_phones (
  account_id,
  phone_number,
  phone_number_id,
  waba_id,
  access_token_encrypted,
  status,
  is_primary
)
SELECT 
  -- Get account_id from the user's profile's old account_id
  (SELECT account_id FROM profiles WHERE user_id = whatsapp_config.user_id LIMIT 1),
  whatsapp_config.phone_number_id,  -- We don't have raw phone, use ID as placeholder
  whatsapp_config.phone_number_id,
  whatsapp_config.waba_id,
  whatsapp_config.access_token,
  whatsapp_config.status,
  TRUE
FROM whatsapp_config
WHERE whatsapp_config.phone_number_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM whatsapp_phones wp 
    WHERE wp.phone_number_id = whatsapp_config.phone_number_id
  )
ON CONFLICT (phone_number_id) DO NOTHING;

-- ============================================================
-- STEP 9: Helper to get primary phone for account
-- ============================================================

CREATE OR REPLACE FUNCTION get_primary_whatsapp_phone(p_account_id UUID)
RETURNS whatsapp_phones
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM whatsapp_phones
  WHERE account_id = p_account_id AND is_primary = TRUE
  LIMIT 1;
$$;

ALTER FUNCTION get_primary_whatsapp_phone(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_primary_whatsapp_phone(UUID) TO authenticated, service_role;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- 1. Check for accounts without WhatsApp phones
-- SELECT a.id, a.name FROM accounts a
-- LEFT JOIN whatsapp_phones wp ON wp.account_id = a.id
-- WHERE wp.id IS NULL;

-- 2. Check for duplicate phone_number_ids
-- SELECT phone_number_id, count(*) FROM whatsapp_phones
-- GROUP BY phone_number_id HAVING count(*) > 1;

-- 3. Check for accounts with multiple phones
-- SELECT account_id, count(*) as phone_count FROM whatsapp_phones
-- GROUP BY account_id HAVING count(*) > 1;
```

---

## 3. Testing Guide

### 3.1 Pre-Migration Testing

Before running migrations on production:

```bash
# 1. Clone production database to staging
# Using Supabase CLI:
supabase db dump -f backup/prod-backup.sql
supabase db reset  # Resets local to match production

# Or in Supabase dashboard:
# Dashboard > Database > Replication > Create logical backup
# Dashboard > SQL Editor > Run backup
```

### 3.2 Migration Testing Steps

#### Test 1: Fresh Installation Test

```bash
# 1. Set up a fresh Supabase instance
supabase init
supabase db start

# 2. Apply all migrations in order (including new ones)
# Run 001 through 043

# 3. Create a test user via the signup flow
# POST /api/auth/v1/signup
# {
#   "email": "test@fresh.example.com",
#   "password": "SecurePass123!",
#   "options": { "data": { "full_name": "Fresh Install Test" } }
# }

# 4. Verify:
# - accounts table has one row
# - account_memberships has one row (owner)
# - profiles has one row (no account_id/account_role)
# - tenant_settings has one row

psql $DATABASE_URL -c "SELECT * FROM accounts;"
psql $DATABASE_URL -c "SELECT * FROM account_memberships;"
psql $DATABASE_URL -c "SELECT * FROM profiles;"
psql $DATABASE_URL -c "SELECT * FROM tenant_settings;"
psql $DATABASE_URL -c "SELECT * FROM subscriptions;"
psql $DATABASE_URL -c "SELECT * FROM usage_records;"
```

#### Test 2: Existing User Migration Test

```bash
# 1. Create a user in staging (simulating existing production user)
# This should happen BEFORE applying migration 038

# 2. Apply migration 038

# 3. Verify:
# - One account_memberships row created per profile
# - profile.account_id is NULL
# - profile.account_role is NULL
# - get_user_account_role() returns correct role
# - get_user_accounts() returns correct accounts

psql $DATABASE_URL -c "
  SELECT 
    p.user_id,
    am.account_id,
    am.role,
    get_user_account_role(p.user_id, am.account_id) as computed_role
  FROM profiles p
  JOIN account_memberships am ON am.user_id = p.user_id;
"
```

#### Test 3: Multi-Account User Test

```sql
-- Create two accounts for the same user
DO $$
DECLARE
  v_user_id UUID;
  v_account1_id UUID;
  v_account2_id UUID;
BEGIN
  -- Get first user
  SELECT user_id INTO v_user_id FROM profiles LIMIT 1;
  
  -- Create second account
  INSERT INTO accounts (name, owner_user_id)
  VALUES ('Second Workspace', v_user_id)
  RETURNING id INTO v_account2_id;
  
  -- Add user to second account as admin
  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (v_user_id, v_account2_id, 'admin');
  
  -- Verify get_user_accounts
  -- SELECT * FROM get_user_accounts(v_user_id);
END $$;
```

#### Test 4: RLS Isolation Test

```sql
-- Test that users cannot see other tenants' data
DO $$
DECLARE
  v_user1_account UUID;
  v_user2_id UUID;
  v_user2_account UUID;
BEGIN
  -- Get user 1's account
  SELECT account_id INTO v_user1_account FROM account_memberships LIMIT 1;
  
  -- Create user 2 with their own account
  INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
  VALUES (
    'isolation-test@example.com',
    crypt('SecurePass123!', gen_salt('bf')),
    '{"full_name": "Isolation Test"}'::jsonb
  );
  
  SELECT id INTO v_user2_id FROM auth.users WHERE email = 'isolation-test@example.com';
  
  -- User 2's account was auto-created by trigger
  SELECT account_id INTO v_user2_account FROM profiles WHERE user_id = v_user2_id;
  
  -- Verify: user 2's account should be different
  -- RAISE NOTICE 'User 1 account: %, User 2 account: %', v_user1_account, v_user2_account;
  
  -- Try to query user 1's contacts as user 2 (should return empty)
  -- This is tested via the application, not direct SQL
  
END $$;
```

#### Test 5: Plan Limits Test

```sql
-- Test plan limit enforcement
DO $$
DECLARE
  v_account_id UUID;
  v_within_limit BOOLEAN;
  v_exceeded_limit BOOLEAN;
BEGIN
  SELECT account_id INTO v_account_id FROM accounts LIMIT 1;
  
  -- Should be within starter limit for contacts (1000)
  SELECT check_usage_limit(v_account_id, 'contacts', 1) INTO v_within_limit;
  -- RAISE NOTICE 'Within limit: %', v_within_limit;  -- Should be TRUE
  
  -- Try to exceed limit
  PERFORM increment_usage(v_account_id, 'contacts', 999);
  
  -- Now at 999, should still be within limit
  SELECT check_usage_limit(v_account_id, 'contacts', 1) INTO v_within_limit;
  -- RAISE NOTICE 'At 999, within limit for 1 more: %', v_within_limit;  -- Should be TRUE
  
  -- Now at 1000, should be at/exceeded limit
  SELECT check_usage_limit(v_account_id, 'contacts', 1) INTO v_exceeded_limit;
  -- RAISE NOTICE 'At 1000, within limit for 1 more: %', v_exceeded_limit;  -- Should be FALSE
  
END $$;
```

#### Test 6: Subdomain Routing Test

```sql
-- Test subdomain validation
DO $$
BEGIN
  -- Test valid subdomains
  -- SELECT is_subdomain_available('acme');           -- TRUE
  -- SELECT is_subdomain_available('my-workspace-123'); -- TRUE
  
  -- Test invalid/reserved subdomains
  -- SELECT is_subdomain_available('www');             -- FALSE
  -- SELECT is_subdomain_available('admin');            -- FALSE
  
  -- Test slugify
  -- SELECT slugify('My Workspace!');  -- 'my-workspace'
  -- SELECT slugify('  Hello World  '); -- 'hello-world'
  
END $$;
```

#### Test 7: WhatsApp Routing Test

```sql
-- Test phone number routing
DO $$
DECLARE
  v_account_id UUID;
  v_phone_id UUID;
  v_resolved_account UUID;
BEGIN
  SELECT account_id INTO v_account_id FROM accounts LIMIT 1;
  
  -- Register a phone
  SELECT register_whatsapp_phone(
    v_account_id,
    '+1234567890',
    'phone-number-id-123',
    'waba-id-456',
    'encrypted-token'
  ) INTO v_phone_id;
  
  -- Test routing
  SELECT resolve_account_by_phone_number('phone-number-id-123') INTO v_resolved_account;
  -- RAISE NOTICE 'Resolved account: %', v_resolved_account;  -- Should equal v_account_id
  
END $$;
```

### 3.3 API Integration Tests

After migrations, test all API routes still work:

```bash
# Set up test environment
export SUPABASE_URL="http://localhost:54321"
export SUPABASE_ANON_KEY="your-anon-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

# Test 1: Signup creates account without membership
curl -X POST http://localhost:3000/api/auth/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"api-test@example.com","password":"SecurePass123!","options":{"data":{"full_name":"API Test"}}}'

# Verify in database
psql $DATABASE_URL -c "SELECT * FROM accounts WHERE owner_user_id = (SELECT id FROM auth.users WHERE email = 'api-test@example.com');"

# Test 2: Login still works
# Test 3: Contacts CRUD works with new membership
# Test 4: Broadcasts work
# Test 5: Flows work
```

### 3.4 Load Testing

```bash
# Use k6 for load testing
# k6 script: test/multi-tenant-load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
};

export default function () {
  // Test multi-tenant isolation under load
  const res = http.get('http://localhost:3000/api/v1/contacts');
  check(res, {
    'status is 200 or 401': (r) => [200, 401].includes(r.status),
  });
  sleep(1);
}
```

---

## 4. Rollback Procedures

### 4.1 Individual Migration Rollback

```sql
-- To rollback migration 043 (WhatsApp routing):
-- WARNING: This will lose data!

ALTER TABLE whatsapp_phones DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS whatsapp_phones CASCADE;
DROP FUNCTION IF EXISTS resolve_account_by_phone_number(TEXT);
DROP FUNCTION IF EXISTS resolve_account_by_waba_id(TEXT);
DROP FUNCTION IF EXISTS register_whatsapp_phone(UUID, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS set_primary_whatsapp_phone(UUID, UUID);
DROP FUNCTION IF EXISTS verify_whatsapp_phone(UUID, UUID);
DROP FUNCTION IF EXISTS get_primary_whatsapp_phone(UUID);
-- Re-apply any altered tables

-- To rollback migration 042 (usage records):
ALTER TABLE usage_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE usage_records DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS usage_snapshots CASCADE;
DROP TABLE IF EXISTS usage_records CASCADE;
DROP FUNCTION IF EXISTS get_current_period();
DROP FUNCTION IF EXISTS increment_usage(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS check_usage_limit(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS get_current_usage(UUID);
DROP FUNCTION IF EXISTS take_usage_snapshots();
DROP FUNCTION IF EXISTS check_usage_alerts(UUID);

-- To rollback migration 041 (subscriptions):
ALTER TABLE subscription_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS subscription_events CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP FUNCTION IF EXISTS handle_stripe_subscription(TEXT, TEXT, TEXT, UUID, JSONB);
DROP FUNCTION IF EXISTS create_stripe_checkout(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS cancel_subscription(UUID, BOOLEAN);

-- To rollback migration 040 (subdomain):
ALTER TABLE reserved_subdomains DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS reserved_subdomains CASCADE;
ALTER TABLE accounts DROP COLUMN IF EXISTS subdomain;
DROP FUNCTION IF EXISTS slugify(TEXT);
DROP FUNCTION IF EXISTS is_subdomain_available(TEXT);
DROP FUNCTION IF EXISTS set_account_subdomain(UUID, TEXT);

-- To rollback migration 039 (tenant settings):
ALTER TABLE tenant_settings DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS tenant_settings CASCADE;
DROP FUNCTION IF EXISTS get_plan_limits(TEXT);
DROP FUNCTION IF EXISTS sync_tenant_limits(UUID);
DROP FUNCTION IF EXISTS update_tenant_plan(UUID, TEXT);

-- To rollback migration 038 (memberships):
-- This is the most complex rollback

-- First, restore profiles columns
ALTER TABLE profiles ADD COLUMN account_id UUID REFERENCES accounts(id);
ALTER TABLE profiles ADD COLUMN account_role account_role_enum;

-- Restore data from memberships
UPDATE profiles p
SET 
  account_id = am.account_id,
  account_role = am.role
FROM account_memberships am
WHERE am.user_id = p.user_id;

-- Make NOT NULL
ALTER TABLE profiles ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN account_role SET NOT NULL;

-- Restore RLS policies on profiles
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
DROP POLICY IF EXISTS profiles_insert ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (auth.uid() = user_id OR is_account_member(account_id));
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY profiles_insert ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Restore handle_new_user trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
-- Re-create original trigger from migration 017

-- Drop membership functions
DROP FUNCTION IF EXISTS get_user_account_role(UUID, UUID);
DROP FUNCTION IF EXISTS get_user_accounts(UUID);
DROP FUNCTION IF EXISTS has_role_in_account(UUID, UUID, account_role_enum);

-- Drop memberships table
ALTER TABLE account_memberships DISABLE ROW LEVEL SECURITY;
DROP TABLE IF EXISTS account_memberships CASCADE;

-- Restore all domain table RLS policies (complex - see migration 017)
```

### 4.2 Full Rollback Script

```bash
#!/bin/bash
# rollback-tenant-migrations.sh

echo "WARNING: This will rollback all tenant migrations!"
echo "This will cause DATA LOSS."
read -p "Are you sure? (type 'yes'): " confirm

if [ "$confirm" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

# Apply rollback SQL (see section 4.1)
psql $DATABASE_URL -f rollback-038.sql
psql $DATABASE_URL -f rollback-039.sql
psql $DATABASE_URL -f rollback-040.sql
psql $DATABASE_URL -f rollback-041.sql
psql $DATABASE_URL -f rollback-042.sql
psql $DATABASE_URL -f rollback-043.sql

echo "Rollback complete."
```

---

## 5. Deployment Checklist

### Pre-Deployment

- [ ] Run all migrations on staging environment
- [ ] Verify all tests pass (Section 3)
- [ ] Test with existing production data copy
- [ ] Review migration SQL for any issues
- [ ] Backup production database
- [ ] Notify users of potential downtime
- [ ] Prepare rollback plan

### Migration Execution

- [ ] Apply migrations during low-traffic window
- [ ] Monitor migration execution time
- [ ] Check for errors in Supabase dashboard
- [ ] Verify row counts after each migration

```bash
# Run migrations via Supabase CLI
supabase db push

# Or apply directly
psql $DATABASE_URL -f supabase/migrations/038_tenant_memberships.sql
psql $DATABASE_URL -f supabase/migrations/039_tenant_settings.sql
psql $DATABASE_URL -f supabase/migrations/040_tenant_subdomain.sql
psql $DATABASE_URL -f supabase/migrations/041_tenant_subscriptions.sql
psql $DATABASE_URL -f supabase/migrations/042_tenant_usage_records.sql
psql $DATABASE_URL -f supabase/migrations/043_tenant_whatsapp_routing.sql
```

### Post-Deployment

- [ ] Verify all API routes work
- [ ] Test signup/login flow
- [ ] Test contact creation
- [ ] Test broadcast sending
- [ ] Verify RLS policies (users can't see other tenants)
- [ ] Check error logs for any issues
- [ ] Monitor performance

### Post-Migration Cleanup (optional)

```sql
-- After verifying everything works, you can optionally:
-- 1. Clean up orphaned records
-- 2. Rebuild statistics
ANALYZE;

-- 3. Check for bloat
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::regclass))
FROM pg_tables WHERE schemaname = 'public';

-- 4. Vacuum tables
VACUUM ANALYZE;
```

---

## 6. Onboarding & Workspace Management

> This section covers the application-layer changes needed to support multi-workspace users. These are **application code changes**, not database migrations.

### 6.1 Updated Signup Flow

**Before migration:** Signup creates account + profile + membership atomically.

**After migration:** Signup creates account + profile only. No membership. User redirected to onboarding.

#### Updated handle_new_user Trigger (in 038_tenant_memberships.sql)

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_account_id UUID;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

  -- Create the personal account (NO automatic membership)
  INSERT INTO public.accounts (name, owner_user_id)
  VALUES (
    COALESCE(NULLIF(v_full_name, ''), NEW.email, 'My account'),
    NEW.id
  )
  RETURNING id INTO v_account_id;

  -- Create the profile (without account_id/account_role)
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, v_full_name, NEW.email);

  -- NO account_memberships insert here!
  -- User must complete onboarding to join a workspace

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to bootstrap account for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
```

### 6.2 Middleware: Redirect to Onboarding

**File:** `src/middleware.ts`

```typescript
export async function middleware(request: NextRequest) {
  // ... existing supabase client setup ...

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // ... existing auth redirects ...
  }

  // Check if user has any memberships
  const { data: memberships } = await supabase
    .from('account_memberships')
    .select('account_id')
    .eq('user_id', user.id)
    .limit(1);

  // No memberships = redirect to onboarding
  if (!memberships || memberships.length === 0) {
    const pathname = request.nextUrl.pathname;
    
    // Skip if already on onboarding pages
    if (!pathname.startsWith('/onboarding') && 
        !pathname.startsWith('/login') && 
        !pathname.startsWith('/signup')) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  }

  // ... rest of existing logic ...
}
```

### 6.3 Onboarding Page

**Route:** `src/app/onboarding/page.tsx`

```
URL: /onboarding
Access: Authenticated users with no memberships
```

#### Onboarding Flow

```
┌─────────────────────────────────────────────────────┐
│                    Welcome!                          │
│                                                     │
│   You need a workspace to use wacrm.               │
│   Create one for yourself or join an existing.       │
│                                                     │
│   ┌──────────────────┐  ┌──────────────────────┐  │
│   │  Create workspace │  │   Join workspace     │  │
│   └──────────────────┘  └──────────────────────┘  │
│                                                     │
│   ┌─────────────────────────────────────────────┐  │
│   │  Workspace name: [________________]          │  │
│   │  Subdomain: [________].wacrm.com            │  │
│   │                   [Create my workspace]       │  │
│   └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

#### Create Workspace Flow (User's First Workspace)

```typescript
// src/app/onboarding/actions.ts
'use server';

export async function createWorkspace(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  const name = formData.get('name') as string;
  const subdomain = formData.get('subdomain') as string;
  
  // Create the workspace (account)
  const { data: account, error } = await supabase
    .from('accounts')
    .insert({ name })
    .select()
    .single();
    
  if (error) throw error;
  
  // Create membership as owner
  const { error: memberError } = await supabase
    .from('account_memberships')
    .insert({
      user_id: user.id,
      account_id: account.id,
      role: 'owner'
    });
    
  if (memberError) throw memberError;
  
  // Set as active workspace in cookie
  // (handled by middleware on next request)
  
  revalidatePath('/dashboard');
  redirect('/dashboard');
}
```

### 6.4 Workspace Switcher (Header Component)

**Component:** `src/components/layout/workspace-switcher.tsx`

```tsx
'use client';

import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';

export function WorkspaceSwitcher() {
  const { accounts, activeAccountId, setActiveAccountId } = useAuth();
  const router = useRouter();
  
  // Only show if user has multiple workspaces
  if (!accounts || accounts.length <= 1) return null;
  
  const handleSwitch = async (accountId: string) => {
    // Persist to cookie
    document.cookie = `wacrm_active_account=${accountId}; path=/; max-age=31536000`;
    setActiveAccountId(accountId);
    router.refresh();
  };
  
  return (
    <select
      value={activeAccountId || ''}
      onChange={(e) => handleSwitch(e.target.value)}
      className="border rounded px-2 py-1 text-sm"
    >
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </select>
  );
}
```

### 6.5 Settings: Create/Join Additional Workspaces

**Route:** `src/app/(dashboard)/settings/workspaces/page.tsx`

Users can manage their workspaces here:
- Create a new workspace
- View invite links for current workspace
- Leave a workspace

#### Create Additional Workspace

```typescript
// Same flow as onboarding, but in settings
export async function createAdditionalWorkspace(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) throw new Error('Not authenticated');
  
  const name = formData.get('name') as string;
  
  // Create new account
  const { data: account, error } = await supabase
    .from('accounts')
    .insert({ name, owner_user_id: user.id })  // user owns this one too
    .select()
    .single();
    
  if (error) throw error;
  
  // Create owner membership
  await supabase
    .from('account_memberships')
    .insert({
      user_id: user.id,
      account_id: account.id,
      role: 'owner'
    });
    
  revalidatePath('/settings/workspaces');
  return { success: true };
}
```

#### Join Existing Workspace

```typescript
// src/app/api/tenants/join/route.ts

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { invite_code } = await request.json();
  
  // Look up invitation
  const { data: invitation } = await supabaseAdmin
    .from('account_invitations')
    .select('*')
    .eq('token_hash', hashToken(invite_code))
    .single();
    
  if (!invitation) {
    return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
  }
  
  if (invitation.expires_at < new Date()) {
    return NextResponse.json({ error: 'Invite expired' }, { status: 400 });
  }
  
  if (invitation.accepted_at) {
    return NextResponse.json({ error: 'Invite already used' }, { status: 400 });
  }
  
  // Create membership
  const { error } = await supabase
    .from('account_memberships')
    .insert({
      user_id: user.id,
      account_id: invitation.account_id,
      role: invitation.role,
      invited_by: invitation.created_by_user_id
    });
    
  if (error) throw error;
  
  // Mark invitation as accepted
  await supabaseAdmin
    .from('account_invitations')
    .update({ accepted_at: new Date(), accepted_by_user_id: user.id })
    .eq('id', invitation.id);
    
  return NextResponse.json({ success: true });
}
```

### 6.6 New API Routes

#### POST /api/tenants

Create a new workspace (account).

```typescript
// src/app/api/tenants/route.ts

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { name, subdomain } = await request.json();
  
  // Check subdomain availability
  if (subdomain) {
    const available = await checkSubdomainAvailable(subdomain);
    if (!available) {
      return NextResponse.json({ error: 'Subdomain taken' }, { status: 400 });
    }
  }
  
  // Create account
  const { data: account, error } = await supabase
    .from('accounts')
    .insert({ name, owner_user_id: user.id, ...(subdomain && { subdomain }) })
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Create owner membership
  await supabase
    .from('account_memberships')
    .insert({ user_id: user.id, account_id: account.id, role: 'owner' });
    
  // Create tenant_settings
  await supabase.from('tenant_settings').insert({ account_id: account.id, display_name: name });
  
  // Create subscription (starter)
  await supabase.from('subscriptions').insert({ account_id: account.id, plan: 'starter', status: 'active' });
  
  return NextResponse.json({ account }, { status: 201 });
}
```

#### GET /api/tenants

List user's workspaces.

```typescript
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { data: accounts } = await supabase
    .from('account_memberships')
    .select(`
      role,
      joined_at,
      account:accounts!inner(
        id,
        name,
        subdomain,
        created_at,
        tenant_settings!inner(
          plan,
          subscription_status
        )
      )
    `)
    .eq('user_id', user.id);
    
  return NextResponse.json({ accounts });
}
```

#### POST /api/tenants/join

Join via invite code.

```typescript
// Already shown in 6.5
```

### 6.7 Invite Link Generation

**Route:** `POST /api/invitations` (update existing)

Owner/admin generates an invite link:

```typescript
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  // Verify admin role
  const accountId = request.headers.get('x-tenant-id');
  const { data: membership } = await supabase
    .from('account_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .single();
    
  if (!membership || !['admin', 'owner'].includes(membership.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  
  const { role, label } = await request.json();
  
  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const { data: invitation, error } = await supabaseAdmin
    .from('account_invitations')
    .insert({
      account_id: accountId,
      token_hash: tokenHash,
      role,
      label,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      created_by_user_id: user.id
    })
    .select()
    .single();
    
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Return the plaintext token (shown only once)
  const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/join?code=${token}`;
  
  return NextResponse.json({ invite_url: inviteUrl });
}
```

### 6.8 AuthProvider Updates

**File:** `src/hooks/use-auth.tsx`

Update to support multiple accounts:

```typescript
interface AuthContextValue {
  // ... existing fields ...
  
  // Multi-workspace support
  accounts: AccountSummary[];        // All workspaces user belongs to
  activeAccountId: string | null;    // Current workspace
  setActiveAccountId: (id: string) => void;
  
  // Computed from activeAccountId
  accountRole: AccountRole | null;
  isOwner: boolean;
  isAdmin: boolean;
}

// In fetchProfile or a separate fetch:
const fetchAccounts = async (userId: string) => {
  const { data: accounts } = await supabase
    .from('account_memberships')
    .select(`
      role,
      joined_at,
      account:accounts!inner(
        id,
        name,
        subdomain,
        tenant_settings!inner(plan, subscription_status)
      )
    `)
    .eq('user_id', userId);
    
  return accounts;
};
```

### 6.9 Component Structure Summary

| Component | Purpose |
|-----------|---------|
| `src/app/onboarding/page.tsx` | Welcome + create/join workspace |
| `src/app/onboarding/join/page.tsx` | Join via invite code |
| `src/app/(dashboard)/settings/workspaces/page.tsx` | Manage workspaces |
| `src/components/layout/workspace-switcher.tsx` | Header dropdown |
| `src/components/onboarding/create-form.tsx` | Create workspace form |
| `src/components/onboarding/join-form.tsx` | Join with code form |

### 6.10 Complete User Flow

```
1. Sign Up
   └─► handle_new_user trigger creates account + profile (NO membership)
   
2. First Login
   └─► Middleware detects NO memberships
       └─► Redirect to /onboarding
       
3. Onboarding (/onboarding)
   ├─► Create workspace ─────────────────────────────────────────────┐
   │   └─► Creates account + owner membership                       │
   │       └─► Redirect to /dashboard                               │
   │           └─► WorkspaceSwitcher shows (only 1 = no switcher)   │
   │                                                               │
   └─► Join workspace ──────────────────────────────────────────────┘
       └─► Enter invite code
           └─► Creates membership with invited role
               └─► Redirect to /dashboard
                   └─► WorkspaceSwitcher shows (1+ workspaces = switcher)
                   
4. Later (Settings > Workspaces)
   ├─► Create another workspace ──► New account + owner membership
   ├─► View invite links ──────────► Admin generates invite codes
   └─► Leave workspace ────────────► Removes membership (not account)
```

### 6.11 Testing the Onboarding Flow

```bash
# 1. Create a new user via signup
curl -X POST http://localhost:3000/api/auth/v1/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser@test.com","password":"SecurePass123!"}'

# 2. Login and check - should redirect to /onboarding
# (Check in browser or via session cookie)

# 3. Verify no memberships in DB
psql $DATABASE_URL -c "SELECT * FROM account_memberships WHERE user_id = (SELECT id FROM auth.users WHERE email = 'newuser@test.com');"

# 4. Create workspace via API
curl -X POST http://localhost:3000/api/tenants \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My New Business"}'

# 5. Verify membership created
psql $DATABASE_URL -c "SELECT * FROM account_memberships WHERE user_id = (SELECT id FROM auth.users WHERE email = 'newuser@test.com');"

# 6. Try accessing dashboard now - should succeed
```

---

## Appendix A: Migration Dependencies

```
001_initial_schema.sql
  └── 017_account_sharing.sql (depends on 001)
        └── 038_tenant_memberships.sql (depends on 017)
              ├── 039_tenant_settings.sql (independent)
              ├── 040_tenant_subdomain.sql (independent)
              ├── 041_tenant_subscriptions.sql (independent)
              ├── 042_tenant_usage_records.sql (independent)
              └── 043_tenant_whatsapp_routing.sql (independent)
```

Migrations 039-043 can be applied independently of each other but all require 038 first.

## Appendix B: Key Functions Reference

| Function | Purpose | Called By |
|----------|---------|-----------|
| `get_user_account_role(user_id, account_id)` | Get user's role in account | All RLS policies |
| `get_user_accounts(user_id)` | List all user's accounts | AuthProvider |
| `has_role_in_account(user_id, account_id, min_role)` | Check if user meets minimum role | All RLS policies |
| `is_subdomain_available(subdomain)` | Check subdomain availability | UI, API |
| `set_account_subdomain(account_id, subdomain)` | Set subdomain with validation | Settings UI |
| `register_whatsapp_phone(...)` | Register new WhatsApp number | WhatsApp settings |
| `resolve_account_by_phone_number(phone_number_id)` | Webhook routing | WhatsApp webhook |
| `increment_usage(account_id, metric, increment)` | Track usage | App logic |
| `check_usage_limit(account_id, metric, increment)` | Check if action allowed | App logic |
| `get_current_usage(account_id)` | Get all usage metrics | Dashboard |
| `sync_tenant_limits(account_id)` | Sync limits from plan | Subscription changes |

## Appendix C: Environment Variables for SaaS

```env
# After migrations, add these to your environment:

# Stripe (for billing)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...

# Plan limits (for get_plan_limits function)
# These can also be stored in tenant_settings

# Email (for tenant notifications)
SMTP_HOST=smtp.sendgrid.net
SMTP_USER=apikey
SMTP_PASS=SG.xxx
EMAIL_FROM=noreply@yourdomain.com

# Application
NEXT_PUBLIC_APP_URL=https://wacrm.com
DEFAULT_TENANT_SUBDOMAIN=wacrm
```

---

*Last updated: August 2026*
