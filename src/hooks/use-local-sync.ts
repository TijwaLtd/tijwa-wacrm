"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { syncAll, incrementalSync, type SyncProgress } from "@/lib/sync/sync-engine";
import { startRealtimeSync } from "@/lib/sync/realtime-sync";
import { processOutbox, isOnline } from "@/lib/outbox/outbox";
import { getLocalStats, getConversationById, type OutboxItem, type LocalAttachment } from "@/lib/db";
import { createClient } from "@/lib/supabase/client";

// ============================================================
// useLocalSync — Orchestrates the local-first sync lifecycle.
//
// On mount (after auth):
//   1. Load data from IndexedDB (instant)
//   2. Start background sync from Supabase
//   3. Subscribe to Realtime
//   4. Process outbox when online
//   5. Listen for connectivity changes
//
// Returns:
//   - syncProgress: current sync status
//   - isSynced: whether initial sync is complete
//   - outboxCount: number of pending outbox items
//   - triggerSync: manually trigger a sync
//   - processPendingOutbox: manually trigger outbox processing
// ============================================================

export interface LocalSyncState {
  syncProgress: SyncProgress;
  isSynced: boolean;
  outboxCount: number;
  stats: {
    conversations: number;
    messages: number;
    contacts: number;
    quickReplies: number;
  };
  triggerSync: () => void;
  processPendingOutbox: () => void;
}

export function useLocalSync(): LocalSyncState {
  const { user, activeAccountId } = useAuth();
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    status: "idle",
    phase: "",
    synced: 0,
    total: 0,
  });
  const [isSynced, setIsSynced] = useState(false);
  const [outboxCount, setOutboxCount] = useState(0);
  const [stats, setStats] = useState({
    conversations: 0,
    messages: 0,
    contacts: 0,
    quickReplies: 0,
  });

  const syncStartedRef = useRef(false);
  const realtimeCleanupRef = useRef<(() => void) | null>(null);

  // Update stats
  const refreshStats = useCallback(async () => {
    try {
      const s = await getLocalStats();
      setStats({
        conversations: s.conversations,
        messages: s.messages,
        contacts: s.contacts,
        quickReplies: s.quickReplies,
      });
      setOutboxCount(s.outboxPending);
    } catch {
      // IndexedDB might not be available
    }
  }, []);

  // Process outbox — send pending messages
  const processPendingOutbox = useCallback(async () => {
    if (!isOnline()) return;

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) return;

    const sendFn = async (
      item: OutboxItem,
      attachment?: LocalAttachment
    ) => {
      // Load the conversation and contact from local DB
      const conv = await getConversationById(item.conversation_id);
      if (!conv) throw new Error("Conversation not found locally");

      // If this is a media message with a local attachment, upload it first
      let mediaUrl: string | undefined;
      if (attachment && !attachment.uploaded_url) {
        // Upload the attachment to Supabase Storage
        const { uploadAccountMedia } = await import("@/lib/storage/upload-media");
        const file = new File(
          [attachment.data],
          attachment.filename,
          { type: attachment.mime_type }
        );
        const { publicUrl, path } = await uploadAccountMedia("chat-media", file);
        mediaUrl = publicUrl;

        // Update attachment with upload info
        const { updateAttachment } = await import("@/lib/db");
        await updateAttachment(attachment.id, {
          uploaded_url: publicUrl,
          uploaded_path: path,
          status: "uploaded",
        });
      } else if (attachment?.uploaded_url) {
        mediaUrl = attachment.uploaded_url;
      }

      // Use the server-side send function
      // The server validates auth, tenancy, 24h window, etc.
      const body: Record<string, unknown> = {
        conversation_id: item.conversation_id,
        message_type: item.message_type,
      };

      if (item.content_text) body.content_text = item.content_text;
      if (item.template_name) body.template_name = item.template_name;
      if (item.template_language) body.template_language = item.template_language;
      if (item.template_params) body.template_params = item.template_params;
      if (item.template_message_params)
        body.template_message_params = item.template_message_params;
      if (item.interactive_payload)
        body.interactive_payload = item.interactive_payload;
      if (item.reply_to_message_id)
        body.reply_to_message_id = item.reply_to_message_id;

      // For media messages, include the uploaded URL
      if (mediaUrl) {
        body.media_url = mediaUrl;
        if (attachment?.filename) body.filename = attachment.filename;
      }

      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      return {
        messageId: data.message_id as string,
        whatsappMessageId: data.whatsapp_message_id as string,
      };
    };

    const result = await processOutbox(sendFn);
    if (result.sent > 0 || result.failed > 0) {
      await refreshStats();
    }
  }, [refreshStats]);

  // Trigger a full sync
  const triggerSync = useCallback(() => {
    if (!user?.id) return;
    setSyncProgress({ status: "syncing", phase: "starting", synced: 0, total: 0 });

    syncAll(user.id, setSyncProgress)
      .then(async () => {
        setIsSynced(true);
        await refreshStats();
      })
      .catch((err) => {
        console.error("[useLocalSync] Sync failed:", err);
        setSyncProgress({ status: "error", phase: "error", synced: 0, total: 0 });
      });
  }, [user?.id, refreshStats]);

  // Initial sync on mount
  useEffect(() => {
    if (!user?.id || syncStartedRef.current) return;
    syncStartedRef.current = true;

    // Start sync immediately
    triggerSync();
  }, [user?.id, triggerSync]);

  // Start Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    realtimeCleanupRef.current = startRealtimeSync(user.id);

    return () => {
      realtimeCleanupRef.current?.();
      realtimeCleanupRef.current = null;
    };
  }, [user?.id]);

  // Process outbox when coming online
  useEffect(() => {
    const handleOnline = () => {
      processPendingOutbox();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [processPendingOutbox]);

  // Incremental sync on visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user?.id && isSynced) {
        incrementalSync(user.id, setSyncProgress).then(refreshStats);
        processPendingOutbox();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id, isSynced, refreshStats, processPendingOutbox]);

  // Process outbox periodically (every 30s when online)
  useEffect(() => {
    if (!isSynced) return;

    const interval = setInterval(() => {
      if (isOnline()) {
        processPendingOutbox();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [isSynced, processPendingOutbox]);

  // Refresh stats when active tenant changes
  useEffect(() => {
    refreshStats();
  }, [activeAccountId, refreshStats]);

  return {
    syncProgress,
    isSynced,
    outboxCount,
    stats,
    triggerSync,
    processPendingOutbox,
  };
}
