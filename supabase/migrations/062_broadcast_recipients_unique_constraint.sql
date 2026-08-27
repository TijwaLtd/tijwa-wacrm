-- Migration 062: Add unique constraint on broadcast_recipients(broadcast_id, contact_id)
-- and make the recipient insert idempotent via ON CONFLICT DO NOTHING.
-- Without this, a retry after a partial failure or a duplicate contact in the
-- audience causes a duplicate-key error on the UUID primary key — because each
-- insert generates its own uuid_generate_v4() id, so the PK itself doesn't
-- prevent the row from being a logical duplicate.

-- First, add the unique constraint (Postgres will check existing rows first;
-- if any duplicates exist this will fail and need to be cleaned up manually).
ALTER TABLE broadcast_recipients
ADD CONSTRAINT broadcast_recipients_broadcast_contact_unique
UNIQUE (broadcast_id, contact_id);

-- The application already inserts without explicit ids (relies on the PK
-- default). To make inserts idempotent on retry, change the Supabase
-- .insert() call to use onConflict:
--
--   .insert(batch, { onConflict: 'broadcast_id,contact_id' })
--   .eq('onConflict', 'broadcast_id,contact_id')
--
-- or equivalently in raw SQL:
--   INSERT INTO broadcast_recipients (broadcast_id, contact_id, status)
--   VALUES (...)
--   ON CONFLICT (broadcast_id, contact_id) DO NOTHING;
