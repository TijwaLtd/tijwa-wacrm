// ============================================================
// Web Push delivery (server-only).
//
// Sends a push to every registered endpoint for a set of users via
// the `web-push` library. The receiving service worker (public/sw.js)
// turns the payload into an OS notification — or relays it to a
// focused window for an in-app toast, so the user never gets both.
//
// Configuration is env-driven and OPTIONAL: with no VAPID keys the
// whole layer degrades to "in-app notifications only", which keeps
// local dev and self-hosters without push working out of the box.
//
// Generate a keypair once with:
//   npx web-push generate-vapid-keys
// then set NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  /** Deep-link the SW opens on click. */
  url: string;
  /** Grouping tag — identical tags collapse into one OS bubble. */
  tag: string;
  icon?: string;
  badge?: string;
}

const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:ops@tijwa.com';

let vapidReady: boolean | null = null;

/** True when a VAPID keypair is present and web-push can send. */
export function isPushConfigured(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    vapidReady = false;
    return false;
  }
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, pub, priv);
    vapidReady = true;
  } catch (err) {
    console.error('[push] invalid VAPID configuration:', err);
    vapidReady = false;
  }
  return vapidReady;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send `payload` to every push endpoint belonging to `userIds`.
 * Never throws. Removes endpoints the browser reports as gone
 * (404/410) so the table doesn't accumulate corpses.
 */
export async function sendPushToUsers(
  db: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  if (!isPushConfigured()) return;

  const { data: rows, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error || !rows || rows.length === 0) {
    if (error) console.error('[push] subscription fetch failed:', error);
    return;
  }

  const body = JSON.stringify(payload);

  await Promise.all(
    rows.map(async (row: SubscriptionRow) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          body,
        );
        // Touch last_used_at — best-effort, ignore failures.
        await db
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', row.id)
          .then(() => undefined);
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'statusCode' in err
            ? (err as { statusCode?: number }).statusCode
            : undefined;
        // 404/410: the browser rotated or wiped the subscription —
        // delete so future fan-outs don't keep hitting a dead URL.
        if (status === 404 || status === 410) {
          await db.from('push_subscriptions').delete().eq('id', row.id);
          return;
        }
        console.error(
          `[push] send failed (status ${status ?? 'unknown'}):`,
          err,
        );
      }
    }),
  );
}
