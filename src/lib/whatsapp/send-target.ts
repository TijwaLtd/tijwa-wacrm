// ============================================================
// Shared send-target resolution — phone primary, BSUID fallback.
//
// Every outbound Meta send (agent composer, AI/flows, automations,
// reactions, broadcasts, public API) must agree on:
//   1. Prefer a valid E.164 phone (with trunk-prefix variants).
//   2. Fall back to `contacts.bsuid` when there is no usable phone,
//      or when every phone variant is rejected as not-allowed.
//
// Callers pass a contact-like `{ phone, bsuid }` and an `attempt(to)`
// that performs the actual Meta call. This module owns only target
// selection + retry order so the four engine copies can't drift.
// ============================================================

import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils';

/** Minimal contact shape needed to pick a Meta `to` target. */
export interface ContactSendIdentity {
  phone?: string | null;
  bsuid?: string | null;
}

export type SendTarget =
  | {
      kind: 'phone';
      /** Sanitized digits-only primary phone. */
      phone: string;
      /** Ordered variants (original first) from `phoneVariants`. */
      variants: string[];
      /** Optional BSUID fallback when every phone variant fails. */
      bsuid: string | null;
    }
  | { kind: 'bsuid'; bsuid: string };

/** Error message when neither a phone nor a BSUID can be used. */
export const NO_SEND_TARGET_MESSAGE =
  'Contact has no valid phone number or WhatsApp user ID';

/** True when `phone` is missing, empty, or the `bsuid_…` webhook placeholder. */
export function isPlaceholderOrEmptyPhone(phone: string | null | undefined): boolean {
  return !phone || phone.startsWith('bsuid_');
}

/**
 * Resolve the Meta `to` target for a contact.
 *
 * Primary: valid E.164 phone → variant list + optional BSUID fallback.
 * Fallback: BSUID only when the phone is unusable (placeholder/invalid).
 * Returns `null` when the contact has neither identifier.
 */
export function resolveSendTarget(contact: ContactSendIdentity): SendTarget | null {
  const rawPhone = contact.phone || '';
  const sanitized = isPlaceholderOrEmptyPhone(rawPhone)
    ? ''
    : sanitizePhoneForMeta(rawPhone);
  const hasValidPhone = !!sanitized && isValidE164(sanitized);
  const bsuid = contact.bsuid || null;

  if (hasValidPhone) {
    return {
      kind: 'phone',
      phone: sanitized,
      variants: phoneVariants(sanitized),
      bsuid,
    };
  }

  if (bsuid) {
    return { kind: 'bsuid', bsuid };
  }

  return null;
}

export interface SendViaTargetResult {
  messageId: string;
  /**
   * Phone variant that Meta accepted — only set on the phone path.
   * Callers persist this back to `contacts.phone` when it differs from
   * the stored value (trunk-prefix auto-correct). Undefined on BSUID.
   */
  workingPhone?: string;
  /**
   * Meta recipient `wa_id` from the successful send response —
   * persist via `saveContactMetaIdentity` so the contact always has a
   * Meta id even when it was created phone-only.
   */
  waId?: string;
}

/** attempt() may return a bare wamid or a full MetaSendResult. */
export type SendAttemptResult =
  | string
  | { messageId: string; waId?: string };

function normalizeAttemptResult(
  result: SendAttemptResult
): { messageId: string; waId?: string } {
  if (typeof result === 'string') return { messageId: result };
  return result;
}

/**
 * Run `attempt(to)` against a resolved target.
 *
 * Phone path: try each variant in order; on "recipient not allowed"
 * continue to the next variant; if all variants fail that way and a
 * BSUID exists, try the BSUID once before rethrowing.
 * BSUID path: single attempt.
 */
export async function sendViaTarget(
  target: SendTarget,
  attempt: (to: string) => Promise<SendAttemptResult>,
): Promise<SendViaTargetResult> {
  if (target.kind === 'bsuid') {
    const result = normalizeAttemptResult(await attempt(target.bsuid));
    return { messageId: result.messageId, waId: result.waId };
  }

  let lastNotAllowed: unknown = null;

  for (const variant of target.variants) {
    try {
      const result = normalizeAttemptResult(await attempt(variant));
      return {
        messageId: result.messageId,
        workingPhone: variant,
        waId: result.waId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!isRecipientNotAllowedError(message)) {
        // Hard Meta error (bad template, auth, etc.) — not worth another
        // variant or a BSUID hop; surface it immediately.
        throw err;
      }
      lastNotAllowed = err;
      console.warn(
        `[send-target] variant "${variant}" rejected by Meta, trying next…`,
      );
    }
  }

  // Every phone variant was "not allowed" — fall back to BSUID when present.
  if (target.bsuid) {
    try {
      const result = normalizeAttemptResult(await attempt(target.bsuid));
      return { messageId: result.messageId, waId: result.waId };
    } catch {
      // Prefer the clearer phone-path error when both fail.
    }
  }

  if (lastNotAllowed) throw lastNotAllowed;
  throw new Error(NO_SEND_TARGET_MESSAGE);
}
