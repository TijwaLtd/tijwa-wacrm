import { createClient } from "@/lib/supabase/client";
import {
  putConversations,
  putMessages,
  putContacts,
  putTags,
  putQuickReplies,
  putSyncState,
  getSyncState,
  putTenantMemberships,
  deleteConversation,
  deleteQuickReply,
  getAllConversations,
  getMessagesByConversation,
  type LocalConversation,
  type LocalMessage,
  type LocalContact,
  type LocalTag,
  type LocalQuickReply,
  type TenantMembership,
} from "@/lib/db";
import type { Conversation, Contact, Tag, QuickReply } from "@/types";

// ============================================================
// Sync Engine — Progressive synchronization of all authorized
// data from Supabase to the local IndexedDB.
//
// Strategy:
//   1. Determine authorized tenants (via RPC)
//   2. Sync conversations (paginated)
//   3. Sync messages per conversation (paginated, priority order)
//   4. Sync quick replies
//   5. Sync contacts & tags
//   6. Incremental sync on subsequent visits
//
// The sync engine does NOT block the UI. Data is read from
// IndexedDB first; sync populates in the background.
// ============================================================

const BATCH_SIZE = 100;
const MESSAGE_BATCH_SIZE = 200;

export type SyncStatus = "idle" | "syncing" | "error" | "complete";

