import {
  putOutboxItem,
  updateOutboxItem,
  getPendingOutboxItems,
  getOutboxItem,

  putMessage,
  updateMessage,
  putAttachment,
  getAttachment,
  updateAttachment,
  deleteOutboxItem,
  deleteMessage,
  type OutboxItem,
  type LocalMessage,
  type LocalAttachment,
} from "@/lib/db";
import type { InteractiveMessagePayload } from "@/types";

// ============================================================
// Outbox — Offline message queue with idempotent delivery.
//
// Flow:
//   1. User sends message → create local message (status: queued)
//   2. Create outbox item with full immutable context
//   3. If online, attempt send immediately
//   4. If offline, item waits in IndexedDB
//   5. On reconnect / visibility change, process pending items
//   6. Server validates + sends via Meta
//   7. Update local message with server result
//
// Every outbox item captures:
//   - tenant_id (immutable)
//   - conversation_id (immutable)
//   - client_message_id (idempotency key)
//   - All message params
// ============================================================

/**
 * Generate a unique client message ID for idempotency.
 * Uses crypto.randomUUID when available, fallback to timestamp+random.
 */
export function generateClientMessageId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Queue a text message for sending.
 * Creates both the local message and the outbox item.
 */
export async function queueTextMessage(params: {
  tenantId: string;
  conversationId: string;
  contentText: string;
  replyToMessageId?: string;
}): Promise<{ localMessage: LocalMessage; outboxItem: OutboxItem }> {
  const clientMessageId = generateClientMessageId();
  const localMessageId = generateClientMessageId();

  const localMessage: LocalMessage = {
    id: localMessageId,
    conversation_id: params.conversationId,
    sender_type: "agent",
    content_type: "text",
    content_text: params.contentText,
    status: "sending",
    created_at: new Date().toISOString(),
    reply_to_message_id: params.replyToMessageId,
    client_message_id: clientMessageId,
  };

  const outboxItem: OutboxItem = {
    id: generateClientMessageId(),
    tenant_id: params.tenantId,
    conversation_id: params.conversationId,
    client_message_id: clientMessageId,
    local_message_id: localMessageId,
    message_type: "text",
    content_text: params.contentText,
    reply_to_message_id: params.replyToMessageId,
    created_at: new Date().toISOString(),
    attempt_count: 0,
    status: "pending",
    permanent_failure: false,
  };

  // Persist to IndexedDB
  await putMessage(localMessage);
  await putOutboxItem(outboxItem);

  return { localMessage, outboxItem };
}

/**
 * Queue a template message for sending.
 */
export async function queueTemplateMessage(params: {
  tenantId: string;
  conversationId: string;
  renderedBody: string;
  templateName: string;
  templateLanguage: string;
  templateParams: string[];
  templateMessageParams?: unknown;
}): Promise<{ localMessage: LocalMessage; outboxItem: OutboxItem }> {
  const clientMessageId = generateClientMessageId();
  const localMessageId = generateClientMessageId();

  const localMessage: LocalMessage = {
    id: localMessageId,
    conversation_id: params.conversationId,
    sender_type: "agent",
    content_type: "template",
    content_text: params.renderedBody,
    template_name: params.templateName,
    status: "sending",
    created_at: new Date().toISOString(),
    client_message_id: clientMessageId,
  };

  const outboxItem: OutboxItem = {
    id: generateClientMessageId(),
    tenant_id: params.tenantId,
    conversation_id: params.conversationId,
    client_message_id: clientMessageId,
    local_message_id: localMessageId,
    message_type: "template",
    content_text: params.renderedBody,
    template_name: params.templateName,
    template_language: params.templateLanguage,
    template_params: params.templateParams,
    template_message_params: params.templateMessageParams,
    created_at: new Date().toISOString(),
    attempt_count: 0,
    status: "pending",
    permanent_failure: false,
  };

  await putMessage(localMessage);
  await putOutboxItem(outboxItem);

  return { localMessage, outboxItem };
}

