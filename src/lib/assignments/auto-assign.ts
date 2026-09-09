import type { SupabaseClient } from '@supabase/supabase-js';
import { 
  getEligibleTeamMembers, 
  scoreTeamMembers, 
  getRoleForBusinessType,
  shouldUseOrderAssignment,
  buildMetadataFilters,
  type EligibilityCriteria,
  type ScoringFactors,
} from './team-assign';

/**
 * Smart auto-assign an inbound conversation or order to a team member.
 *
 * Routing priority:
 *  1. Check working hours — if outside, queue (no assignment)
 *  2. Get business type to determine assignment strategy
 *  3. For logistics: order-to-driver assignment with freight/zone matching
 *  4. For services: conversation-to-provider assignment with skill matching
 *  5. For others: standard conversation-to-agent assignment with departments
 *
 * Called from the webhook handler after a new conversation is created
 * or when an unassigned conversation receives a new inbound message.
 */
export async function autoAssignConversation(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  orderId?: string,
): Promise<string | null> {
  // 1. Read auto-assign config and business type
  const { data: settings, error: settingsErr } = await db
    .from('tenant_settings')
    .select('auto_assign_mode, last_assigned_agent_id, auto_assign_config')
    .eq('account_id', accountId)
    .maybeSingle();

  if (settingsErr || !settings) return null;

  const mode = settings.auto_assign_mode as string;
  if (mode === 'manual') return null;

  // Get business type
  const { data: account } = await db
    .from('accounts')
    .select('business_type')
    .eq('id', accountId)
    .maybeSingle();

  const businessType = account?.business_type || null;

  // 2. Check working hours
  const { data: withinHours } = await db.rpc('is_within_working_hours', {
    p_account_id: accountId,
  });

  if (withinHours === false) {
    console.log('[auto-assign] outside working hours, skipping assignment');
    return null;
  }

  // 3. Business-type-specific routing
  const role = getRoleForBusinessType(businessType || '');
  
  // For logistics with orders, use order-to-driver assignment
  if (shouldUseOrderAssignment(businessType || '') && orderId) {
    return assignOrderToTeamMember(db, accountId, orderId, businessType || '');
  }

  // For service businesses, use conversation-to-provider assignment
  if (role !== 'agent') {
    return assignConversationToTeamMember(db, accountId, conversationId, role, businessType || '');
  }

  // Standard conversation assignment (existing logic)
  return assignConversationStandard(db, accountId, conversationId, mode, settings);
}

// ============================================================================
// Order-to-Team-Member Assignment (for logistics)
// ============================================================================

async function assignOrderToTeamMember(
  db: SupabaseClient,
  accountId: string,
  orderId: string,
  businessType: string,
): Promise<string | null> {
  // Get order details
  const { data: order } = await db
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('account_id', accountId)
    .maybeSingle();

  if (!order) {
    console.log('[auto-assign] order not found:', orderId);
    return null;
  }

  const role = getRoleForBusinessType(businessType);
  const metadataFilters = buildMetadataFilters(businessType, order);

  // Get eligible team members
  const members = await getEligibleTeamMembers(db, {
    accountId,
    role,
    businessType,
    metadataFilters,
    isAvailable: true,
  });

  if (members.length === 0) {
    console.log('[auto-assign] no eligible team members for order:', orderId);
    return null;
  }

  // Score members
  const scoringFactors: ScoringFactors = {
    currentLoad: true,
  };
  
  if (order.pickup_location_lat && order.pickup_location_lng) {
    scoringFactors.proximity = {
      lat: order.pickup_location_lat,
      lng: order.pickup_location_lng,
    };
  }
  
  if (order.zone) {
    scoringFactors.zoneMatch = order.zone;
  }

  const scored = scoreTeamMembers(members, businessType, scoringFactors);

  // Assign to best member
  const bestMember = scored[0];
  
  const { error: assignErr } = await db
    .from('orders')
    .update({
      assigned_team_member_id: bestMember.user_id,
      assigned_role: role,
    })
    .eq('id', orderId)
    .eq('account_id', accountId);

  if (assignErr) {
    console.error('[auto-assign] failed to assign order:', assignErr);
    return null;
  }

  console.log('[auto-assign] assigned order', orderId, 'to', bestMember.user_id, 'with role', role);
  return bestMember.user_id;
}

// ============================================================================
// Conversation-to-Team-Member Assignment (for service businesses)
// ============================================================================

