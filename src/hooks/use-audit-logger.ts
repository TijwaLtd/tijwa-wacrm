"use client";

import { useCallback, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { queueAuditEvent, syncAuditOutbox } from "@/lib/sync/audit-sync";
import type { AuditEventTypeValue } from "@/lib/audit/events";

interface LogOptions {
  contactId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Frontend hook for logging audit events.
 * Supports offline: queues to IndexedDB, syncs when online.
 * Includes deduplication to prevent duplicate events from re-renders.
 */
export function useAuditLogger() {
  const { accountId } = useAuth();
  const recentEvents = useRef(new Set<string>());

  // Sync pending audit events on mount and when online
  useEffect(() => {
    if (!accountId) return;

    // Try sync on mount
    syncAuditOutbox().catch(() => {});

    // Sync when coming back online
    const handleOnline = () => {
      syncAuditOutbox().catch(() => {});
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [accountId]);

  const log = useCallback(
    async (eventType: AuditEventTypeValue, options: LogOptions = {}) => {
      const { contactId, conversationId, metadata } = options;

      // Dedup key: event type + contact/conversation ID, 5s TTL
      const key = `${eventType}:${contactId ?? conversationId ?? "none"}`;
      if (recentEvents.current.has(key)) return;
      recentEvents.current.add(key);
      setTimeout(() => recentEvents.current.delete(key), 5000);

      if (!accountId) return;

      // Queue to IndexedDB (works offline)
      await queueAuditEvent({
        accountId,
        eventType,
        contactId,
        conversationId,
        metadata,
      });

      // If online, try to sync immediately
      if (navigator.onLine) {
        syncAuditOutbox().catch(() => {});
      }
    },
    [accountId],
  );

  return { log };
}
