-- ============================================================
-- NUKE SINGLE ACCOUNT DATA
--
-- Run this in the Supabase SQL Editor to delete all data for
-- ONE specific account. Replace '<ACCOUNT_ID>' with the UUID.
--
-- After running, re-seed via /seed-data.
-- ============================================================

-- === SET YOUR ACCOUNT ID HERE ===
DO $$
DECLARE
  target_account UUID := '<ACCOUNT_ID>';  -- ← paste your account UUID here
BEGIN

  -- Conversations & messages
  DELETE FROM messages WHERE conversation_id IN (
    SELECT id FROM conversations WHERE account_id = target_account
  );
  DELETE FROM conversation_participants WHERE conversation_id IN (
    SELECT id FROM conversations WHERE account_id = target_account
  );
  DELETE FROM conversations WHERE account_id = target_account;

  -- Contacts
  DELETE FROM contacts WHERE account_id = target_account;

  -- Offerings & media
  DELETE FROM offering_embeddings WHERE account_id = target_account;
  DELETE FROM offering_media WHERE account_id = target_account;
  DELETE FROM catalogue_availability WHERE account_id = target_account;
  DELETE FROM catalogue_sources WHERE account_id = target_account;
  DELETE FROM order_items WHERE order_id IN (
    SELECT id FROM orders WHERE account_id = target_account
  );
  DELETE FROM orders WHERE account_id = target_account;
  DELETE FROM bookings WHERE account_id = target_account;
  DELETE FROM offerings WHERE account_id = target_account;
  DELETE FROM offering_categories WHERE account_id = target_account;

  -- Capabilities & flow templates
  DELETE FROM account_capabilities WHERE account_id = target_account;
  DELETE FROM flow_template_installs WHERE account_id = target_account;

  -- Automations & flows
  DELETE FROM flow_runs WHERE account_id = target_account;
  DELETE FROM flows WHERE account_id = target_account;
  DELETE FROM automations WHERE account_id = target_account;

  -- Broadcasts
  DELETE FROM broadcasts WHERE account_id = target_account;

  -- Knowledge
  DELETE FROM knowledge_base WHERE account_id = target_account;

  -- Audit
  DELETE FROM audit_log WHERE account_id = target_account;

  -- Pipelines & deals
  DELETE FROM deal_activity WHERE account_id = target_account;
  DELETE FROM deals WHERE account_id = target_account;
  DELETE FROM deal_stages WHERE account_id = target_account;
  DELETE FROM pipelines WHERE account_id = target_account;

  -- Skills
  DELETE FROM agent_skills WHERE account_id = target_account;

  -- Invitations
  DELETE FROM account_invitations WHERE account_id = target_account;

  -- Presence
  DELETE FROM member_presence WHERE account_id = target_account;

  -- Seat purchases
  DELETE FROM seat_purchases WHERE account_id = target_account;

  -- Subscriptions
  DELETE FROM subscriptions WHERE account_id = target_account;

  -- Tenant settings
  DELETE FROM tenant_settings WHERE account_id = target_account;

  -- Memberships
  DELETE FROM account_memberships WHERE account_id = target_account;

  -- The account itself
  DELETE FROM accounts WHERE id = target_account;

  RAISE NOTICE 'Account % and all related data deleted.', target_account;

END $$;

-- Verify
SELECT 'done — run /seed-data to repopulate' AS status;
