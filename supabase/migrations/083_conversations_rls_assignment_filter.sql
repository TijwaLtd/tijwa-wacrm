-- Fix conversations and messages RLS: non-admin users only see
-- conversations assigned to them (or unassigned). Owners/admins/managers
-- (rank >= 60) still see everything.
--
-- The old policy let any viewer+ see all conversations in their account.
-- This caused team members to see conversations they shouldn't handle.

-- ============================================================
-- Conversations: replace SELECT policy
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON conversations;

-- Manager+ (rank >= 60): see all conversations
-- Others: see ONLY conversations assigned to them — no unassigned, no others'
CREATE POLICY tenant_isolation_select ON conversations
  FOR SELECT USING (
    has_role_in_account(auth.uid(), account_id, 'manager')
    OR assigned_agent_id = auth.uid()
  );

-- ============================================================
-- Messages: replace SELECT policy
-- ============================================================
DROP POLICY IF EXISTS tenant_isolation_select ON messages;

-- Same logic: if you can see the conversation, you can see its messages
CREATE POLICY tenant_isolation_select ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          has_role_in_account(auth.uid(), c.account_id, 'manager')
          OR c.assigned_agent_id = auth.uid()
        )
    )
  );
