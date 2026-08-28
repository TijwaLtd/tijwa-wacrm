import { db } from "./schema";
import type {
  LocalConversation,
  LocalMessage,
  LocalContact,
  LocalQuickReply,
  LocalTag,
  OutboxItem,
  SyncState,
  TenantMembership,
  LocalAttachment,
  LocalKnowledgeDocument,
  LocalKnowledgeChunk,
  KnowledgeOutboxItem,
} from "./schema";

export type {
  LocalConversation,
  LocalMessage,
  LocalContact,
  LocalQuickReply,
  LocalTag,
  OutboxItem,
  SyncState,
  TenantMembership,
  LocalAttachment,
  LocalKnowledgeDocument,
  LocalKnowledgeChunk,
  KnowledgeOutboxItem,
};

// ============================================================
// Data access layer for the local IndexedDB.
//
// All reads go through IndexedDB first for instant UI.
// Writes persist to IndexedDB before attempting network.
// ============================================================

// ---- Conversations ----

export async function getAllConversations(): Promise<LocalConversation[]> {
  return db.conversations.orderBy("last_message_at").reverse().toArray();
}

export async function getConversationsByTenant(
  accountId: string
): Promise<LocalConversation[]> {
  return db.conversations
    .where("account_id")
    .equals(accountId)
    .reverse()
    .sortBy("last_message_at");
}

export async function getConversationById(
  id: string
): Promise<LocalConversation | undefined> {
  return db.conversations.get(id);
}

export async function putConversation(conv: LocalConversation): Promise<void> {
  await db.conversations.put(conv);
}

export async function putConversations(
  convs: LocalConversation[]
): Promise<void> {
  await db.conversations.bulkPut(convs);
}

export async function deleteConversation(id: string): Promise<void> {
  await db.conversations.delete(id);
}

// ---- Messages ----

export async function getMessagesByConversation(
  conversationId: string
): Promise<LocalMessage[]> {
  return db.messages
    .where("conversation_id")
    .equals(conversationId)
    .sortBy("created_at");
}

export async function getMessageById(id: string): Promise<LocalMessage | undefined> {
  return db.messages.get(id);
}

export async function putMessage(msg: LocalMessage): Promise<void> {
  await db.messages.put(msg);
}

export async function putMessages(msgs: LocalMessage[]): Promise<void> {
  await db.messages.bulkPut(msgs);
}

export async function updateMessage(
  id: string,
  updates: Partial<LocalMessage>
): Promise<void> {
  const existing = await db.messages.get(id);
  if (existing) {
    await db.messages.put({ ...existing, ...updates });
  }
}

export async function deleteMessage(id: string): Promise<void> {
  await db.messages.delete(id);
}

// ---- Contacts ----

export async function getContactsByTenant(
  accountId: string
): Promise<LocalContact[]> {
  return db.contacts.where("account_id").equals(accountId).toArray();
}

export async function putContact(contact: LocalContact): Promise<void> {
  await db.contacts.put(contact);
}

export async function putContacts(contacts: LocalContact[]): Promise<void> {
  await db.contacts.bulkPut(contacts);
}

// ---- Tags ----

export async function getAllTags(): Promise<LocalTag[]> {
  return db.tags.toArray();
}

export async function putTags(tags: LocalTag[]): Promise<void> {
  await db.tags.bulkPut(tags);
}

// ---- Quick Replies ----

export async function getQuickRepliesByTenant(
  accountId: string
): Promise<LocalQuickReply[]> {
  return db.quick_replies.where("account_id").equals(accountId).toArray();
}

export async function getAllQuickReplies(): Promise<LocalQuickReply[]> {
  return db.quick_replies.toArray();
}

export async function putQuickReplies(qrs: LocalQuickReply[]): Promise<void> {
  await db.quick_replies.bulkPut(qrs);
}

export async function deleteQuickReply(id: string): Promise<void> {
  await db.quick_replies.delete(id);
}

// ---- Outbox ----

