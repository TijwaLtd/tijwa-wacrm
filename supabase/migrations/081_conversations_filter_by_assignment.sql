-- ============================================================
-- 081_conversations_filter_by_assignment.sql
--
-- Non-admin users should only see conversations assigned to them.
-- Owners/admins/managers see all conversations in their account.
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_conversations(p_user_id UUID)
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
      -- WhatsApp conversations:
      -- Owners/admins/managers see all; others see only assigned or unassigned
      c.type = 'whatsapp' AND (
        am.role IN ('owner', 'admin', 'manager')
        OR c.assigned_agent_id IS NULL
        OR c.assigned_agent_id = p_user_id
      )
      OR
      -- Team conversations: visible to owner/admin always,
      -- or to any member who is a participant
      c.type = 'team' AND (
        am.role IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1 FROM team_conversation_participants tcp
          WHERE tcp.conversation_id = c.id
            AND tcp.user_id = p_user_id
        )
      )
    )
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;
