-- Migration 061: Fast quick-reply-to-flow lookup via Postgres JSONB
-- Replaces the JS-side O(n) iteration over quick_replies with a single
-- RPC call to this function. The function scans buttons[] and
-- sections[].rows[] inside interactive_payload using jsonb_path_query
-- so Postgres does the JSON traversal, not JavaScript.

CREATE OR REPLACE FUNCTION find_quick_reply_flow_by_reply_id(
  p_reply_id  TEXT,
  p_account_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_flow_id UUID;
BEGIN
  SELECT qr.flow_id
    INTO v_flow_id
    FROM quick_replies qr
   WHERE qr.account_id     = p_account_id
     AND qr.kind           = 'interactive'
     AND qr.flow_id        IS NOT NULL
     AND (
       -- Match against buttons[].id
       EXISTS (
         SELECT 1
           FROM jsonb_array_elements(qr.interactive_payload -> 'buttons') AS btn
          WHERE btn ->> 'id' = p_reply_id
       )
       OR
       -- Match against sections[].rows[].id
       EXISTS (
         SELECT 1
           FROM jsonb_array_elements(qr.interactive_payload -> 'sections') AS sec,
                jsonb_array_elements(sec -> 'rows')                       AS row
          WHERE row ->> 'id' = p_reply_id
       )
     )
   LIMIT 1;

  RETURN v_flow_id;
END;
$$;

COMMENT ON FUNCTION find_quick_reply_flow_by_reply_id(TEXT, UUID) IS
  'Returns the flow_id of the interactive quick reply in account_id whose
   interactive_payload contains a button or list-row with the given reply_id.
   Used by the WhatsApp webhook to route button taps to their linked flows
   without application-side JSONB iteration.';