async function assignConversationToTeamMember(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  role: string,
  businessType: string,
): Promise<string | null> {
  // Get conversation topic for skill matching
  const { data: topicData } = await db
    .from('conversation_topics')
    .select('detected_topic')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  const metadataFilters: Record<string, unknown> = {};
  const scoringFactors: ScoringFactors = {
    currentLoad: true,
  };

  // If topic detected, use for skill matching
  if (topicData?.detected_topic) {
    scoringFactors.skillMatch = [topicData.detected_topic];
  }

  // Get eligible team members
  const members = await getEligibleTeamMembers(db, {
    accountId,
    role,
    businessType,
    metadataFilters,
    isAvailable: true,
  });

  if (members.length === 0) {
    console.log('[auto-assign] no eligible team members for conversation:', conversationId);
    return null;
  }

  // Score members
  const scored = scoreTeamMembers(members, businessType, scoringFactors);

  // Assign to best member
  const bestMember = scored[0];
  
  const { error: assignErr } = await db
    .from('conversations')
    .update({
      assigned_agent_id: bestMember.user_id,
      human_assigned_at: new Date().toISOString(),
      human_replied: false,
    })
    .eq('id', conversationId)
    .eq('account_id', accountId);

  if (assignErr) {
    console.error('[auto-assign] failed to assign conversation:', assignErr);
    return null;
  }

  console.log('[auto-assign] assigned conversation', conversationId, 'to', bestMember.user_id, 'with role', role);
  return bestMember.user_id;
}

// ============================================================================
// Standard Conversation Assignment (existing logic preserved)
// ============================================================================

async function assignConversationStandard(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  mode: string,
  settings: any,
): Promise<string | null> {
  const config = typeof settings.auto_assign_config === 'object' && settings.auto_assign_config !== null
    ? settings.auto_assign_config as AssignConfig
    : DEFAULT_CONFIG;

  // Get conversation's detected department (if any)
  const { data: topicData } = await db
    .from('conversation_topics')
    .select('detected_department_id, detected_language, detected_topic')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  const detectedDeptId = topicData?.detected_department_id ?? null;

  // Get eligible agents based on mode and department
  let candidates: Candidate[];

  if (detectedDeptId) {
    candidates = await getDepartmentCandidates(db, accountId, detectedDeptId);
  } else {
    candidates = await getAllCandidates(db, accountId);
  }

  if (candidates.length === 0) {
    console.log('[auto-assign] no eligible agents found');
    return null;
  }

  // Apply filters
  let filtered = candidates.filter((c) => {
    if (c.active_conversations >= config.max_active_per_agent) return false;
    if (config.skip_offline && !c.is_online) return false;
    return true;
  });

  if (filtered.length === 0) {
    filtered = candidates.filter((c) => {
      return c.active_conversations < config.max_active_per_agent;
    });
  }

  if (filtered.length === 0) {
    console.log('[auto-assign] all agents at max capacity');
    return null;
  }

  // Score and pick the best agent
  let assignedUserId: string | null = null;

  if (mode === 'round_robin') {
    assignedUserId = resolveRoundRobin(filtered, settings.last_assigned_agent_id);
  } else if (mode === 'load_balanced') {
    assignedUserId = resolveLoadBalanced(filtered);
  } else {
    assignedUserId = resolveWeighted(filtered, config, detectedDeptId);
  }

  if (!assignedUserId) return null;

  // Assign the conversation
  const updatePayload: Record<string, unknown> = {
    assigned_agent_id: assignedUserId,
    human_assigned_at: new Date().toISOString(),
    human_replied: false,
  };
  if (detectedDeptId) {
    updatePayload.department_id = detectedDeptId;
  }

  const { error: assignErr } = await db
    .from('conversations')
    .update(updatePayload)
    .eq('id', conversationId)
    .eq('account_id', accountId);

  if (assignErr) {
    console.error('[auto-assign] failed to assign conversation:', assignErr);
    return null;
  }

  // Update round-robin tracking
  if (mode === 'round_robin') {
    await db
      .from('tenant_settings')
      .update({ last_assigned_agent_id: assignedUserId })
      .eq('account_id', accountId);
  }

  return assignedUserId;
}

// ─── Types ─────────────────────────────────────────────────────

interface AssignConfig {
  skip_offline: boolean;
  max_active_per_agent: number;
  skill_weight: number;
  presence_weight: number;
  load_weight: number;
  after_hours_mode: string;
}

const DEFAULT_CONFIG: AssignConfig = {
  skip_offline: true,
  max_active_per_agent: 20,
  skill_weight: 0.3,
  presence_weight: 0.3,
  load_weight: 0.4,
  after_hours_mode: 'queue',
};

interface Candidate {
  user_id: string;
  full_name: string | null;
  email: string | null;
  is_online: boolean;
  active_conversations: number;
  skill_level?: number;
  is_primary?: boolean;
  matching_skills?: number;
  skill_score?: number;
}

