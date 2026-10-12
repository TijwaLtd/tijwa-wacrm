-- ============================================================
-- Migration 110: HIPAA mode + encrypted PHI notes
--
-- The HIPAA carve-out: WhatsApp is a *scheduling + link* channel only.
-- No clinical detail ever transits WhatsApp. Anything health-related a
-- customer or clinic staff enters lives on the secure web form and is
-- stored AES-256-GCM encrypted at rest (contacts.phi_notes_encrypted).
--
-- Why `phi_notes_encrypted` and NOT encrypting name/email:
--   name/email are directory data (not PHI on their own) and are read
--   by ~60 touchpoints including SQL RPCs, ILIKE search and joins —
--   encrypting them would break search and is the wrong target. PHI is
--   the *health content*, which is what this column holds.
--
-- What this migration does:
--   1. tenant_settings.hipaa_mode BOOLEAN — the carve-out switch.
--      Default FALSE; turned ON for healthcare business types below
--      and toggleable in Business Settings.
--   2. contacts.phi_notes_encrypted TEXT — AES-256-GCM ciphertext
--      (iv:ct:authTag) for the secure form's "reason for visit" /
--      notes field. NULL for non-healthcare or when nothing entered.
--   3. Backfill hipaa_mode = TRUE for existing healthcare accounts.
--
-- RLS: tenant_settings already has viewer SELECT + admin UPDATE (039).
-- contacts already has agent+ policies (017/038). No new policies
-- needed — phi_notes_encrypted rides the existing contacts policies,
-- so only account members ever see the row; the value itself is
-- ciphertext only readable with ENCRYPTION_KEY (server-side only).
-- ============================================================

-- 1. The carve-out switch.
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS hipaa_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN tenant_settings.hipaa_mode IS
  'HIPAA carve-out: WhatsApp is scheduling+links only. When TRUE the AI refuses clinical detail, an outbound PHI filter runs before every send, and the secure booking form encrypts health notes at rest.';

-- 2. Encrypted PHI notes on the contact.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS phi_notes_encrypted TEXT;

COMMENT ON COLUMN contacts.phi_notes_encrypted IS
  'AES-256-GCM ciphertext (iv:ct:authTag) of the secure web form health notes / reason-for-visit. Never returned to the client or included in WhatsApp. Decrypt server-side only with ENCRYPTION_KEY.';

-- 3. Turn the carve-out ON for existing healthcare tenants.
--    (business_type lives on accounts; we copy the decision onto
--     tenant_settings so the AI dispatch + settings UI read one flag.)
UPDATE tenant_settings ts
SET hipaa_mode = TRUE
FROM accounts a
WHERE ts.account_id = a.id
  AND a.business_type IN ('healthcare', 'healthcare_clinic')
  AND ts.hipaa_mode = FALSE;
