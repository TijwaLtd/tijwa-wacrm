-- Migration 091: Backfill contacts.wa_id / contacts.bsuid from phone.
--
-- Meta is moving identity away from raw phone numbers. For classic
-- (non-username) contacts, Meta's wa_id IS the phone digits without
-- formatting — so existing phone rows can seed both columns today
-- instead of waiting for the next inbound webhook.
--
-- New / updated rows get the authoritative id from:
--   - send responses  (contacts[0].wa_id → saveContactMetaIdentity)
--   - status webhooks (recipient_id     → saveContactMetaIdentity)
--   - inbound webhooks (user_id / wa_id)
--
-- Safety:
--   - Only fills NULL/empty columns (never overwrites a real Meta id)
--   - Skips phones already owned by another contact (unique indexes)
--   - Wrapped in EXCEPTION handler so a rare race cannot abort the
--     migration or leave the database in a broken state

DO $$
BEGIN
  UPDATE contacts AS c
  SET
    wa_id = COALESCE(NULLIF(c.wa_id, ''), src.digits),
    bsuid = COALESCE(NULLIF(c.bsuid, ''), src.digits),
    updated_at = NOW()
  FROM (
    SELECT
      id,
      account_id,
      regexp_replace(phone, '[^0-9]', '', 'g') AS digits
    FROM contacts
    WHERE phone IS NOT NULL
      AND phone <> ''
      AND phone !~ '^bsuid_'
      AND (bsuid IS NULL OR bsuid = '')
      AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 8
  ) AS src
  WHERE
    c.id = src.id
    AND NOT EXISTS (
      SELECT 1
      FROM contacts AS other
      WHERE other.account_id = src.account_id
        AND other.id <> src.id
        AND (
          (other.bsuid IS NOT NULL AND other.bsuid = src.digits)
          OR (other.wa_id IS NOT NULL AND other.wa_id = src.digits)
        )
    );
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE '091: skipped rows that would violate wa_id/bsuid uniqueness';
END $$;