// ─── Candidate Fetchers ────────────────────────────────────────

async function getDepartmentCandidates(
  db: SupabaseClient,
  accountId: string,
  departmentId: string,
): Promise<Candidate[]> {
  // Get agents in this department
  const { data: deptAgents } = await db.rpc('get_department_agents', {
    p_account_id: accountId,
    p_department_id: departmentId,
  });

  if (!deptAgents || deptAgents.length === 0) return [];

  // Enrich with active conversation counts and skill matches
  const userIds = deptAgents.map((a: { user_id: string }) => a.user_id);

  const [countsResult, skillsResult] = await Promise.all([
    db
      .from('conversations')
      .select('assigned_agent_id')
      .eq('account_id', accountId)
      .neq('status', 'closed')
      .in('assigned_agent_id', userIds),
    db
      .from('agent_skills')
      .select('user_id, skill, level')
      .eq('account_id', accountId)
      .in('user_id', userIds),
  ]);

  // Tally active conversations
  const activeTally = new Map<string, number>();
  for (const uid of userIds) activeTally.set(uid, 0);
  for (const row of countsResult.data ?? []) {
    if (row.assigned_agent_id) {
      activeTally.set(
        row.assigned_agent_id,
        (activeTally.get(row.assigned_agent_id) ?? 0) + 1,
      );
    }
  }

  // Group skills by user
  const skillsByUser = new Map<string, { skill: string; level: number }[]>();
  for (const s of skillsResult.data ?? []) {
    if (!skillsByUser.has(s.user_id)) skillsByUser.set(s.user_id, []);
    skillsByUser.get(s.user_id)!.push({ skill: s.skill, level: s.level });
  }

  return deptAgents.map((agent: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_online: boolean;
    skill_level: number;
    is_primary: boolean;
  }) => {
    const userSkills = skillsByUser.get(agent.user_id) ?? [];
    return {
      user_id: agent.user_id,
      full_name: agent.full_name,
      email: agent.email,
      is_online: agent.is_online,
      active_conversations: activeTally.get(agent.user_id) ?? 0,
      skill_level: agent.skill_level,
      is_primary: agent.is_primary,
      matching_skills: userSkills.length,
      skill_score: userSkills.reduce((sum, s) => sum + s.level, 0),
    };
  });
}

async function getAllCandidates(
  db: SupabaseClient,
  accountId: string,
): Promise<Candidate[]> {
  const { data: agents } = await db.rpc('get_eligible_agents', {
    p_account_id: accountId,
  });

  if (!agents || agents.length === 0) return [];

  return agents.map((a: {
    user_id: string;
    full_name: string | null;
    email: string | null;
    is_online: boolean;
    active_conversation_count: number;
  }) => ({
    user_id: a.user_id,
    full_name: a.full_name,
    email: a.email,
    is_online: a.is_online,
    active_conversations: Number(a.active_conversation_count) || 0,
  }));
}

// ─── Scoring / Resolution ──────────────────────────────────────

function resolveRoundRobin(
  candidates: Candidate[],
  lastAssignedAgentId: string | null,
): string | null {
  if (candidates.length === 0) return null;
  if (!lastAssignedAgentId) return candidates[0].user_id;

  const idx = candidates.findIndex((c) => c.user_id === lastAssignedAgentId);
  if (idx === -1) return candidates[0].user_id;

  return candidates[(idx + 1) % candidates.length].user_id;
}

function resolveLoadBalanced(candidates: Candidate[]): string | null {
  if (candidates.length === 0) return null;

  let best = candidates[0];
  for (const c of candidates) {
    if (c.active_conversations < best.active_conversations) {
      best = c;
    }
  }
  return best.user_id;
}

function resolveWeighted(
  candidates: Candidate[],
  config: AssignConfig,
  _departmentId: string | null,
): string | null {
  if (candidates.length === 0) return null;

  // Normalize load for scoring (0 = most loaded, 1 = least loaded)
  const maxLoad = Math.max(...candidates.map((c) => c.active_conversations), 1);

  let bestScore = -Infinity;
  let best = candidates[0];

  for (const c of candidates) {
    const loadScore = 1 - c.active_conversations / maxLoad;
    const presenceScore = c.is_online ? 1 : 0;
    const skillScore = c.skill_level
      ? c.skill_level / 5
      : 0.5; // default if no skill data

    const totalScore =
      config.load_weight * loadScore +
      config.presence_weight * presenceScore +
      config.skill_weight * skillScore;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      best = c;
    }
  }

  return best.user_id;
}
