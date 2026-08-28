import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiProvider, AiUsage } from './types'

// ============================================================
// AI Credits — tiered consumption model.
//
// Credits are consumed per-operation, not per-token. This gives
// users predictable costs and the platform reliable revenue.
//
// Base rate: 1 credit = 5 AI replies
//
// Tiers:
//   simple   — short context (<10 msgs), text only → 0.2 credits/reply
//   standard — long context (>10 msgs) OR knowledge-grounded → 0.5 credits/reply
//   complex  — file/image analysis OR premium model → 2 credits/reply
//   handoff  — LLM called but couldn't answer → 0.2 credits (tokens consumed)
//
// The actual credit cost is calculated BEFORE the LLM call based on
// message complexity, not after based on tokens. This makes costs
// predictable for users.
// ============================================================

/** Credit cost tiers — credits consumed per AI operation. */
export const CREDIT_TIERS = {
  /** Short text reply, no files, basic model */
  simple: 0.2,
  /** Long conversation context (>10 msgs) or knowledge retrieval */
  standard: 0.5,
  /** File/image analysis or premium model (GPT-4o, Claude Sonnet) */
  complex: 2,
  /** Handoff — LLM was called but couldn't answer */
  handoff: 0.2,
} as const

/** Premium models that cost 2x credits */
const PREMIUM_MODELS = new Set([
  'gpt-4o',
  'claude-sonnet-4-5-20250929',
  'claude-sonnet-4-20250514',
])

/** Models that cost 1x credits (cheap/fast) */
const CHEAP_MODELS = new Set([
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-4.1-nano',
  'claude-haiku-4-5-20251001',
  'claude-3-5-haiku-20241022',
])

export interface AiCreditRate {
  provider: AiProvider
  model: string
  displayName: string
  inputCreditsPerMtok: number
  outputCreditsPerMtok: number
  isActive: boolean
}

export interface AiCreditBalance {
  creditsRemaining: number
  creditsUsed: number
  lastResetAt: string | null
}

export interface CreditCalculationInput {
  /** Number of messages in the conversation context */
  contextLength: number
  /** Whether knowledge retrieval was used */
  hasKnowledge: boolean
  /** Whether the message contains a file/image attachment */
  hasAttachment: boolean
  /** The AI model being used */
  model: string
  /** Whether this is a handoff (LLM called but couldn't answer) */
  isHandoff: boolean
}

/**
 * Calculate credit cost based on operation complexity.
 *
 * Rules:
 *   1. Handoff = 0.2 credits (tokens consumed but no useful reply)
 *   2. File attachment = 2 credits (vision processing)
 *   3. Premium model = 2x base cost
 *   4. Long context (>10 msgs) = standard tier
 *   5. Knowledge retrieval = standard tier
 *   6. Everything else = simple tier (0.2 credits = 1 credit per 5 replies)
 */
export function calculateCreditCost(input: CreditCalculationInput): number {
  const { contextLength, hasKnowledge, hasAttachment, model, isHandoff } = input

  // Handoff — cheapest tier, tokens consumed but no reply sent
  if (isHandoff) {
    return CREDIT_TIERS.handoff
  }

  // File/image analysis — most expensive, vision model usage
  if (hasAttachment) {
    return CREDIT_TIERS.complex
  }

  // Determine base tier
  let baseCost: number

  if (contextLength > 10 || hasKnowledge) {
    // Long context or knowledge retrieval = standard tier
    baseCost = CREDIT_TIERS.standard
  } else {
    // Short text reply = simple tier (1 credit per 5 replies)
    baseCost = CREDIT_TIERS.simple
  }

  // Premium model multiplier (GPT-4o, Claude Sonnet cost 10x more at provider)
  if (PREMIUM_MODELS.has(model)) {
    baseCost *= 2
  }

  return baseCost
}

/**
 * Fetch all active credit rates. Used by the settings UI to populate
 * the model dropdown and by the deduction logic to look up costs.
 */
