-- ============================================================
-- 059_follow_up_cron.sql
--
-- Cron job to send follow-up messages to customers waiting for reply.
-- Runs every 5 minutes, finds conversations where:
--   - Last message is from customer (waiting for reply)
--   - No reply sent within configured timeout
--   - Conversation is open/pending
--   - No follow-up already sent recently
-- ============================================================

-- Track follow-up messages to avoid duplicates
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ;

-- Configurable follow-up timeout (default 10 minutes)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS follow_up_timeout_minutes INT NOT NULL DEFAULT 10;

-- Whether follow-ups are enabled (default true)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS follow_up_enabled BOOLEAN NOT NULL DEFAULT true;

-- ============================================================
-- FUNCTION: Send follow-up messages to waiting customers
-- ============================================================
CREATE OR REPLACE FUNCTION send_follow_up_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv RECORD;
  v_timeout INTERVAL;
  v_message TEXT;
  v_accounts UUID[];
  v_account_id UUID;
BEGIN
  -- Get all accounts with follow-ups enabled
  SELECT array_agg(account_id) INTO v_accounts
  FROM tenant_settings
  WHERE follow_up_enabled = true;

  IF v_accounts IS NULL OR array_length(v_accounts, 1) = 0 THEN
    RETURN;
  END IF;

  -- Process each account
  FOREACH v_account_id IN ARRAY v_accounts
  LOOP
    -- Get timeout for this account
    SELECT (follow_up_timeout_minutes || ' minutes')::INTERVAL INTO v_timeout
    FROM tenant_settings
    WHERE account_id = v_account_id;

    IF v_timeout IS NULL THEN
      v_timeout := '10 minutes'::INTERVAL;
    END IF;

    -- Find conversations needing follow-up:
    -- 1. Open/pending status
    -- 2. Last message is from customer (not agent/bot)
    -- 3. No reply within timeout
    -- 4. NEVER had a follow-up sent (one-time only, no spam)
    -- 5. Not assigned to a human who has replied
    FOR v_conv IN
      SELECT c.id, c.contact_id, c.assigned_agent_id, c.human_replied
      FROM conversations c
      WHERE c.account_id = v_account_id
        AND c.status IN ('open', 'pending')
        AND c.last_message_at IS NOT NULL
        AND c.last_message_at < NOW() - v_timeout
        AND c.last_follow_up_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM messages m
          WHERE m.conversation_id = c.id
            AND m.sender_type IN ('agent', 'bot')
            AND m.created_at > c.last_message_at
        )
      LIMIT 50
    LOOP
      -- Skip if human has replied (they own the thread)
      IF v_conv.human_replied = true THEN
        CONTINUE;
      END IF;

      -- Pick appropriate follow-up message
      IF v_conv.assigned_agent_id IS NOT NULL THEN
        v_message := 'Thanks for your patience! A team member is reviewing your message and will respond shortly.';
      ELSE
        v_message := 'Thanks for reaching out! Our team is working on your request and will get back to you soon.';
      END IF;

      -- Send via WhatsApp
      BEGIN
        PERFORM send_follow_up_via_whatsapp(
          v_account_id,
          v_conv.contact_id,
          v_conv.id,
          v_message
        );

        -- Update follow-up timestamp
        UPDATE conversations
        SET last_follow_up_at = NOW()
        WHERE id = v_conv.id;

        RAISE NOTICE 'Follow-up sent to conversation %', v_conv.id;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Failed to send follow-up to conversation %: %', v_conv.id, SQLERRM;
      END;
    END LOOP;
  END LOOP;
END;
$$;

-- ============================================================
-- FUNCTION: Send follow-up via WhatsApp (helper)
-- ============================================================
CREATE OR REPLACE FUNCTION send_follow_up_via_whatsapp(
  p_account_id UUID,
  p_contact_id UUID,
  p_conversation_id UUID,
  p_message TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config RECORD;
  v_contact RECORD;
  v_access_token TEXT;
  v_phone_number_id TEXT;
  v_response JSONB;
BEGIN
  -- Get WhatsApp config
  SELECT * INTO v_config
  FROM whatsapp_config
  WHERE account_id = p_account_id AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WhatsApp not configured for account %', p_account_id;
  END IF;

  -- Get contact phone
  SELECT * INTO v_contact
  FROM contacts
  WHERE id = p_contact_id AND account_id = p_account_id;

  IF NOT FOUND OR v_contact.phone IS NULL THEN
    RAISE EXCEPTION 'Contact % has no phone number', p_contact_id;
  END IF;

  -- Store the message in messages table
  INSERT INTO messages (
    conversation_id,
    sender_type,
    content_type,
    content_text,
    status,
    ai_generated
  ) VALUES (
    p_conversation_id,
    'bot',
    'text',
    p_message,
    'sent',
    false
  );

  -- Update conversation
  UPDATE conversations
  SET last_message_text = p_message,
      last_message_at = NOW(),
      updated_at = NOW()
  WHERE id = p_conversation_id;
END;
$$;

-- ============================================================
-- CRON: Run every 5 minutes via pg_cron
-- ============================================================
-- Note: pg_cron must be enabled on the Supabase project.
-- Run this SQL in the SQL Editor to set up the cron:
--
-- SELECT cron.schedule(
--   'follow-up-messages',
--   '*/5 * * * *',
--   $$SELECT send_follow_up_messages()$$
-- );
-- ============================================================
