-- ============================================================
-- 058_human_timeout.sql
--
-- Adds human response timeout tracking for AI fallback.
-- When a human agent takes over, AI stays quiet for a configurable
-- period. If the human doesn't reply in time, AI steps back in.
-- ============================================================

-- Track when human was assigned (for timeout calculation)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS human_assigned_at TIMESTAMPTZ;

-- Track if human has replied since being assigned
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS human_replied BOOLEAN NOT NULL DEFAULT false;

-- AI config: human response timeout in minutes (default 5 min)
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS ai_human_timeout_minutes INT NOT NULL DEFAULT 5;

CREATE INDEX IF NOT EXISTS idx_conversations_human_assigned
  ON conversations(human_assigned_at)
  WHERE human_assigned_at IS NOT NULL;

-- ============================================================
-- TRIGGER: Mark human_replied when agent sends a message
-- ============================================================
CREATE OR REPLACE FUNCTION mark_human_replied()
RETURNS TRIGGER AS $$
BEGIN
  -- Only mark for agent messages (not bot/AI messages)
  IF NEW.sender_type = 'agent' AND NEW.conversation_id IS NOT NULL THEN
    UPDATE conversations
    SET human_replied = true
    WHERE id = NEW.conversation_id
      AND human_assigned_at IS NOT NULL
      AND human_replied = false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_agent_message ON messages;
CREATE TRIGGER on_agent_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION mark_human_replied();
