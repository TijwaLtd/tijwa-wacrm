/**
 * Offline-first audit event sync.
 *
 * Handles:
 * 1. Queueing audit events to IndexedDB while offline
 * 2. Syncing pending events to POST /api/audit/events when online
 * 3. Cleaning up synced items
 */

import {
  addAuditOutboxItem,
  getPendingAuditOutbox,
  updateAuditOutboxItem,
  deleteAuditOutboxItem,
} from "@/lib/db";
import type { AuditOutboxItem } from "@/lib/db/schema";

/**
 * Queue an audit event for offline delivery.
 * Returns the outbox item ID for tracking.
 */
export async function queueAuditEvent(params: {
  accountId: string;
  eventType: string;
  contactId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = crypto.randomUUID();
  const item: AuditOutboxItem = {
    id,
    account_id: params.accountId,
    event_type: params.eventType,
    contact_id: params.contactId,
    conversation_id: params.conversationId,
    metadata: params.metadata,
    created_at: new Date().toISOString(),
    status: "pending",
  };
  await addAuditOutboxItem(item);
  return id;
}

/**
 * Sync all pending audit events to the server.
 * Called when connectivity returns or on page load.
 * Returns the number of successfully synced events.
 */
export async function syncAuditOutbox(): Promise<number> {
  const pending = await getPendingAuditOutbox();
  if (pending.length === 0) return 0;

  let synced = 0;

  for (const item of pending) {
    try {
      const res = await fetch("/api/audit/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: item.event_type,
          contactId: item.contact_id,
          conversationId: item.conversation_id,
          metadata: item.metadata,
        }),
      });

      if (res.ok) {
        await deleteAuditOutboxItem(item.id);
        synced++;
      } else {
        await updateAuditOutboxItem(item.id, {
          status: "failed",
          error_message: `HTTP ${res.status}`,
        });
      }
    } catch {
      // Network error — leave as pending for next sync attempt
      await updateAuditOutboxItem(item.id, {
        status: "failed",
        error_message: "Network error",
      });
    }
  }

  return synced;
}

/**
 * Check if there are pending audit events waiting to sync.
 */
export async function hasPendingAuditEvents(): Promise<boolean> {
  const items = await getPendingAuditOutbox();
  return items.length > 0;
}
