import Dexie, { type EntityTable } from "dexie";
import type {
  Conversation,
  Message,
  Contact,
  Tag,
  QuickReply,
  InteractiveMessagePayload,
} from "@/types";

// ============================================================
// IndexedDB schema for local-first WhatsApp messaging.
//
// Every tenant-scoped entity carries `account_id` so the local
// database can contain conversations from ALL authorized tenants
// without cross-tenant leakage.
// ============================================================

export interface LocalConversation extends Conversation {
  /** Denormalized contact data for quick list rendering without joins */
  contact_name?: string;
  contact_phone?: string;
  contact_company?: string;
}

export interface LocalMessage extends Message {
  /** Client-generated UUID for idempotent sends */
  client_message_id?: string;
}

export type LocalContact = Contact;

export type LocalTag = Tag;

export type LocalQuickReply = QuickReply;

/**
 * An attachment stored locally for offline file sending.
 * The actual file bytes live in IndexedDB; when connectivity
 * returns the outbox uploads them to Supabase Storage, then
 * sends the WhatsApp message with the resulting public URL.
 */
export interface LocalAttachment {
  id: string;
  /** The outbox item this attachment belongs to */
  outbox_id: string;
  tenant_id: string;
  conversation_id: string;
  /** Original filename */
  filename: string;
  /** MIME type */
  mime_type: string;
  /** File size in bytes */
  size: number;
  /** The actual file data as a Blob */
  data: Blob;
  /** Media kind for WhatsApp: image, video, document, audio */
  kind: "image" | "video" | "document" | "audio";
  /** Caption typed by the user (image/video/document only) */
  caption?: string;
  /** After upload, this is set to the public URL */
  uploaded_url?: string;
  /** After upload, this is set to the storage path */
  uploaded_path?: string;
  created_at: string;
  status: "pending" | "uploading" | "uploaded" | "failed";
}

/**
 * An outgoing message queued for delivery.
 * Captures ALL context at creation time so the worker
 * can process it independently of UI state.
 */
export interface OutboxItem {
  id: string;
  /** Immutable tenant context captured at creation */
  tenant_id: string;
  /** Immutable conversation context captured at creation */
  conversation_id: string;
  /** Client-generated idempotency key */
  client_message_id: string;
  /** The local message id this outbox item corresponds to */
  local_message_id: string;
  /** Message type: text, image, video, document, audio, template, interactive */
  message_type: string;
  /** Text content */
  content_text?: string;
  /** Template name (for template messages) */
  template_name?: string;
  /** Template language */
  template_language?: string;
  /** Template params */
  template_params?: string[];
  /** Structured template params */
  template_message_params?: unknown;
  /** Interactive payload */
  interactive_payload?: InteractiveMessagePayload;
  /** Reply-to message id */
  reply_to_message_id?: string;
  /** If this outbox item has an attachment, its id */
  attachment_id?: string;
  /** Created timestamp */
  created_at: string;
  /** Number of send attempts */
  attempt_count: number;
  /** Last attempt timestamp */
  last_attempt_at?: string;
  /** Current status */
  status: "pending" | "uploading" | "sending" | "sent" | "failed";
  /** Error message if failed */
  error_message?: string;
  /** Whether the failure is permanent (no retry) */
  permanent_failure: boolean;
}

/**
 * Tracks synchronization state per entity type per tenant.
 * Used for incremental sync after the initial full sync.
 */
export interface SyncState {
  id: string;
  /** Tenant/account id */
  tenant_id: string;
  /** Entity type: conversations, messages, quick_replies, contacts, tags */
  entity: string;
  /** Cursor/timestamp for the last successful sync */
  cursor: string;
  /** ISO timestamp of last sync */
  last_synced_at: string;
  /** Whether initial sync is complete */
  initial_sync_complete: boolean;
  /** Total records synced so far (for progress tracking) */
  synced_count: number;
}

/**
 * Stores the current user's membership info for quick access.
 */
export interface TenantMembership {
  account_id: string;
  account_name: string;
  role: string;
  joined_at: string;
}

// ============================================================
// Knowledge base — offline-first document cache
// ============================================================

/**
 * A cached knowledge document. Content is stored locally so the
 * knowledge page loads instantly and the AI retrieval pipeline
 * can search offline.
 */
