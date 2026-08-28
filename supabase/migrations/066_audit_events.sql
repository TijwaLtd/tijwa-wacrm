-- ============================================================
-- 066_audit_events.sql
-- Audit & Customer Access tracking infrastructure.
-- Append-only event table for data governance & accountability.
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL,
  contact_id UUID,
  conversation_id UUID,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_audit_events_account ON audit_events(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_contact ON audit_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_conversation ON audit_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_account_created ON audit_events(account_id, created_at DESC);

-- 3. RLS
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Service role can insert (for triggers + API writes)
CREATE POLICY "audit_events_insert_service" ON audit_events
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Admin+ can read their own account's events
CREATE POLICY "audit_events_select_admin" ON audit_events
  FOR SELECT
  TO authenticated
  USING (
    has_role_in_account(auth.uid(), account_id, 'admin')
  );

-- 4. Database trigger for contact CRUD auditing
-- Fires AFTER INSERT/UPDATE/DELETE on contacts table.
-- Uses auth.uid() to capture the acting user.

CREATE OR REPLACE FUNCTION audit_contact_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type TEXT;
  v_event_category TEXT;
  v_actor UUID;
  v_account_id UUID;
  v_metadata JSONB DEFAULT '{}';
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'CONTACT_CREATED';
    v_event_category := 'CONTACT';
    v_actor := NEW.user_id;
    v_account_id := NEW.account_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_event_type := 'CONTACT_UPDATED';
    v_event_category := 'CONTACT';
    v_actor := NEW.user_id;
    v_account_id := NEW.account_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_event_type := 'CONTACT_DELETED';
    v_event_category := 'CONTACT';
    v_actor := OLD.user_id;
    v_account_id := OLD.account_id;
  END IF;

  -- Try to get the actual actor from auth context
  BEGIN
    v_actor := COALESCE(auth.uid(), v_actor);
  EXCEPTION WHEN OTHERS THEN
    -- auth.uid() not available in some contexts (e.g. service role)
    NULL;
  END;

  -- Build minimal metadata — no PII
  IF TG_OP = 'INSERT' THEN
    v_metadata := jsonb_build_object(
      'operation', 'INSERT',
      'has_name', (NEW.name IS NOT NULL AND NEW.name != ''),
      'has_email', (NEW.email IS NOT NULL AND NEW.email != '')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    v_metadata := jsonb_build_object(
      'operation', 'UPDATE',
      'fields_changed', (
        SELECT jsonb_agg(key)
        FROM jsonb_each(to_jsonb(NEW) - 'updated_at')
        WHERE to_jsonb(NEW) ->> key IS DISTINCT FROM to_jsonb(OLD) ->> key
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_metadata := jsonb_build_object(
      'operation', 'DELETE'
    );
  END IF;

  -- Insert audit event
  INSERT INTO audit_events (account_id, actor_user_id, contact_id, event_type, event_category, metadata)
  VALUES (v_account_id, v_actor,
          CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
          v_event_type, v_event_category, v_metadata);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Drop trigger if it exists, then create
DROP TRIGGER IF EXISTS trg_audit_contact_changes ON contacts;
CREATE TRIGGER trg_audit_contact_changes
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION audit_contact_changes();