export interface SyncProgress {
  status: SyncStatus;
  phase: string;
  synced: number;
  total: number;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * Full synchronization of all authorized data.
 * Safe to call multiple times — only syncs what's needed.
 */
export async function syncAll(
  userId: string,
  onProgress?: SyncProgressCallback
): Promise<void> {
  const supabase = createClient();

  onProgress?.({ status: "syncing", phase: "tenants", synced: 0, total: 0 });

  // 1. Determine authorized tenants
  const { data: memberships, error: memError } = await supabase.rpc(
    "get_user_accounts",
    { p_user_id: userId }
  );

  if (memError || !memberships) {
    console.error("[sync] Failed to fetch memberships:", memError);
    onProgress?.({ status: "error", phase: "tenants", synced: 0, total: 0 });
    return;
  }

  // Store memberships locally
  const tenantMemberships: TenantMembership[] = memberships.map(
    (m: Record<string, unknown>) => ({
      account_id: m.account_id as string,
      account_name: m.account_name as string,
      role: m.role as string,
      joined_at: m.joined_at as string,
    })
  );
  await putTenantMemberships(tenantMemberships);

  const tenantIds = tenantMemberships.map((m) => m.account_id);
  if (tenantIds.length === 0) {
    onProgress?.({ status: "complete", phase: "done", synced: 0, total: 0 });
    return;
  }

  // 2. Sync conversations (all tenants)
  await syncConversations(supabase, userId, tenantIds, onProgress);

  // 3. Sync messages for all conversations
  await syncAllMessages(supabase, tenantIds, onProgress);

  // 4. Sync quick replies
  await syncQuickReplies(supabase, tenantIds, onProgress);

  // 5. Sync contacts
  await syncContacts(supabase, userId, tenantIds, onProgress);

  // 6. Sync tags (global, tenant-scoped by user_id)
  await syncTags(supabase, userId, onProgress);

  onProgress?.({ status: "complete", phase: "done", synced: 0, total: 0 });
}

/**
 * Sync conversations from all authorized tenants.
 * Uses the get_user_conversations RPC for multi-tenant support.
 */
async function syncConversations(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tenantIds: string[],
  onProgress?: SyncProgressCallback
): Promise<void> {
  onProgress?.({ status: "syncing", phase: "conversations", synced: 0, total: 0 });

  // Use the RPC that returns conversations across all workspaces
  const { data, error } = await supabase.rpc("get_user_conversations", {
    p_user_id: userId,
  });

  if (error || !data) {
    console.error("[sync] Failed to fetch conversations:", error);
    return;
  }

  const convs: LocalConversation[] = (data as Record<string, unknown>[]).map(
    (c) => ({
      id: c.id as string,
      user_id: userId,
      account_id: c.account_id as string,
      contact_id: c.contact_id as string,
      status: c.status as Conversation["status"],
      assigned_agent_id: (c.assigned_agent_id as string) || undefined,
      last_message_text: (c.last_message_text as string) || undefined,
      last_message_at: (c.last_message_at as string) || undefined,
      unread_count: (c.unread_count as number) || 0,
      created_at: c.created_at as string,
      updated_at: c.updated_at as string,
      contact_name: (c.contact_name as string) || undefined,
      contact_phone: (c.contact_phone as string) || undefined,
      contact_company: (c.contact_company as string) || undefined,
    })
  );

  await putConversations(convs);

  // Mark conversations sync as complete for all tenants
  for (const tenantId of tenantIds) {
    await putSyncState({
      id: `${tenantId}:conversations`,
      tenant_id: tenantId,
      entity: "conversations",
      cursor: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      initial_sync_complete: true,
      synced_count: convs.filter((c) => c.account_id === tenantId).length,
    });
  }

  onProgress?.({
    status: "syncing",
    phase: "conversations",
    synced: convs.length,
    total: convs.length,
  });
}

/**
 * Sync messages for all locally stored conversations.
 * Priority: most recent conversations first, paginated.
 */
async function syncAllMessages(
  supabase: ReturnType<typeof createClient>,
  tenantIds: string[],
  onProgress?: SyncProgressCallback
): Promise<void> {
  const conversations = await getAllConversations();

  // Sort by last_message_at descending so recent conversations sync first
  const sorted = [...conversations].sort((a, b) => {
    const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bTime - aTime;
  });

  let totalSynced = 0;
  onProgress?.({
    status: "syncing",
    phase: "messages",
    synced: 0,
    total: sorted.length,
  });

  for (const conv of sorted) {
    await syncMessagesForConversation(supabase, conv.id);
    totalSynced++;
    if (totalSynced % 10 === 0) {
      onProgress?.({
        status: "syncing",
        phase: "messages",
        synced: totalSynced,
        total: sorted.length,
      });
    }
  }

  onProgress?.({
    status: "syncing",
    phase: "messages",
    synced: totalSynced,
    total: sorted.length,
  });
}

/**
 * Sync all messages for a single conversation, with pagination.
 */
async function syncMessagesForConversation(
  supabase: ReturnType<typeof createClient>,
  conversationId: string
): Promise<void> {
  // Check if we already have messages for this conversation
  const existingMessages = await getMessagesByConversation(conversationId);
  const existingIds = new Set(existingMessages.map((m) => m.id));

  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .range(offset, offset + MESSAGE_BATCH_SIZE - 1);

    if (error) {
      console.error(
        `[sync] Failed to fetch messages for conversation ${conversationId}:`,
        error
      );
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    const msgs: LocalMessage[] = data.map((m: Record<string, unknown>) => ({
      id: m.id as string,
      conversation_id: m.conversation_id as string,
      sender_type: m.sender_type as LocalMessage["sender_type"],
      sender_id: (m.sender_id as string) || undefined,
      content_type: m.content_type as LocalMessage["content_type"],
      content_text: (m.content_text as string) || undefined,
      media_url: (m.media_url as string) || undefined,
      template_name: (m.template_name as string) || undefined,
      message_id: (m.message_id as string) || undefined,
      status: m.status as LocalMessage["status"],
      created_at: m.created_at as string,
      reply_to_message_id: (m.reply_to_message_id as string) || undefined,
      interactive_reply_id: (m.interactive_reply_id as string) || undefined,
      interactive_payload: (m.interactive_payload as LocalMessage["interactive_payload"]) || undefined,
      ai_generated: (m.ai_generated as boolean) || undefined,
    }));

    // Only put new messages (don't overwrite local state for existing ones
    // that may have been updated by realtime)
    const newMsgs = msgs.filter((m) => !existingIds.has(m.id));
    if (newMsgs.length > 0) {
      await putMessages(newMsgs);
    }

    offset += data.length;
    hasMore = data.length === MESSAGE_BATCH_SIZE;
  }
}

/**
 * Sync quick replies for all authorized tenants.
 */
async function syncQuickReplies(
  supabase: ReturnType<typeof createClient>,
  tenantIds: string[],
  onProgress?: SyncProgressCallback
): Promise<void> {
  onProgress?.({ status: "syncing", phase: "quick_replies", synced: 0, total: 0 });

  const { data, error } = await supabase
    .from("quick_replies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.error("[sync] Failed to fetch quick replies:", error);
    return;
  }

  const qrs: LocalQuickReply[] = data as LocalQuickReply[];
  await putQuickReplies(qrs);

  for (const tenantId of tenantIds) {
    await putSyncState({
      id: `${tenantId}:quick_replies`,
      tenant_id: tenantId,
      entity: "quick_replies",
      cursor: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      initial_sync_complete: true,
      synced_count: qrs.filter((q) => q.account_id === tenantId).length,
    });
  }

  onProgress?.({
    status: "syncing",
    phase: "quick_replies",
    synced: qrs.length,
    total: qrs.length,
  });
}

/**
 * Sync contacts for all authorized tenants.
 */
async function syncContacts(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  tenantIds: string[],
  onProgress?: SyncProgressCallback
): Promise<void> {
  onProgress?.({ status: "syncing", phase: "contacts", synced: 0, total: 0 });

  const { data, error } = await supabase.rpc("get_user_contacts", {
    p_user_id: userId,
  });

  if (error || !data) {
    console.error("[sync] Failed to fetch contacts:", error);
    return;
  }

  const contacts: LocalContact[] = (data as Record<string, unknown>[]).map(
    (c) => ({
      id: c.id as string,
      user_id: userId,
      account_id: c.account_id as string,
      phone: c.phone as string,
      name: (c.name as string) || undefined,
      email: (c.email as string) || undefined,
      company: (c.company as string) || undefined,
      created_at: c.created_at as string,
      updated_at: c.updated_at as string,
    })
  );

  await putContacts(contacts);

  for (const tenantId of tenantIds) {
    await putSyncState({
      id: `${tenantId}:contacts`,
      tenant_id: tenantId,
      entity: "contacts",
      cursor: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      initial_sync_complete: true,
      synced_count: contacts.filter((c) => c.account_id === tenantId).length,
    });
  }

  onProgress?.({
    status: "syncing",
    phase: "contacts",
    synced: contacts.length,
    total: contacts.length,
  });
}

/**
 * Sync tags (owned by user, used across tenants).
 */
async function syncTags(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  onProgress?: SyncProgressCallback
): Promise<void> {
  onProgress?.({ status: "syncing", phase: "tags", synced: 0, total: 0 });

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", userId)
    .order("name");

  if (error || !data) {
    console.error("[sync] Failed to fetch tags:", error);
    return;
  }

  const tags: LocalTag[] = data as LocalTag[];
  await putTags(tags);

  onProgress?.({
    status: "syncing",
    phase: "tags",
    synced: tags.length,
    total: tags.length,
  });
}

/**
 * Incremental sync — only fetches changes since the last sync.
 * Called on reconnect, tab visibility change, or periodically.
 */
export async function incrementalSync(
  userId: string,
  onProgress?: SyncProgressCallback
): Promise<void> {
  const supabase = createClient();

  // Get current memberships
  const { data: memberships } = await supabase.rpc("get_user_accounts", {
    p_user_id: userId,
  });

  if (!memberships) return;

  const tenantIds = memberships.map((m: Record<string, unknown>) => m.account_id as string);

  // Re-sync conversations (lightweight — just the list)
  await syncConversations(supabase, userId, tenantIds, onProgress);

  // Re-sync messages for recently active conversations
  await syncAllMessages(supabase, tenantIds, onProgress);

  // Check for new quick replies
  await syncQuickReplies(supabase, tenantIds, onProgress);
}

/**
 * Sync a single conversation's messages (used when opening a thread).
 * Returns the messages from local DB first, then syncs in background.
 */
export async function syncConversationMessages(
  conversationId: string
): Promise<LocalMessage[]> {
  const supabase = createClient();

  // Fetch from server
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error || !data) {
    console.error("[sync] Failed to sync messages:", error);
    return getMessagesByConversation(conversationId);
  }

  const msgs: LocalMessage[] = data.map((m: Record<string, unknown>) => ({
    id: m.id as string,
    conversation_id: m.conversation_id as string,
    sender_type: m.sender_type as LocalMessage["sender_type"],
    sender_id: (m.sender_id as string) || undefined,
    content_type: m.content_type as LocalMessage["content_type"],
    content_text: (m.content_text as string) || undefined,
    media_url: (m.media_url as string) || undefined,
    template_name: (m.template_name as string) || undefined,
    message_id: (m.message_id as string) || undefined,
    status: m.status as LocalMessage["status"],
    created_at: m.created_at as string,
    reply_to_message_id: (m.reply_to_message_id as string) || undefined,
    interactive_reply_id: (m.interactive_reply_id as string) || undefined,
    interactive_payload: (m.interactive_payload as LocalMessage["interactive_payload"]) || undefined,
    ai_generated: (m.ai_generated as boolean) || undefined,
  }));

  await putMessages(msgs);
  return msgs;
}