export async function getOutboxItems(): Promise<OutboxItem[]> {
  return db.outbox.orderBy("created_at").toArray();
}

export async function getPendingOutboxItems(): Promise<OutboxItem[]> {
  return db.outbox
    .where("status")
    .anyOf(["pending", "uploading"])
    .toArray();
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  return db.outbox.get(id);
}

export async function putOutboxItem(item: OutboxItem): Promise<void> {
  await db.outbox.put(item);
}

export async function updateOutboxItem(
  id: string,
  updates: Partial<OutboxItem>
): Promise<void> {
  const existing = await db.outbox.get(id);
  if (existing) {
    await db.outbox.put({ ...existing, ...updates });
  }
}

export async function deleteOutboxItem(id: string): Promise<void> {
  await db.outbox.delete(id);
}

/**
 * Check if a message with the given client_message_id has already
 * been sent (to prevent duplicate sends).
 */
export async function outboxHasClientMessage(
  clientMessageId: string
): Promise<boolean> {
  const count = await db.outbox
    .where("client_message_id")
    .equals(clientMessageId)
    .count();
  return count > 0;
}

// ---- Attachments ----

export async function getAttachment(id: string): Promise<LocalAttachment | undefined> {
  return db.attachments.get(id);
}

export async function getAttachmentsByOutbox(
  outboxId: string
): Promise<LocalAttachment[]> {
  return db.attachments.where("outbox_id").equals(outboxId).toArray();
}

export async function putAttachment(att: LocalAttachment): Promise<void> {
  await db.attachments.put(att);
}

export async function updateAttachment(
  id: string,
  updates: Partial<LocalAttachment>
): Promise<void> {
  const existing = await db.attachments.get(id);
  if (existing) {
    await db.attachments.put({ ...existing, ...updates });
  }
}

// ---- Sync State ----

export async function getSyncState(
  tenantId: string,
  entity: string
): Promise<SyncState | undefined> {
  const id = `${tenantId}:${entity}`;
  return db.sync_state.get(id);
}

export async function putSyncState(state: SyncState): Promise<void> {
  await db.sync_state.put(state);
}

// ---- Knowledge Documents ----

export async function getKnowledgeDocumentsByTenant(
  accountId: string
): Promise<LocalKnowledgeDocument[]> {
  return db.knowledge_documents
    .where("account_id")
    .equals(accountId)
    .reverse()
    .sortBy("updated_at");
}

export async function getKnowledgeDocumentById(
  id: string
): Promise<LocalKnowledgeDocument | undefined> {
  return db.knowledge_documents.get(id);
}

export async function putKnowledgeDocument(
  doc: LocalKnowledgeDocument
): Promise<void> {
  await db.knowledge_documents.put(doc);
}

export async function putKnowledgeDocuments(
  docs: LocalKnowledgeDocument[]
): Promise<void> {
  await db.knowledge_documents.bulkPut(docs);
}

export async function deleteKnowledgeDocument(id: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.knowledge_documents, db.knowledge_chunks],
    async () => {
      await db.knowledge_documents.delete(id);
      await db.knowledge_chunks.where("document_id").equals(id).delete();
    }
  );
}

// ---- Knowledge Chunks ----

export async function getKnowledgeChunksByDocument(
  documentId: string
): Promise<LocalKnowledgeChunk[]> {
  return db.knowledge_chunks
    .where("document_id")
    .equals(documentId)
    .sortBy("chunk_index");
}

export async function getKnowledgeChunksByTenant(
  accountId: string
): Promise<LocalKnowledgeChunk[]> {
  return db.knowledge_chunks.where("account_id").equals(accountId).toArray();
}

export async function putKnowledgeChunks(
  chunks: LocalKnowledgeChunk[]
): Promise<void> {
  await db.knowledge_chunks.bulkPut(chunks);
}

export async function deleteKnowledgeChunksByDocument(
  documentId: string
): Promise<void> {
  await db.knowledge_chunks
    .where("document_id")
    .equals(documentId)
    .delete();
}

