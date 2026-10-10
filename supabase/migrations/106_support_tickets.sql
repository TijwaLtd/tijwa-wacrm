-- ============================================================
-- 106 — SUPPORT TICKETS
--
-- Product-level helpdesk: users raise tickets about Tijwa itself
-- (not tenant data). RLS scopes members to their own account's
-- tickets; the staff console reads everything through the service
-- role after an env-var email allowlist check (SUPPORT_STAFF_EMAILS,
-- see src/lib/support/staff.ts) — no is_staff column needed.
--
--   * support_tickets        — one row per ticket, human tracking id
--   * support_ticket_replies — threaded replies (user + staff)
--
-- tracking_id (TCK-XXXXXX) is generated in the API (random
-- Crockford base32, collision-retried) so ids are unguessable and
-- don't leak volume. Users can never change status/priority —
-- only staff (service role) updates the lifecycle.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM
    ('open', 'in_progress', 'waiting_on_user', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_priority AS ENUM
    ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_category AS ENUM
    ('bug', 'question', 'billing', 'feature_request', 'account', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- The account that raised it — tenancy for member visibility.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- The specific user who raised it (audit; replies carry author_user_id).
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Human tracking id shown to the user, e.g. TCK-7F3K2A.
  tracking_id TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category support_ticket_category NOT NULL DEFAULT 'question',
  status support_ticket_status NOT NULL DEFAULT 'open',
  priority support_ticket_priority NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_account
  ON support_tickets(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets(status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  -- Denormalised so reply RLS never needs a ticket join.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'user' = the ticket raiser (or any member of the account);
  -- 'staff' = Tijwa support (service role write after env allowlist).
  author_role TEXT NOT NULL CHECK (author_role IN ('user', 'staff')),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_replies_ticket
  ON support_ticket_replies(ticket_id, created_at ASC);

-- Keep tickets current when a reply lands.
CREATE OR REPLACE FUNCTION touch_support_ticket_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE support_tickets
    SET updated_at = NOW()
    WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_ticket_replies_touch ON support_ticket_replies;
CREATE TRIGGER support_ticket_replies_touch
  AFTER INSERT ON support_ticket_replies
  FOR EACH ROW EXECUTE FUNCTION touch_support_ticket_updated_at();

-- ============================================================
-- RLS — members see only their account's tickets. Staff console
-- bypasses RLS via the service role (API checks the email
-- allowlist first); there is deliberately no staff RLS path.
-- ============================================================

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_replies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_select_member ON support_tickets;
DROP POLICY IF EXISTS support_tickets_insert_member ON support_tickets;
DROP POLICY IF EXISTS support_ticket_replies_select_member ON support_ticket_replies;
DROP POLICY IF EXISTS support_ticket_replies_insert_member ON support_ticket_replies;

-- Any member (viewer included) can read the account's tickets —
-- support must work regardless of role. The explicit 'viewer'
-- second arg is required: migration 082 added a 1-arg
-- is_account_member(UUID) overload that makes the 1-arg call
-- ambiguous with the 017 function's DEFAULT 'viewer' parameter.
CREATE POLICY support_tickets_select_member ON support_tickets
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- Raising a ticket is open to every member; account_id must be theirs.
CREATE POLICY support_tickets_insert_member ON support_tickets
  FOR INSERT WITH CHECK (is_account_member(account_id, 'viewer'));

-- No UPDATE/DELETE policies: only staff (service role) changes the
-- lifecycle, and tickets are retained for the audit trail.

CREATE POLICY support_ticket_replies_select_member ON support_ticket_replies
  FOR SELECT USING (is_account_member(account_id, 'viewer'));

-- Members reply to their account's tickets (adds user-voice context).
CREATE POLICY support_ticket_replies_insert_member ON support_ticket_replies
  FOR INSERT WITH CHECK (is_account_member(account_id, 'viewer'));

GRANT SELECT, INSERT ON support_tickets TO authenticated;
GRANT SELECT, INSERT ON support_ticket_replies TO authenticated;

COMMENT ON TABLE support_tickets IS
  'Helpdesk tickets raised by workspace members about the Tijwa product itself.';
COMMENT ON COLUMN support_tickets.tracking_id IS
  'Human-friendly unguessable id (TCK-XXXXXX) shown to the user and searchable in the staff console.';
