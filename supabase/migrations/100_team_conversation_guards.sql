-- ============================================================
-- 100_team_conversation_guards.sql
--
-- Team (internal) conversations: make participants first-class for
-- SELECT visibility, and fence team threads out of WhatsApp-only
-- pipelines at the SQL layer too.
--
-- 1. RLS: conversations/messages SELECT currently allow manager+ or
--    the assigned agent only. Team conversations have no assignee, so
--    an agent who is a *participant* fails RLS — realtime events and
--    hydrate fetches are silently dropped for them (the thread only
--    catches up on manual refresh). Add a participant branch.
--
--    The conversations policy must look up team_conversation_participants,
--    whose own SELECT policy references conversations — a direct join
--    would recurse infinitely. The lookup therefore goes through a
--    SECURITY DEFINER helper (same pattern as has_role_in_account /
--    is_account_member, migration 017/038).
--
-- 2. Follow-up cron (send_follow_up_messages, from 059): explicitly
--    target type='whatsapp' only. Team threads were only excluded
--    incidentally (contact_id IS NULL → helper raises a caught
--    warning); mirror the TS route guard so the predicate is
--    intentional.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: is the user a participant of this team conversation?
-- SECURITY DEFINER so policy evaluation doesn't recurse back into
-- conversations RLS through team_conversation_participants' policy.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_team_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
  );
$$;

ALTER FUNCTION is_team_conversation_participant(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_team_conversation_participant(UUID, UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Conversations: replace SELECT policy — manager+ / assignee /
-- team participant
-- ------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation_select ON conversations;

CREATE POLICY tenant_isolation_select ON conversations
  FOR SELECT USING (
    has_role_in_account(auth.uid(), account_id, 'manager')
    OR assigned_agent_id = auth.uid()
    OR is_team_conversation_participant(id, auth.uid())
  );

-- ------------------------------------------------------------
-- Messages: replace SELECT policy — same rules via the parent
-- conversation
-- ------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation_select ON messages;

CREATE POLICY tenant_isolation_select ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          has_role_in_account(auth.uid(), c.account_id, 'manager')
          OR c.assigned_agent_id = auth.uid()
          OR is_team_conversation_participant(c.id, auth.uid())
        )
    )
  );

-- ------------------------------------------------------------
-- Follow-up cron: WhatsApp conversations only (replaces 059 body,
-- one predicate added: AND c.type = 'whatsapp')
-- ------------------------------------------------------------
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
    -- 1. WhatsApp conversations only (never type='team')
    -- 2. Open/pending status
    -- 3. Last message is from customer (not agent/bot)
    -- 4. No reply within timeout
    -- 5. NEVER had a follow-up sent (one-time only, no spam)
    -- 6. Not assigned to a human who has replied
    FOR v_conv IN
      SELECT c.id, c.contact_id, c.assigned_agent_id, c.human_replied
      FROM conversations c
      WHERE c.account_id = v_account_id
        AND c.type = 'whatsapp'
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