export async function getActiveCreditRates(
  db: SupabaseClient,
): Promise<AiCreditRate[]> {
  const { data, error } = await db
    .from('ai_credit_rates')
    .select('provider, model, display_name, input_credits_per_mtok, output_credits_per_mtok, is_active')
    .eq('is_active', true)
    .order('provider')
    .order('input_credits_per_mtok')

  if (error) {
    console.error('[ai credits] failed to fetch rates:', error)
    return []
  }

  return (data ?? []).map((r) => ({
    provider: r.provider as AiProvider,
    model: r.model,
    displayName: r.display_name,
    inputCreditsPerMtok: Number(r.input_credits_per_mtok),
    outputCreditsPerMtok: Number(r.output_credits_per_mtok),
    isActive: r.is_active,
  }))
}

/**
 * Fetch active credit rates filtered by provider.
 */
export async function getCreditRatesForProvider(
  db: SupabaseClient,
  provider: AiProvider,
): Promise<AiCreditRate[]> {
  const { data, error } = await db
    .from('ai_credit_rates')
    .select('provider, model, display_name, input_credits_per_mtok, output_credits_per_mtok, is_active')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('input_credits_per_mtok')

  if (error) {
    console.error('[ai credits] failed to fetch rates for provider:', error)
    return []
  }

  return (data ?? []).map((r) => ({
    provider: r.provider as AiProvider,
    model: r.model,
    displayName: r.display_name,
    inputCreditsPerMtok: Number(r.input_credits_per_mtok),
    outputCreditsPerMtok: Number(r.output_credits_per_mtok),
    isActive: r.is_active,
  }))
}

/**
 * Look up the credit cost for a specific model.
 */
export async function getCreditRateForModel(
  db: SupabaseClient,
  provider: AiProvider,
  model: string,
): Promise<AiCreditRate | null> {
  const { data, error } = await db
    .from('ai_credit_rates')
    .select('provider, model, display_name, input_credits_per_mtok, output_credits_per_mtok, is_active')
    .eq('provider', provider)
    .eq('model', model)
    .maybeSingle()

  if (error || !data) return null

  return {
    provider: data.provider as AiProvider,
    model: data.model,
    displayName: data.display_name,
    inputCreditsPerMtok: Number(data.input_credits_per_mtok),
    outputCreditsPerMtok: Number(data.output_credits_per_mtok),
    isActive: data.is_active,
  }
}

/**
 * Check if the tenant has any AI credits remaining.
 * Uses direct table query (bypasses RLS issues with RPC auth.uid()).
 */
export async function checkAiCredits(
  db: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from('ai_credits')
    .select('credits_remaining')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) {
    console.error('[ai credits] check failed:', error)
    return false
  }

  const credits = Number(data?.credits_remaining) ?? 0
  console.log('[ai credits] account:', accountId, 'credits_remaining:', credits)
  return credits > 0
}

/**
 * Get the tenant's current credit balance.
 * Returns a default zero-balance if no row exists (before first seeding).
 */
export async function getAiCreditBalance(
  db: SupabaseClient,
  accountId: string,
): Promise<AiCreditBalance> {
  const { data, error } = await db
    .from('ai_credits')
    .select('credits_remaining, credits_used, last_reset_at')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error || !data) {
    return { creditsRemaining: 0, creditsUsed: 0, lastResetAt: null }
  }

  return {
    creditsRemaining: Number(data.credits_remaining),
    creditsUsed: Number(data.credits_used),
    lastResetAt: data.last_reset_at,
  }
}

/**
 * Deduct credits from the tenant's balance. Returns true on success,
 * false if insufficient balance (the RPC atomically checks).
 */
export async function deductAiCredits(
  db: SupabaseClient,
  accountId: string,
  credits: number,
): Promise<boolean> {
  if (credits <= 0) return true
  const { data, error } = await db.rpc('deduct_ai_credits', {
    p_account_id: accountId,
    p_credits: credits,
  })
  if (error) {
    console.error('[ai credits] deduct failed:', error)
    return false
  }
  return data === true
}
