-- Migration 050: Add Meta wa_id (business-scoped user ID) to contacts.
--
-- Meta sends `contacts[].wa_id` in every inbound webhook payload. This
-- is the authoritative customer identifier in the business-scoped
-- context. Storing it lets us:
--   1. Look up contacts by Meta's native ID (faster + more reliable than phone)
--   2. Detect when Meta renumbers a customer (different wa_id, same person)
--   3. Support Click-to-WhatsApp ads attribution (provides wa_id)
--   4. Use a stable ID for outbound routing instead of relying on phone format

-- Add the column (nullable for existing rows; backfilled by webhook on next inbound).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS wa_id TEXT;

-- Unique per account: each Meta wa_id maps to exactly one contact.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_wa_id
  ON contacts (account_id, wa_id)
  WHERE wa_id IS NOT NULL AND wa_id <> '';

-- Fast lookup by wa_id alone (for webhook resolution before account is known).
CREATE INDEX IF NOT EXISTS idx_contacts_wa_id
  ON contacts (wa_id)
  WHERE wa_id IS NOT NULL AND wa_id <> '';