/**
 * Queue an interactive message for sending.
 */
export async function queueInteractiveMessage(params: {
  tenantId: string;
  conversationId: string;
  payload: InteractiveMessagePayload;
  replyToMessageId?: string;
}): Promise<{ localMessage: LocalMessage; outboxItem: OutboxItem }> {
  const clientMessageId = generateClientMessageId();
  const localMessageId = generateClientMessageId();

  const localMessage: LocalMessage = {
    id: localMessageId,
    conversation_id: params.conversationId,
    sender_type: "agent",
    content_type: "interactive",
    content_text: params.payload.body,
    interactive_payload: params.payload,
    status: "sending",
    created_at: new Date().toISOString(),
    reply_to_message_id: params.replyToMessageId,
    client_message_id: clientMessageId,
  };

  const outboxItem: OutboxItem = {
    id: generateClientMessageId(),
    tenant_id: params.tenantId,
    conversation_id: params.conversationId,
    client_message_id: clientMessageId,
    local_message_id: localMessageId,
    message_type: "interactive",
    content_text: params.payload.body,
    interactive_payload: params.payload,
    reply_to_message_id: params.replyToMessageId,
    created_at: new Date().toISOString(),
    attempt_count: 0,
    status: "pending",
    permanent_failure: false,
  };

  await putMessage(localMessage);
  await putOutboxItem(outboxItem);

  return { localMessage, outboxItem };
}

/**
 * Queue a media message for sending.
 * The attachment is stored locally as a Blob.
 */
export async function queueMediaMessage(params: {
  tenantId: string;
  conversationId: string;
  messageType: string;
  mediaUrl: string;
  contentText?: string;
  filename?: string;
  fileData?: Blob;
  mimeType?: string;
  replyToMessageId?: string;
}): Promise<{ localMessage: LocalMessage; outboxItem: OutboxItem }> {
  const clientMessageId = generateClientMessageId();
  const localMessageId = generateClientMessageId();

  const localMessage: LocalMessage = {
    id: localMessageId,
    conversation_id: params.conversationId,
    sender_type: "agent",
    content_type: params.messageType as LocalMessage["content_type"],
    content_text: params.contentText,
    media_url: params.mediaUrl,
    status: "sending",
    created_at: new Date().toISOString(),
    reply_to_message_id: params.replyToMessageId,
    client_message_id: clientMessageId,
  };

  const outboxItem: OutboxItem = {
    id: generateClientMessageId(),
    tenant_id: params.tenantId,
    conversation_id: params.conversationId,
    client_message_id: clientMessageId,
    local_message_id: localMessageId,
    message_type: params.messageType,
    content_text: params.contentText,
    reply_to_message_id: params.replyToMessageId,
    created_at: new Date().toISOString(),
    attempt_count: 0,
    status: "pending",
    permanent_failure: false,
  };

  // Store file data locally if provided
  if (params.fileData) {
    const attachment: LocalAttachment = {
      id: generateClientMessageId(),
      outbox_id: outboxItem.id,
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      filename: params.filename || "attachment",
      mime_type: params.mimeType || "application/octet-stream",
      size: params.fileData.size,
      data: params.fileData,
      kind: params.messageType as LocalAttachment["kind"],
      caption: params.contentText,
      created_at: new Date().toISOString(),
      status: "pending",
    };
    await putAttachment(attachment);
    outboxItem.attachment_id = attachment.id;
  }

  await putMessage(localMessage);
  await putOutboxItem(outboxItem);

  return { localMessage, outboxItem };
}

/**
 * Process all pending outbox items.
 * Called on reconnect, visibility change, or periodically.
 */
