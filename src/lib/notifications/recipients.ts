// ============================================================
// Recipient resolution for account-scoped notifications.
//
// Pure data lookups against the service/admin client. Each returns a
// de-duplicated userId list; empty list means "nobody to notify" and
// notify() treats that as a no-op.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Every member of an account (all roles). */
export async function resolveAccountMemberIds(
  db: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from('account_memberships')
    .select('user_id')
    .eq('account_id', accountId);
  if (error || !data) {
    console.error('[notifications/recipients] members fetch failed:', error);
    return [];
  }
  return dedupe(data.map((r) => r.user_id as string));
}

/** Owner + admins — the billing audience. */
export async function resolveOwnerAndAdminIds(
  db: SupabaseClient,
  accountId: string,
): Promise<string[]> {
  const { data, error } = await db
    .from('account_memberships')
    .select('user_id')
    .eq('account_id', accountId)
    .in('role', ['owner', 'admin']);
  if (error || !data) {
    console.error('[notifications/recipients] admins fetch failed:', error);
    return [];
  }
  return dedupe(data.map((r) => r.user_id as string));
}

/**
 * The conversation's assigned agent, or — when unassigned — every
 * member of the account. Shared-inbox norm: unowned inbound messages
 * are everybody's problem until someone picks them up.
 */
export async function resolveConversationRecipients(
  db: SupabaseClient,
  accountId: string,
  assignedAgentId: string | null | undefined,
): Promise<string[]> {
  if (assignedAgentId) return [assignedAgentId];
  return resolveAccountMemberIds(db, accountId);
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}
