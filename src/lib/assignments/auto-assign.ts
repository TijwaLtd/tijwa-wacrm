import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Auto-assign an inbound conversation to a team member.
 *
 * Modes:
 *  - manual:        no-op (default)
 *  - round_robin:   cycles through agents in membership order,
 *                   tracked via tenant_settings.last_assigned_agent_id
 *  - load_balanced: assigns to the agent with the fewest active
 *                   (non-closed) conversations
 *
 * Called from the webhook handler after a new conversation is created
 * or when an unassigned conversation receives a new inbound message.
 */
export async function autoAssignConversation(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
): Promise<string | null> {
  // 1. Read the current auto-assign mode for this account
  const { data: settings, error: settingsErr } = await db
    .from('tenant_settings')
    .select('auto_assign_mode, last_assigned_agent_id')
    .eq('account_id', accountId)
    .maybeSingle();

  if (settingsErr || !settings) return null;

  const mode = settings.auto_assign_mode as string;
  if (mode === 'manual') return null;

  // 2. Get all agents (agent role or higher) in this account
  const { data: members, error: membersErr } = await db
    .from('account_memberships')
    .select('user_id, role')
    .eq('account_id', accountId)
    .in('role', ['owner', 'admin', 'agent']);

  if (membersErr || !members || members.length === 0) return null;

  let assignedUserId: string | null = null;

  if (mode === 'round_robin') {
    assignedUserId = resolveRoundRobin(members, settings.last_assigned_agent_id);
  } else if (mode === 'load_balanced') {
    assignedUserId = await resolveLoadBalanced(db, accountId, members);
  }

  if (!assignedUserId) return null;

  // 3. Assign the conversation
  const { error: assignErr } = await db
    .from('conversations')
    .update({ assigned_agent_id: assignedUserId })
    .eq('id', conversationId)
    .eq('account_id', accountId);

  if (assignErr) {
    console.error('[auto-assign] failed to assign conversation:', assignErr);
    return null;
  }

  // 4. Update last_assigned_agent_id for round-robin tracking
  if (mode === 'round_robin') {
    await db
      .from('tenant_settings')
      .update({ last_assigned_agent_id: assignedUserId })
      .eq('account_id', accountId);
  }

  return assignedUserId;
}

/**
 * Round-robin: pick the next agent after the last assigned one.
 * Falls back to the first agent if the last assigned agent is no longer
 * in the member list.
 */
function resolveRoundRobin(
  members: { user_id: string; role: string }[],
  lastAssignedAgentId: string | null,
): string | null {
  if (members.length === 0) return null;

  if (!lastAssignedAgentId) {
    return members[0].user_id;
  }

  const idx = members.findIndex((m) => m.user_id === lastAssignedAgentId);
  if (idx === -1) {
    // Last assigned agent is no longer a member; start from the top
    return members[0].user_id;
  }

  // Next agent, wrapping around
  return members[(idx + 1) % members.length].user_id;
}

/**
 * Load-balanced: pick the agent with the fewest active conversations.
 * Active = status != 'closed'.
 */
async function resolveLoadBalanced(
  db: SupabaseClient,
  accountId: string,
  members: { user_id: string; role: string }[],
): Promise<string | null> {
  if (members.length === 0) return null;

  const userIds = members.map((m) => m.user_id);

  // Count active conversations per agent
  const { data: counts, error } = await db
    .from('conversations')
    .select('assigned_agent_id')
    .eq('account_id', accountId)
    .neq('status', 'closed')
    .in('assigned_agent_id', userIds);

  if (error) {
    // Fallback to first agent on error
    return members[0].user_id;
  }

  // Tally counts
  const tally = new Map<string, number>();
  for (const uid of userIds) tally.set(uid, 0);
  for (const row of counts ?? []) {
    if (row.assigned_agent_id) {
      tally.set(row.assigned_agent_id, (tally.get(row.assigned_agent_id) ?? 0) + 1);
    }
  }

  // Find agent with fewest active conversations
  let bestAgent = userIds[0];
  let bestCount = Infinity;
  for (const uid of userIds) {
    const c = tally.get(uid) ?? 0;
    if (c < bestCount) {
      bestCount = c;
      bestAgent = uid;
    }
  }

  return bestAgent;
}
