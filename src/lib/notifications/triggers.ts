// ============================================================
// Notification triggers — one function per product event.
//
// These are the ONLY places that should call notify() with product
// copy. Each resolves recipients, builds title/body/deep-link, and
// delegates to the shared pipeline. Every function is safe to call
// from a webhook `after()` block: it never throws and never blocks.
//
// Adding a new event:
//   1. widen notifications.type in a migration (add the CHECK value)
//   2. add a NotificationType to src/types/index.ts
//   3. add a notifyX() function here
//   4. call it from the event source — done. The SW, bell badge,
//      /notifications page, and Web Push all pick it up for free.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { notify } from './notify';
import {
  resolveConversationRecipients,
  resolveOwnerAndAdminIds,
} from './recipients';

const PREVIEW_MAX = 140;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

/** Inbound WhatsApp message landed. Assigned agent, else whole account. */
export async function notifyMessageReceived(
  db: SupabaseClient,
  input: {
    accountId: string;
    conversationId: string;
    contactId: string;
    assignedAgentId?: string | null;
    contactName?: string | null;
    /** Message text / type label for the notification body. */
    preview?: string | null;
  },
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    assignedAgentId,
    contactName,
    preview,
  } = input;

  const userIds = await resolveConversationRecipients(
    db,
    accountId,
    assignedAgentId,
  );
  if (userIds.length === 0) return;

  const who = contactName?.trim() || 'a contact';
  const body = preview?.trim()
    ? truncate(preview.trim(), PREVIEW_MAX)
    : 'New inbound message';

  await notify(db, {
    type: 'message_received',
    accountId,
    userIds,
    title: `New message from ${who}`,
    body,
    conversationId,
    contactId,
    url: `/inbox?c=${conversationId}`,
  });
}

/** Plan activated / upgraded. Owner + admins. */
export async function notifyBillingConfirmation(
  db: SupabaseClient,
  input: {
    accountId: string;
    plan: string;
    periodEndIso?: string | null;
  },
): Promise<void> {
  const { accountId, plan, periodEndIso } = input;
  const userIds = await resolveOwnerAndAdminIds(db, accountId);
  if (userIds.length === 0) return;

  let body = `Your ${plan} plan is now active.`;
  if (periodEndIso) {
    const until = new Date(periodEndIso);
    if (!Number.isNaN(until.getTime())) {
      body += ` Renews on ${until.toISOString().slice(0, 10)}.`;
    }
  }

  await notify(db, {
    type: 'billing_confirmation',
    accountId,
    userIds,
    title: 'Billing confirmed',
    body,
    url: '/settings',
    // One bubble per account per day — repeated plan churn shouldn't
    // stack bubbles.
    tag: `billing:${accountId}`,
  });
}

/** Subscription renews soon (cron-driven reminder). Owner + admins. */
export async function notifySubscriptionRenewalSoon(
  db: SupabaseClient,
  input: {
    accountId: string;
    plan: string;
    daysUntilRenewal: number;
    periodEndIso: string;
  },
): Promise<void> {
  const { accountId, plan, daysUntilRenewal, periodEndIso } = input;
  const userIds = await resolveOwnerAndAdminIds(db, accountId);
  if (userIds.length === 0) return;

  await notify(db, {
    type: 'billing_confirmation',
    accountId,
    userIds,
    title: 'Subscription renews soon',
    body: `Your ${plan} plan renews in ${daysUntilRenewal} day${
      daysUntilRenewal === 1 ? '' : 's'
    } (${periodEndIso.slice(0, 10)}).`,
    url: '/settings',
    // Stable per period so the daily cron re-sends don't stack.
    tag: `billing-renewal:${accountId}:${periodEndIso}`,
  });
}
