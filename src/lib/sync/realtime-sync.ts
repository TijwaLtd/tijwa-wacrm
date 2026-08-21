import { createClient } from "@/lib/supabase/client";
import {
  putConversation,
  putMessage,
  putQuickReplies,
  deleteConversation,
  deleteMessage,
  deleteQuickReply,
  type LocalConversation,
  type LocalMessage,
} from "@/lib/db";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ============================================================
// Realtime Sync — Writes Supabase Realtime events to IndexedDB
// so the local database stays fresh while online.
//
// This supplements (not replaces) the sync engine.
// If a Realtime event is missed (offline, tab throttled),
// the next incremental sync catches up.
// ============================================================

let channelRef: RealtimeChannel | null = null;

/**
 * Subscribe to Supabase Realtime and write changes to IndexedDB.
 * Should be called once after authentication completes.
 */
export function startRealtimeSync(userId: string): () => void {
  const supabase = createClient();

  // Clean up any existing subscription
  if (channelRef) {
    supabase.removeChannel(channelRef);
  }

  const channel = supabase
    .channel("local-first-sync")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "conversations" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const conv: LocalConversation = {
          id: row.id as string,
          user_id: userId,
          account_id: row.account_id as string,
          contact_id: row.contact_id as string,
          status: row.status as LocalConversation["status"],
          assigned_agent_id: (row.assigned_agent_id as string) || undefined,
          last_message_text: (row.last_message_text as string) || undefined,
          last_message_at: (row.last_message_at as string) || undefined,
          unread_count: (row.unread_count as number) || 0,
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        };
        putConversation(conv).catch(console.error);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "conversations" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const conv: LocalConversation = {
          id: row.id as string,
          user_id: userId,
          account_id: row.account_id as string,
          contact_id: row.contact_id as string,
          status: row.status as LocalConversation["status"],
          assigned_agent_id: (row.assigned_agent_id as string) || undefined,
          last_message_text: (row.last_message_text as string) || undefined,
          last_message_at: (row.last_message_at as string) || undefined,
          unread_count: (row.unread_count as number) || 0,
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        };
        putConversation(conv).catch(console.error);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "conversations" },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) {
          deleteConversation(old.id).catch(console.error);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        const msg: LocalMessage = {
          id: row.id as string,
          conversation_id: row.conversation_id as string,
          sender_type: row.sender_type as LocalMessage["sender_type"],
          sender_id: (row.sender_id as string) || undefined,
          content_type: row.content_type as LocalMessage["content_type"],
          content_text: (row.content_text as string) || undefined,
          media_url: (row.media_url as string) || undefined,
          template_name: (row.template_name as string) || undefined,
          message_id: (row.message_id as string) || undefined,
          status: row.status as LocalMessage["status"],
          created_at: row.created_at as string,
          reply_to_message_id: (row.reply_to_message_id as string) || undefined,
          interactive_reply_id: (row.interactive_reply_id as string) || undefined,
          interactive_payload: (row.interactive_payload as LocalMessage["interactive_payload"]) || undefined,
          ai_generated: (row.ai_generated as boolean) || undefined,
        };
        putMessage(msg).catch(console.error);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "messages" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        // Update the message in IndexedDB
        const msg: LocalMessage = {
          id: row.id as string,
          conversation_id: row.conversation_id as string,
          sender_type: row.sender_type as LocalMessage["sender_type"],
          sender_id: (row.sender_id as string) || undefined,
          content_type: row.content_type as LocalMessage["content_type"],
          content_text: (row.content_text as string) || undefined,
          media_url: (row.media_url as string) || undefined,
          template_name: (row.template_name as string) || undefined,
          message_id: (row.message_id as string) || undefined,
          status: row.status as LocalMessage["status"],
          created_at: row.created_at as string,
          reply_to_message_id: (row.reply_to_message_id as string) || undefined,
          interactive_reply_id: (row.interactive_reply_id as string) || undefined,
          interactive_payload: (row.interactive_payload as LocalMessage["interactive_payload"]) || undefined,
          ai_generated: (row.ai_generated as boolean) || undefined,
        };
        putMessage(msg).catch(console.error);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages" },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) {
          deleteMessage(old.id).catch(console.error);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "quick_replies" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        putQuickReplies([{
          id: row.id as string,
          account_id: row.account_id as string,
          user_id: row.user_id as string,
          title: row.title as string,
          kind: (row.kind as "text" | "interactive") || "text",
          content_text: (row.content_text as string) || undefined,
          interactive_payload: row.interactive_payload as LocalMessage["interactive_payload"],
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }]).catch(console.error);
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "quick_replies" },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        putQuickReplies([{
          id: row.id as string,
          account_id: row.account_id as string,
          user_id: row.user_id as string,
          title: row.title as string,
          kind: (row.kind as "text" | "interactive") || "text",
          content_text: (row.content_text as string) || undefined,
          interactive_payload: row.interactive_payload as LocalMessage["interactive_payload"],
          created_at: row.created_at as string,
          updated_at: row.updated_at as string,
        }]).catch(console.error);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "quick_replies" },
      (payload) => {
        const old = payload.old as { id?: string };
        if (old?.id) {
          deleteQuickReply(old.id).catch(console.error);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[realtime-sync] Subscribed to realtime changes");
      }
    });

  channelRef = channel;

  return () => {
    if (channelRef) {
      supabase.removeChannel(channelRef);
      channelRef = null;
    }
  };
}
