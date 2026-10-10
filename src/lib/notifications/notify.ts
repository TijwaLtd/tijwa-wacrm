// ============================================================
// Reusable browser/PWA notification pipeline.
//
// Every alert the product can raise (new WhatsApp message, billing
// confirmation, …) funnels through `notify()`:
//
//   1. persist a `notifications` row  → in-app bell + /notifications
//   2. fan out Web Push               → OS notification when the tab
//                                       is closed (PWA or browser)
//
// Step 2 is best-effort and NEVER throws — a dead push endpoint, a
// missing VAPID key, or a network blip must not roll back the in-app
// row or the caller's real work (e.g. persisting an inbound message).
//
// Adding a new event = one entry in NOTIFICATION_EVENTS + a single
// `notify()` call at the source. No new tables, no new SW code.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { sendPushToUsers } from './push';
import type { NotificationType } from '@/types';

export interface NotificationTarget {
  accountId: string;
  userId: string;
}

export interface NotifyInput {
  type: NotificationType;
  accountId: string;
  /** Recipients. Empty array is a no-op (not an error). */
  userIds: string[];
  title: string;
  body?: string;
  conversationId?: string;
  contactId?: string;
  /** Deep-link the SW notification opens. Defaults to /notifications. */
  url?: string;
  /** Dedupe/group key. Defaults to `${type}:${conversationId ?? 'global'}`. */
  tag?: string;
  /**
   * Suppress Web Push for this notify (in-app only). Rarely needed —
   * callers usually want the OS notification too. Use when the event
   * is high-frequency and the user is already guaranteed to be looking
   * at the app.
   */
  skipPush?: boolean;
}

/** Unique per type so SW tags collapse repeats into one OS bubble. */
export function defaultTag(
  type: NotificationType,
  conversationId?: string,
): string {
  return conversationId ? `${type}:${conversationId}` : type;
}

/**
 * Persist `notifications` rows + best-effort Web Push. Never throws.
 * Returns the ids of rows that were actually inserted (empty on total
 * failure — callers that care can inspect, most shouldn't).
 */
export async function notify(
  db: SupabaseClient,
  input: NotifyInput,
): Promise<string[]> {
  const {
    type,
    accountId,
    userIds,
    title,
    body,
    conversationId,
    contactId,
    url,
    tag,
    skipPush,
  } = input;

  if (userIds.length === 0) return [];

  const effectiveTag = tag ?? defaultTag(type, conversationId);
  const effectiveUrl = url ?? '/notifications';
  const metadata = { url: effectiveUrl, tag: effectiveTag };

  let insertedIds: string[] = [];

  try {
    const rows = userIds.map((userId) => ({
      account_id: accountId,
      user_id: userId,
      type,
      conversation_id: conversationId ?? null,
      contact_id: contactId ?? null,
      title,
      body: body ?? null,
      metadata,
    }));

    const { data, error } = await db
      .from('notifications')
      .insert(rows)
      .select('id');
    if (error) {
      console.error('[notify] insert failed:', error);
    } else {
      insertedIds = (data ?? []).map((r) => r.id as string);
    }
  } catch (err) {
    console.error('[notify] insert threw:', err);
  }

  if (!skipPush) {
    try {
      await sendPushToUsers(db, userIds, {
        title,
        body: body ?? '',
        url: effectiveUrl,
        tag: effectiveTag,
      });
    } catch (err) {
      // sendPushToUsers already swallows per-endpoint failures; this
      // is the last-resort guard.
      console.error('[notify] push fan-out failed:', err);
    }
  }

  return insertedIds;
}
