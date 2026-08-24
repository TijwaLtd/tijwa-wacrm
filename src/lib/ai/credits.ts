import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiProvider, AiUsage } from './types'

// ============================================================
// AI Credits — platform-provided billing layer.
//
// Credits are denominated in whole units (1 credit ≈ $1 USD).
// Each model has input/output costs per million tokens with a
// 3x markup over provider cost. Deductions are atomic via RPC.
// ============================================================

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
 * Calculate the credit cost for an LLM call.
 *
 * Formula:
 *   credits = (prompt_tokens × input_credits_per_MTok / 1_000_000)
 *           + (completion_tokens × output_credits_per_MTok / 1_000_000)
 */
export function calculateCreditsUsed(
  rate: AiCreditRate,
  usage: AiUsage | null,
): number {
  if (!usage) return 0

  const inputCredits =
    (usage.promptTokens * rate.inputCreditsPerMtok) / 1_000_000
  const outputCredits =
    (usage.completionTokens * rate.outputCreditsPerMtok) / 1_000_000

  return Math.round((inputCredits + outputCredits) * 1_000_000) / 1_000_000
}

/**
 * Check if the tenant has any AI credits remaining.
 */
export async function checkAiCredits(
  db: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { data, error } = await db.rpc('check_ai_credits', {
    p_account_id: accountId,
  })
  if (error) {
    console.error('[ai credits] check failed:', error)
    return false
  }
  return data === true
}

/**
 * Get the tenant's current credit balance.
 */
export async function getAiCreditBalance(
  db: SupabaseClient,
  accountId: string,
): Promise<AiCreditBalance | null> {
  const { data, error } = await db
    .from('ai_credits')
    .select('credits_remaining, credits_used, last_reset_at')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error || !data) return null

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
