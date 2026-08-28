-- ============================================================
-- 055_extra_seats.sql
-- Track extra team member seats purchased beyond plan limits.
--
-- Strategy:
--   - Plans include X seats (Starter: 1, Business: 3, Growth: 5)
--   - Extra seats cost KES 750/mo each
--   - Prorated charge on addition (immediate)
--   - Auto-removed on plan upgrade if new plan covers members
--   - Removal takes effect next renewal (no refund)
-- ============================================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS extra_seats INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seat_price_kes NUMERIC(10,2) DEFAULT 750;

-- Ensure extra_seats never goes negative
ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS extra_seats_non_negative,
  ADD CONSTRAINT extra_seats_non_negative CHECK (extra_seats >= 0);

COMMENT ON COLUMN subscriptions.extra_seats IS 'Number of extra team member seats purchased beyond plan limit. KES 750/mo each.';
COMMENT ON COLUMN subscriptions.seat_price_kes IS 'Price per extra seat per month in KES.';
