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

-- 1. Wipe child tables first (to avoid FK violations)
--    Order matters: delete from most-dependent → least-dependent.

-- Conversations & messages (depend on accounts + contacts)
TRUNCATE TABLE messages CASCADE;
TRUNCATE TABLE conversation_participants CASCADE;
TRUNCATE TABLE conversations CASCADE;

-- Contacts
TRUNCATE TABLE contacts CASCADE;

-- Offerings & media
TRUNCATE TABLE offering_embeddings CASCADE;
TRUNCATE TABLE offering_media CASCADE;
TRUNCATE TABLE catalogue_availability CASCADE;
TRUNCATE TABLE catalogue_sources CASCADE;
TRUNCATE TABLE order_items CASCADE;
TRUNCATE TABLE orders CASCADE;
TRUNCATE TABLE bookings CASCADE;
TRUNCATE TABLE offerings CASCADE;
TRUNCATE TABLE offering_categories CASCADE;

-- Capability config
TRUNCATE TABLE account_capabilities CASCADE;
TRUNCATE TABLE flow_template_installs CASCADE;

-- Automations & flows
TRUNCATE TABLE flow_runs CASCADE;
TRUNCATE TABLE flows CASCADE;
TRUNCATE TABLE automations CASCADE;

-- Broadcasts
TRUNCATE TABLE broadcasts CASCADE;

-- Knowledge
TRUNCATE TABLE knowledge_base CASCADE;

-- Audit
TRUNCATE TABLE audit_log CASCADE;

-- Pipelines & deals
TRUNCATE TABLE deal_activity CASCADE;
TRUNCATE TABLE deals CASCADE;
TRUNCATE TABLE deal_stages CASCADE;
TRUNCATE TABLE pipelines CASCADE;

-- Departments, skills, schedules
TRUNCATE TABLE agent_skills CASCADE;
TRUNCATE TABLE departments CASCADE;

-- Invitations
TRUNCATE TABLE account_invitations CASCADE;

-- Presence
TRUNCATE TABLE member_presence CASCADE;

-- Seat purchases
TRUNCATE TABLE seat_purchases CASCADE;

-- Subscriptions
TRUNCATE TABLE subscriptions CASCADE;

-- Tenant settings
TRUNCATE TABLE tenant_settings CASCADE;

-- Team memberships (depends on accounts + auth.users)
TRUNCATE TABLE account_memberships CASCADE;

-- Profiles (depends on auth.users)
TRUNCATE TABLE profiles CASCADE;

-- 2. Wipe parent tables
TRUNCATE TABLE accounts CASCADE;

-- 3. Delete all auth users (this is the nuclear option)
--    auth.users → auth.identities → auth.sessions all cascade.
TRUNCATE TABLE auth.users CASCADE;

-- 4. Verify — these should all return 0
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
