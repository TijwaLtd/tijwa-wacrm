-- Migration 103: consent can be assumed from silence.
--
-- Previous behaviour (094): silence after the Accept/Decline ask meant
-- NOT accepted, and only order/booking confirm was gated. New rule:
--
--   * the consent message is short and carries ONE link (the policy page);
--   * the moment it is sent the contact is recorded as ACCEPTED with
--     consent_tos_assumed_at set — ignoring the ask counts as agreeing;
--   * an explicit Decline clears version/accepted/assumed and BLOCKS the
--     conversation: every inbound message gets the "you have to agree"
--     reply until the customer taps Accept;
--   * an explicit Accept clears consent_tos_assumed_at — consent is then
--     their own action, not an assumption.
--
-- consent_tos_assumed_at is what makes the distinction queryable: NULL
-- with consent_tos_accepted_at set = they tapped Accept themselves.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS consent_tos_assumed_at TIMESTAMPTZ;

COMMENT ON COLUMN contacts.consent_tos_assumed_at IS
  'Set when the consent message was sent and the customer never answered: silence is recorded as agreement. NULL + consent_tos_accepted_at set = explicit Accept tap.';