export async function processOutbox(
  sendFn: (item: OutboxItem, attachment?: LocalAttachment) => Promise<{ messageId: string; whatsappMessageId: string }>
): Promise<{ sent: number; failed: number }> {
  const pending = await getPendingOutboxItems();
  let sent = 0;
  let failed = 0;

  for (const item of pending) {
    if (item.permanent_failure) continue;
    if (item.attempt_count >= 5) {
      // Too many retries — mark as permanently failed
      await updateOutboxItem(item.id, {
        status: "failed",
        error_message: "Maximum retry attempts exceeded",
        permanent_failure: true,
      });
      await updateMessage(item.local_message_id, { status: "failed" });
      failed++;
      continue;
    }

    let attachment: LocalAttachment | undefined;
    try {
      // Get attachment if this is a media message
      if (item.attachment_id) {
        attachment = await getAttachment(item.attachment_id);
      }

      await updateOutboxItem(item.id, {
        status: "sending",
        attempt_count: item.attempt_count + 1,
        last_attempt_at: new Date().toISOString(),
      });

      const result = await sendFn(item, attachment);

      // Success — mark outbox item as sent
      await updateOutboxItem(item.id, { status: "sent" });

      // Update the local message with the server-assigned id
      await updateMessage(item.local_message_id, {
        id: result.messageId,
        message_id: result.whatsappMessageId,
        status: "sent",
      });

      // Mark attachment as uploaded
      if (attachment) {
        await updateAttachment(attachment.id, { status: "uploaded" });
      }

      sent++;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";

      // Determine if this is a permanent failure
      const permanent = isPermanentFailure(errorMessage);

      // Clean up uploaded attachment if send failed
      if (attachment?.uploaded_url && attachment.uploaded_path) {
        try {
          const { deleteAccountMedia } = await import("@/lib/storage/upload-media");
          await deleteAccountMedia("chat-media", attachment.uploaded_path);
        } catch {
          // Best-effort cleanup
        }
      }

      await updateOutboxItem(item.id, {
        status: "failed",
        error_message: errorMessage,
        permanent_failure: permanent,
      });

      await updateMessage(item.local_message_id, { status: "failed" });

      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Determine if an error is permanent (no point retrying).
 */
function isPermanentFailure(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("authorization") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("not_found") ||
    lower.includes("conversation not found") ||
    lower.includes("invalid") ||
    lower.includes("unsupported") ||
    lower.includes("window_expired") ||
    lower.includes("24-hour") ||
    lower.includes("template_malformed") ||
    lower.includes("bad_request")
  );
}

/**
 * Check if the device is currently online.
 */
export function isOnline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine;
}

/**
 * Retry a single failed outbox item.
 */
export async function retryOutboxItem(
  itemId: string,
  sendFn: (item: OutboxItem, attachment?: LocalAttachment) => Promise<{ messageId: string; whatsappMessageId: string }>
): Promise<boolean> {
  const item = await getOutboxItem(itemId);
  if (!item || item.status !== "failed") return false;

  try {
    let attachment: LocalAttachment | undefined;
    if (item.attachment_id) {
      attachment = await getAttachment(item.attachment_id);
    }

    await updateOutboxItem(item.id, {
      status: "sending",
      attempt_count: item.attempt_count + 1,
      last_attempt_at: new Date().toISOString(),
      error_message: undefined,
      permanent_failure: false,
    });

    const result = await sendFn(item, attachment);

    await updateOutboxItem(item.id, { status: "sent" });
    await updateMessage(item.local_message_id, {
      id: result.messageId,
      message_id: result.whatsappMessageId,
      status: "sent",
    });

    if (attachment) {
      await updateAttachment(attachment.id, { status: "uploaded" });
    }

    return true;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    const permanent = isPermanentFailure(errorMessage);

    await updateOutboxItem(item.id, {
      status: "failed",
      error_message: errorMessage,
      permanent_failure: permanent,
    });

    return false;
  }
}

/**
 * Delete a pending outbox item and its local message.
 * Only allowed for items that haven't been sent yet.
 */
export async function cancelOutboxItem(itemId: string): Promise<void> {
  const item = await getOutboxItem(itemId);
  if (!item || item.status === "sent") return;

  await deleteMessage(item.local_message_id);
  await deleteOutboxItem(itemId);
}
