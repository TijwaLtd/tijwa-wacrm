/**
 * Offline-first knowledge document sync.
 *
 * Handles:
 * 1. Caching knowledge docs from the API to IndexedDB
 * 2. Queueing document uploads while offline
 * 3. Syncing pending uploads when connectivity returns
 */

import {
  getKnowledgeDocumentsByTenant,
  putKnowledgeDocument,
  putKnowledgeDocuments,
  putKnowledgeChunks,
  deleteKnowledgeDocument,
  getPendingKnowledgeOutbox,
  putKnowledgeOutboxItem,
  updateKnowledgeOutboxItem,
  deleteKnowledgeOutboxItem,
} from "@/lib/db";
import type {
  LocalKnowledgeDocument,
  LocalKnowledgeChunk,
  KnowledgeOutboxItem,
} from "@/lib/db/schema";

// ============================================================
// Cache knowledge documents from API to IndexedDB
// ============================================================

interface ApiDoc {
  id: string;
  title: string;
  content?: string;
  source_type?: string;
  file_path?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Sync a list of knowledge documents from the API into IndexedDB.
 * Called when the knowledge page fetches the document list.
 */
export async function cacheKnowledgeDocuments(
  accountId: string,
  docs: ApiDoc[]
): Promise<void> {
  const local: LocalKnowledgeDocument[] = docs.map((d) => ({
    id: d.id,
    account_id: accountId,
    title: d.title,
    content: d.content ?? "",
    source_type: (d.source_type as "text" | "file") ?? "text",
    file_path: d.file_path ?? null,
    created_at: d.created_at,
    updated_at: d.updated_at,
  }));
  await putKnowledgeDocuments(local);
}

/**
 * Cache a single knowledge document with its chunks.
 * Called after fetching a full document from the API.
 */
export async function cacheKnowledgeDocument(
  doc: LocalKnowledgeDocument,
  chunks?: { content: string; chunk_index: number }[]
): Promise<void> {
  await putKnowledgeDocument(doc);
  if (chunks && chunks.length > 0) {
    const localChunks: LocalKnowledgeChunk[] = chunks.map((c, i) => ({
      id: `${doc.id}:chunk:${c.chunk_index ?? i}`,
      document_id: doc.id,
      account_id: doc.account_id,
      chunk_index: c.chunk_index ?? i,
      content: c.content,
    }));
    await putKnowledgeChunks(localChunks);
  }
}

/**
 * Remove a document from the local cache.
 */
export async function removeCachedKnowledgeDocument(
  id: string
): Promise<void> {
  await deleteKnowledgeDocument(id);
}

// ============================================================
// Offline upload queue
// ============================================================

/**
 * Queue a knowledge document for upload while offline.
 * Returns the outbox item id for tracking.
 */
export async function queueKnowledgeUpload(params: {
  accountId: string;
  title: string;
  content: string;
  sourceType: "text" | "file";
  fileData?: Blob;
  fileName?: string;
  fileMime?: string;
}): Promise<string> {
  const id = crypto.randomUUID();
  const item: KnowledgeOutboxItem = {
    id,
    account_id: params.accountId,
    title: params.title,
    content: params.content,
    source_type: params.sourceType,
    file_data: params.fileData,
    file_name: params.fileName,
    file_mime: params.fileMime,
    created_at: new Date().toISOString(),
    status: "pending",
  };

  // Also cache the document locally so it appears in the UI immediately
  const localDoc: LocalKnowledgeDocument = {
    id,
    account_id: params.accountId,
    title: params.title,
    content: params.content,
    source_type: params.sourceType,
    file_path: null,
    created_at: item.created_at,
    updated_at: item.created_at,
  };
  await putKnowledgeDocument(localDoc);
  await putKnowledgeOutboxItem(item);

  return id;
}

/**
 * Sync all pending knowledge uploads to the server.
 * Called when connectivity returns or on page load if online.
 */
export async function syncKnowledgeOutbox(): Promise<{
  synced: number;
  failed: number;
}> {
  const pending = await getPendingKnowledgeOutbox();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await updateKnowledgeOutboxItem(item.id, { status: "uploading" });

      if (item.file_data && item.file_name) {
        // File upload: use FormData
        const formData = new FormData();
        formData.append("file", item.file_data, item.file_name);
        formData.append("title", item.title);

        const res = await fetch("/api/ai/knowledge/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Upload failed");
        }

        const data = await res.json();
        // Update the local doc with the server-assigned id if different
        if (data.id && data.id !== item.id) {
          const existing = await import("@/lib/db").then((m) =>
            m.getKnowledgeDocumentById(item.id)
          );
          if (existing) {
            // Delete old entry, create with server id
            await deleteKnowledgeDocument(item.id);
            await putKnowledgeDocument({ ...existing, id: data.id });
          }
        }
      } else {
        // Text document: use JSON API
        const res = await fetch("/api/ai/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            content: item.content,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Save failed");
        }

        const data = await res.json();
        if (data.id && data.id !== item.id) {
          const existing = await import("@/lib/db").then((m) =>
            m.getKnowledgeDocumentById(item.id)
          );
          if (existing) {
            await deleteKnowledgeDocument(item.id);
            await putKnowledgeDocument({ ...existing, id: data.id });
          }
        }
      }

      await deleteKnowledgeOutboxItem(item.id);
      synced++;
    } catch (err) {
      console.error("[knowledge outbox] sync failed:", err);
      await updateKnowledgeOutboxItem(item.id, {
        status: "failed",
        error_message: err instanceof Error ? err.message : "Unknown error",
      });
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Retry a failed knowledge outbox item.
 */
export async function retryKnowledgeOutboxItem(id: string): Promise<void> {
  await updateKnowledgeOutboxItem(id, {
    status: "pending",
    error_message: undefined,
  });
}

/**
 * Delete a knowledge outbox item and its cached document.
 */
export async function cancelKnowledgeOutboxItem(id: string): Promise<void> {
  await deleteKnowledgeOutboxItem(id);
  await deleteKnowledgeDocument(id);
}
