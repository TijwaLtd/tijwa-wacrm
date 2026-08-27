-- ============================================================
-- 063_broadcast_recipients_atomic_insert
--
-- Replaces the two-step (delete + insert) pattern in the
-- application layer with a single atomic Postgres function.
--
-- Why atomic:
--   • The delete-before-insert pattern in the app layer is NOT
--     safe under concurrent sends — two simultaneous broadcasts for
--     the same account could race: A deletes B's rows, B inserts,
--     A inserts, and now B's recipients are gone or duplicated.
--   • A single function body runs in one transaction, so the
--     delete+insert is truly atomic — no other session can observe
--     a partial state.
--   • Uses ON CONFLICT DO NOTHING on the primary key as a safety
--     net for any UUID collisions that might arise from client-side
--     UUID generation.
--
-- Background: the broadcast_recipients PK is `id` (UUID default).
-- The only way to violate it is the same contact UUID twice in
-- one broadcast — which can happen if contacts are returned
-- duplicated from tag/custom-field queries before dedup, or from
-- concurrent send attempts.
-- ============================================================

CREATE OR REPLACE FUNCTION insert_broadcast_recipients_atomic(
  p_broadcast_id UUID,
  p_contact_ids  UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipient_count INTEGER;
BEGIN
  -- Clean slate: remove any prior recipients from a previous attempt.
  DELETE FROM broadcast_recipients
   WHERE broadcast_id = p_broadcast_id;

  -- Bulk insert. ON CONFLICT DO NOTHING guards against UUID collisions
  -- (duplicate contact ids) that slip through the application's own
  -- Set-based dedup. Rows with NULL contact_id are silently dropped
  -- by the WHERE clause on the RETURNING.
  WITH ins AS (
    INSERT INTO broadcast_recipients (broadcast_id, contact_id, status)
    SELECT p_broadcast_id, cid, 'pending'
      FROM unnest(p_contact_ids) AS cid
     WHERE cid IS NOT NULL
  ON CONFLICT (id) DO NOTHING
  RETURNING 1
  )
  SELECT COUNT(*) INTO v_recipient_count FROM ins;

  RETURN v_recipient_count;
END;
$$;

-- Only service role (webhook / background jobs) calls this.
REVOKE ALL ON FUNCTION insert_broadcast_recipients_atomic(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION insert_broadcast_recipients_atomic(UUID, UUID[]) FROM anon;
REVOKE ALL ON FUNCTION insert_broadcast_recipients_atomic(UUID, UUID[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION insert_broadcast_recipients_atomic(UUID, UUID[]) TO service_role;
