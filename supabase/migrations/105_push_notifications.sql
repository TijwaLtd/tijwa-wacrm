-- ============================================================
-- 105 — WEB PUSH + NOTIFICATION EVENTS
--
-- Layered on the existing in-app notifications system (027):
--   * push_subscriptions — Web Push endpoints so the PWA / browser
--     can be notified when no tab is open (service-worker push).
--   * notifications.type — widen the CHECK so the reusable notify()
--     pipeline can create message-received and billing rows (027
--     only allowed 'conversation_assigned').
--   * notifications.metadata — deep-link URL + dedupe tag carried to
--     the service worker's notification payload.
--
-- Push delivery itself is server-side (src/lib/notifications/push.ts,
-- VAPID env). RLS lets each user manage only their own endpoints;
-- the service role reads all rows to fan out.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Denormalised so a push fan-out never needs a membership join.
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- The PushSubscription.endpoint — globally unique per browser +
  -- device. Upserts key on this so re-subscribing replaces stale keys.
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_account
  ON push_subscriptions(account_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_insert_own ON push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_delete_own ON push_subscriptions;

-- A user can see, register, and remove only their own endpoints.
-- No UPDATE policy: re-subscribing is an INSERT ... ON CONFLICT upsert
-- (the anon/authenticated role owns the insert below); last_used_at is
-- refreshed by the service role during delivery.
CREATE POLICY push_subscriptions_select_own ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY push_subscriptions_insert_own ON push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY push_subscriptions_delete_own ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON push_subscriptions TO authenticated;
-- Service role (service_role) bypasses RLS for fan-out reads.

-- ============================================================
-- notifications — widen type CHECK + add metadata
-- ============================================================
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'conversation_assigned',
    'message_received',
    'billing_confirmation'
  ));

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB
  NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN notifications.metadata IS
  'Extras for delivery: { url: deep-link shown by the SW notification, tag: dedupe key }.';
