-- ============================================================
-- Add contact_bsuid to get_user_conversations RPC.
--
-- The inbox composer checks contact.bsuid to determine if a
-- BSUID-only contact is reachable. The local-first IndexedDB
-- cache reconstructs the contact from denormalized RPC columns,
-- so the RPC must include bsuid or the cache loses it.
-- ============================================================

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
  contact_bsuid TEXT,
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
    co.bsuid AS contact_bsuid,
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
      c.type = 'whatsapp' AND (
        role_to_rank(am.role) >= 60
        OR c.assigned_agent_id = p_user_id
      )
      OR
      c.type = 'team' AND (
        role_to_rank(am.role) >= 80
        OR EXISTS (
          SELECT 1 FROM team_conversation_participants tcp
          WHERE tcp.conversation_id = c.id
            AND tcp.user_id = p_user_id
        )
      )
    )
  ORDER BY c.last_message_at DESC NULLS LAST;
$$;
