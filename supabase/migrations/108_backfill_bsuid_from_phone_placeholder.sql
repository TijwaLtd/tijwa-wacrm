-- ============================================================
-- Backfill contacts.bsuid from the bsuid_ phone placeholder.
--
-- Contacts created before migration 090 (which added the bsuid
-- column) stored their BSUID only as a `bsuid_<id>` placeholder in
-- the phone column. The composer's whatsappCalled check looks at
-- the bsuid column, so those contacts show "No WhatsApp number or
-- user ID" even though they ARE reachable via BSUID.
--
-- This migration extracts the real BSUID from the placeholder and
-- writes it to the bsuid column.
-- ============================================================

UPDATE contacts
SET bsuid = substring(phone from 7),  -- strip the 'bsuid_' prefix
    updated_at = now()
WHERE phone LIKE 'bsuid\_%'
  AND bsuid IS NULL;
