"use client";

import { useCallback, useRef } from "react";
import type { AuditEventTypeValue } from "@/lib/audit/events";

interface LogOptions {
  contactId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Frontend hook for logging audit events via POST /api/audit/events.
 * Includes deduplication to prevent duplicate events from re-renders.
 */
export function useAuditLogger() {
  const recentEvents = useRef(new Set<string>());

  const log = useCallback(
    async (eventType: AuditEventTypeValue, options: LogOptions = {}) => {
      const { contactId, conversationId, metadata } = options;

      // Dedup key: event type + contact/conversation ID, 5s TTL
      const key = `${eventType}:${contactId ?? conversationId ?? "none"}`;
      if (recentEvents.current.has(key)) return;
      recentEvents.current.add(key);
      setTimeout(() => recentEvents.current.delete(key), 5000);

      try {
        await fetch("/api/audit/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventType, contactId, conversationId, metadata }),
        });
      } catch {
        // Silently fail — audit should never block user actions
      }
    },
    [],
  );

  return { log };
}
