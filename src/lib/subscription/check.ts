import type { SupabaseClient } from '@supabase/supabase-js'
import { ForbiddenError } from '@/lib/auth/account'

// Subscription statuses that allow the workspace to function.
const ACTIVE_STATUSES = new Set(['active', 'trial'])

export interface PlanLimits {
  max_contacts: number
  max_team_members: number
  max_broadcasts_per_month: number
  max_automations: number
  max_flows: number
  ai_replies_per_month: number
  ai_credits_per_month: number
}

const DEFAULT_LIMITS: PlanLimits = {
  max_contacts: 1000,
  max_team_members: 5,
  max_broadcasts_per_month: 50,
  max_automations: 20,
  max_flows: 10,
  ai_replies_per_month: 100,
  ai_credits_per_month: 100,
}

/**
 * Check if the account's subscription is active (active or trial).
 * Returns false for suspended, cancelled, or missing subscription.
 */
export async function isSubscriptionActive(
  serviceClient: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient
    .from('tenant_settings')
    .select('subscription_status')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error || !data) return false
  return ACTIVE_STATUSES.has(data.subscription_status)
}

/**
 * Require an active subscription. Throws ForbiddenError if expired.
 * Use in API routes that perform write operations (send, create, invite).
 */
export async function requireActiveSubscription(
  serviceClient: SupabaseClient,
  accountId: string,
): Promise<void> {
  const active = await isSubscriptionActive(serviceClient, accountId)
  if (!active) {
    throw new ForbiddenError(
      'Your subscription has expired. Please renew to continue.',
    )
  }
}

/**
 * Get the plan feature limits for the account.
 * Falls back to starter-tier defaults if the RPC is unavailable.
 */
export async function getPlanLimits(
  serviceClient: SupabaseClient,
  accountId: string,
): Promise<PlanLimits> {
  // First get the plan from tenant_settings
  const { data: settings } = await serviceClient
    .from('tenant_settings')
    .select('plan')
    .eq('account_id', accountId)
    .maybeSingle()

  const plan = settings?.plan ?? 'starter'

  // Try the RPC
  const { data, error } = await serviceClient.rpc('get_plan_features', {
    p_plan: plan,
  })

  if (error || !data) return DEFAULT_LIMITS

  // RPC returns JSONB — parse it
  const features = typeof data === 'string' ? JSON.parse(data) : data

  return {
    max_contacts: features.max_contacts ?? DEFAULT_LIMITS.max_contacts,
    max_team_members: features.max_team_members ?? DEFAULT_LIMITS.max_team_members,
    max_broadcasts_per_month: features.max_broadcasts_per_month ?? DEFAULT_LIMITS.max_broadcasts_per_month,
    max_automations: features.max_automations ?? DEFAULT_LIMITS.max_automations,
    max_flows: features.max_flows ?? DEFAULT_LIMITS.max_flows,
    ai_replies_per_month: features.ai_replies_per_month ?? DEFAULT_LIMITS.ai_replies_per_month,
    ai_credits_per_month: features.ai_credits_per_month ?? DEFAULT_LIMITS.ai_credits_per_month,
  }
}

/**
 * Check if the account is within a specific usage limit.
 * Returns { allowed: boolean, current: number, max: number }.
 */
export async function checkUsageLimit(
  serviceClient: SupabaseClient,
  accountId: string,
  metric: keyof PlanLimits,
): Promise<{ allowed: boolean; current: number; max: number }> {
  const limits = await getPlanLimits(serviceClient, accountId)
  const max = limits[metric] ?? 0

  const { data } = await serviceClient.rpc('get_current_usage', {
    p_account_id: accountId,
    p_metric: metric,
  })

  const current = typeof data === 'number' ? data : 0
  return { allowed: current < max, current, max }
}
