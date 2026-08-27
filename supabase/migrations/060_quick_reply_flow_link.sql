-- ============================================================
-- 060_quick_reply_flow_link.sql
--
-- Adds flow_id to quick_replies so interactive quick replies
-- can be linked to a specific flow. When a customer taps a
-- button from a linked quick reply, the webhook looks up the
-- quick reply by the button's reply_id and starts the flow.
-- ============================================================

-- Add nullable flow_id column to quick_replies
ALTER TABLE quick_replies
  ADD COLUMN IF NOT EXISTS flow_id UUID REFERENCES flows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quick_replies_flow_id
  ON quick_replies(flow_id)
  WHERE flow_id IS NOT NULL;

COMMENT ON COLUMN quick_replies.flow_id IS
  'Optional link to a flow. When set, button taps from this quick reply '
  'will start/advance this flow instead of relying on keyword triggers.';
