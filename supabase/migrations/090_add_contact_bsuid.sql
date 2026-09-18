-- Migration 090: Add BSUID (Business Suite User ID) to contacts.
--
-- Meta's newer webhook format omits `wa_id` and `from` when a WhatsApp
-- user has adopted a username. Instead, it sends `user_id` (BSUID) and
-- `from_user_id` which are always present regardless of username status.
--
-- Without this column, contacts created from such webhooks end up with
-- empty phone and null wa_id — making them unmatchable on future messages.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bsuid TEXT;

-- Unique per account: each BSUID maps to exactly one contact.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_bsuid
  ON contacts (account_id, bsuid)
  WHERE bsuid IS NOT NULL AND bsuid <> '';

-- Fast lookup by bsuid alone (for webhook resolution).
CREATE INDEX IF NOT EXISTS idx_contacts_bsuid
  ON contacts (bsuid)
  WHERE bsuid IS NOT NULL AND bsuid <> '';
