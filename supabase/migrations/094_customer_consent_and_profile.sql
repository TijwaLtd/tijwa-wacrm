-- Migration 094: Customer consent (Terms/Privacy) + profile completion state.
--
-- Consent is asked NON-BLOCKING after the first AI reply (buttons:
-- Accept/Decline). Silence = not accepted. It becomes mandatory only at
-- checkout (order/booking/inquiry confirm), alongside a completed profile
-- (name + email collected via the public /[slug]/c/[contactId] form).
--
-- profile_completed_at is set by the public form when name+email are saved.
-- last_profile_nudge_at rate-limits the after-reply nudge (7 days).

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS consent_tos_version TEXT,
  ADD COLUMN IF NOT EXISTS consent_tos_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_tos_declined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_asked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_profile_nudge_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS anonymised_at TIMESTAMPTZ;

-- Fast "who still needs consent" lookups per account.
CREATE INDEX IF NOT EXISTS idx_contacts_consent_pending
  ON contacts (account_id)
  WHERE consent_tos_version IS NULL;

-- Fast "profile still incomplete" lookups per account.
CREATE INDEX IF NOT EXISTS idx_contacts_profile_pending
  ON contacts (account_id)
  WHERE profile_completed_at IS NULL;

COMMENT ON COLUMN contacts.consent_tos_version IS
  'Version of Terms/Privacy accepted (e.g. ke-eu-v1). NULL = not accepted.';
COMMENT ON COLUMN contacts.anonymised_at IS
  'Set when the customer exercised deletion: PII stripped, aggregates kept where law allows.';