// ---- Knowledge Outbox (offline uploads) ----

export async function getPendingKnowledgeOutbox(): Promise<KnowledgeOutboxItem[]> {
  return db.knowledge_outbox
    .where("status")
    .anyOf(["pending", "uploading"])
    .toArray();
}

export async function getKnowledgeOutboxItem(
  id: string
): Promise<KnowledgeOutboxItem | undefined> {
  return db.knowledge_outbox.get(id);
}

export async function putKnowledgeOutboxItem(
  item: KnowledgeOutboxItem
): Promise<void> {
  await db.knowledge_outbox.put(item);
}

export async function updateKnowledgeOutboxItem(
  id: string,
  updates: Partial<KnowledgeOutboxItem>
): Promise<void> {
  const existing = await db.knowledge_outbox.get(id);
  if (existing) {
    await db.knowledge_outbox.put({ ...existing, ...updates });
  }
}

export async function deleteKnowledgeOutboxItem(id: string): Promise<void> {
  await db.knowledge_outbox.delete(id);
}

// ---- Tenant Memberships ----

export async function getTenantMemberships(): Promise<TenantMembership[]> {
  return db.tenant_memberships.toArray();
}

export async function putTenantMemberships(
  memberships: TenantMembership[]
): Promise<void> {
  await db.tenant_memberships.bulkPut(memberships);
}

// ---- Utility ----

/**
 * Clear all local data for a specific tenant.
 * Used when a user is removed from a workspace.
 */
export async function clearTenantData(tenantId: string): Promise<void> {
  await db.transaction(
    "rw",
    [db.conversations, db.messages, db.contacts, db.quick_replies, db.outbox, db.attachments, db.sync_state, db.knowledge_documents, db.knowledge_chunks, db.knowledge_outbox],
    async () => {
      // Collect conversation IDs BEFORE deleting conversations
      const convIds = await db.conversations
        .where("account_id")
        .equals(tenantId)
        .primaryKeys();

      // Delete messages linked to those conversations
      if (convIds.length > 0) {
        await db.messages.where("conversation_id").anyOf(convIds).delete();
      }

      // Now delete conversations
      await db.conversations.where("account_id").equals(tenantId).delete();
      await db.contacts.where("account_id").equals(tenantId).delete();
      await db.quick_replies.where("account_id").equals(tenantId).delete();
      await db.outbox.where("tenant_id").equals(tenantId).delete();
      await db.attachments.where("tenant_id").equals(tenantId).delete();
      const syncIds = (await db.sync_state.toArray())
        .filter((s) => s.tenant_id === tenantId)
        .map((s) => s.id);
      await db.sync_state.bulkDelete(syncIds);

      // Knowledge
      await db.knowledge_documents.where("account_id").equals(tenantId).delete();
      await db.knowledge_chunks.where("account_id").equals(tenantId).delete();
      await db.knowledge_outbox.where("account_id").equals(tenantId).delete();
    }
  );
}

/**
 * Get the total number of locally stored records for diagnostics.
 */
export async function getLocalStats(): Promise<{
  conversations: number;
  messages: number;
  contacts: number;
  quickReplies: number;
  outboxPending: number;
  knowledgeDocuments: number;
  knowledgeOutboxPending: number;
}> {
  const [conversations, messages, contacts, quickReplies, outboxPending, knowledgeDocuments, knowledgeOutboxPending] =
    await Promise.all([
      db.conversations.count(),
      db.messages.count(),
      db.contacts.count(),
      db.quick_replies.count(),
      db.outbox.where("status").anyOf(["pending", "uploading"]).count(),
      db.knowledge_documents.count(),
      db.knowledge_outbox.where("status").anyOf(["pending", "uploading"]).count(),
    ]);
  return { conversations, messages, contacts, quickReplies, outboxPending, knowledgeDocuments, knowledgeOutboxPending };
}