export interface LocalKnowledgeDocument {
  id: string;
  account_id: string;
  title: string;
  /** Full extracted text content */
  content: string;
  source_type: "text" | "file";
  /** Storage path on Supabase (null for text-only docs) */
  file_path: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A cached knowledge chunk for offline retrieval.
 */
export interface LocalKnowledgeChunk {
  id: string;
  document_id: string;
  account_id: string;
  chunk_index: number;
  content: string;
}

/**
 * An outbox item for knowledge documents created while offline.
 * Synced to the server when connectivity returns.
 */
export interface KnowledgeOutboxItem {
  id: string;
  account_id: string;
  title: string;
  content: string;
  source_type: "text" | "file";
  /** Original file bytes (for file uploads) */
  file_data?: Blob;
  file_name?: string;
  file_mime?: string;
  created_at: string;
  status: "pending" | "uploading" | "synced" | "failed";
  error_message?: string;
}

// ============================================================
// Audit outbox — offline-first audit event queue
// ============================================================

/**
 * An audit event queued while offline.
 * Synced to POST /api/audit/events when connectivity returns.
 */
export interface AuditOutboxItem {
  id: string;
  account_id: string;
  event_type: string;
  contact_id?: string;
  conversation_id?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  status: "pending" | "synced" | "failed";
  error_message?: string;
}

// ============================================================
// Database definition
// ============================================================

const DB_NAME = "wacrm-local";

export const db = new Dexie(DB_NAME) as Dexie & {
  conversations: EntityTable<LocalConversation, "id">;
  messages: EntityTable<LocalMessage, "id">;
  contacts: EntityTable<LocalContact, "id">;
  tags: EntityTable<LocalTag, "id">;
  quick_replies: EntityTable<LocalQuickReply, "id">;
  attachments: EntityTable<LocalAttachment, "id">;
  outbox: EntityTable<OutboxItem, "id">;
  sync_state: EntityTable<SyncState, "id">;
  tenant_memberships: EntityTable<TenantMembership, "account_id">;
  knowledge_documents: EntityTable<LocalKnowledgeDocument, "id">;
  knowledge_chunks: EntityTable<LocalKnowledgeChunk, "id">;
  knowledge_outbox: EntityTable<KnowledgeOutboxItem, "id">;
  audit_outbox: EntityTable<AuditOutboxItem, "id">;
};

// Schema version 1: initial local-first schema
db.version(1).stores({
  // conversations: indexed by id (primary), account_id (tenant filter),
  // contact_id (join), last_message_at (sorting), status (filtering)
  conversations:
    "id, account_id, contact_id, last_message_at, status, assigned_agent_id",

  // messages: indexed by id (primary), conversation_id (per-thread fetch),
  // created_at (ordering), message_id (Meta idempotency), client_message_id
  messages:
    "id, conversation_id, created_at, message_id, client_message_id, sender_type, status",

  // contacts: indexed by id (primary), account_id (tenant filter), phone
  contacts: "id, account_id, phone, phone_normalized",

  // tags: indexed by id (primary), user_id
  tags: "id, user_id",

  // quick_replies: indexed by id (primary), account_id (tenant filter)
  quick_replies: "id, account_id, user_id",

  // attachments: indexed by id (primary), outbox_id (join), tenant_id, conversation_id
  attachments: "id, outbox_id, tenant_id, conversation_id, status",

  // outbox: indexed by id (primary), tenant_id, conversation_id,
  // status (pending items), client_message_id (dedup), created_at (ordering)
  outbox:
    "id, tenant_id, conversation_id, status, client_message_id, created_at",

  // sync_state: indexed by id (primary), composite [tenant_id + entity] for lookup
  sync_state: "id, [tenant_id+entity]",

  // tenant_memberships: indexed by account_id (primary key)
  tenant_memberships: "account_id",
});

// Schema version 2: knowledge base tables
db.version(2).stores({
  // knowledge_documents: indexed by id (primary), account_id (tenant filter)
  knowledge_documents: "id, account_id, updated_at",

  // knowledge_chunks: indexed by id (primary), document_id (join),
  // account_id (tenant filter)
  knowledge_chunks: "id, document_id, account_id",

  // knowledge_outbox: pending uploads while offline
  knowledge_outbox: "id, account_id, status, created_at",
});

// Schema version 3: audit outbox for offline event queueing
db.version(3).stores({
  // audit_outbox: pending audit events while offline
  audit_outbox: "id, account_id, status, created_at",
});
