-- ============================================================
-- 052_conversations_type_and_auto_assign.sql
--
-- 1. Adds `type` column to conversations ('whatsapp' | 'team').
--    WhatsApp conversations keep contact_id NOT NULL (via CHECK).
--    Team conversations set contact_id to NULL.
-- 2. Replaces the single unique index on (account_id, contact_id)
--    with a partial index that only enforces for whatsapp type.
-- 3. Adds auto-assignment columns to tenant_settings.
-- 4. Adds team_conversation_participants junction table.
-- 5. Updates get_user_conversations RPC to handle both types.
-- ============================================================

-- 1. Add conversation type column
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'whatsapp'
  CHECK (type IN ('whatsapp', 'team'));

-- 2. Make contact_id nullable (was NOT NULL) but enforce for whatsapp via CHECK
--    First drop the old NOT NULL constraint by recreating with a CHECK.
--    Postgres doesn't support dropping NOT NULL with a CHECK in one step,
--    so we use a workaround: make nullable, then add a CHECK constraint.
ALTER TABLE conversations
  ALTER COLUMN contact_id DROP NOT NULL;

-- Enforce contact_id required for whatsapp conversations
ALTER TABLE conversations
  ADD CONSTRAINT conversations_contact_id_required_for_whatsapp
  CHECK (type != 'whatsapp' OR contact_id IS NOT NULL);

-- 3. Replace the unique index: one conversation per contact per account (whatsapp only)
DROP INDEX IF EXISTS idx_conversations_account_contact;

CREATE UNIQUE INDEX idx_conversations_account_contact
  ON conversations (account_id, contact_id)
  WHERE type = 'whatsapp' AND contact_id IS NOT NULL;

-- 4. Index on type for filtering
CREATE INDEX IF NOT EXISTS idx_conversations_type
  ON conversations (account_id, type);

-- 5. Auto-assignment settings on tenant_settings
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS auto_assign_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (auto_assign_mode IN ('manual', 'round_robin', 'load_balanced'));

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS last_assigned_agent_id UUID;

-- 6. Team conversation participants junction table
CREATE TABLE IF NOT EXISTS team_conversation_participants (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);

ALTER TABLE team_conversation_participants ENABLE ROW LEVEL SECURITY;

-- RLS: account members can see participants for conversations in their account
CREATE POLICY team_participants_select ON team_conversation_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND has_role_in_account(auth.uid(), c.account_id, 'viewer')
    )
  );

-- RLS: agents can insert participants for conversations in their account
CREATE POLICY team_participants_insert ON team_conversation_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND has_role_in_account(auth.uid(), c.account_id, 'agent')
    )
  );

-- RLS: agents can delete participants for conversations in their account
CREATE POLICY team_participants_delete ON team_conversation_participants
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND has_role_in_account(auth.uid(), c.account_id, 'agent')
    )
  );

-- 7. Add team_name to conversations for named team threads (must exist before the RPC)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS team_name TEXT;

-- 8. Update get_user_conversations RPC to include type and handle team conversations
--    Visibility rules:
--    - whatsapp conversations: visible to all account members (existing behavior)
--    - team conversations: visible to owner/admin always, others only if participant
DROP FUNCTION IF EXISTS get_user_conversations(UUID);

CREATE FUNCTION get_user_conversations(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  account_id UUID,
  contact_id UUID,
  type TEXT,
  status TEXT,
  assigned_agent_id UUID,
  last_message_text TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  contact_name TEXT,
  contact_phone TEXT,
  contact_company TEXT,
  team_name TEXT,
  team_participant_ids UUID[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.id,
    c.account_id,
    c.contact_id,
    c.type,
    c.status,
    c.assigned_agent_id,
    c.last_message_text,
    c.last_message_at,
    c.unread_count,
    c.created_at,
    c.updated_at,
    co.name AS contact_name,
    co.phone AS contact_phone,
    co.company AS contact_company,
    c.team_name,
    ARRAY(
      SELECT tcp.user_id
      FROM team_conversation_participants tcp
      WHERE tcp.conversation_id = c.id
    ) AS team_participant_ids
  FROM account_memberships am
  JOIN conversations c ON c.account_id = am.account_id
  LEFT JOIN contacts co ON co.id = c.contact_id
  WHERE am.user_id = p_user_id
    AND (
      -- WhatsApp conversations: visible to all account members
      c.type = 'whatsapp'
      OR
      -- Team conversations: visible to owner/admin always,
      -- or to any member who is a participant
      c.type = 'team' AND (
        am.role IN ('owner', 'admin')
        OR
        EXISTS (
          SELECT 1 FROM team_conversation_participants tcp
          WHERE tcp.conversation_id = c.id
            AND tcp.user_id = p_user_id
        )
      )
    )
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;
