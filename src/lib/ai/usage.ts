import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiProvider, AiUsage } from './types'
import { getCreditRateForModel, calculateCreditsUsed, deductAiCredits } from './credits'

export interface LogAiUsageArgs {
  accountId: string
  /** Null for a draft not tied to one thread, or when the row was
   *  deleted between generation and logging. */
  conversationId: string | null
  mode: 'auto_reply' | 'draft'
  provider: AiProvider
  model: string
  /** Provider usage; a no-op when null (nothing worth recording). */
  usage: AiUsage | null
}

/**
 * Best-effort append to `ai_usage_log` — one row per LLM call, for cost
 * visibility on the account's AI credit spend. NEVER throws: usage
 * accounting must not fail a reply the customer is waiting on, so any DB
 * error is logged and swallowed. Skips entirely when the provider didn't
 * report usage (we'd only be writing zeros).
 *
 * Also deducts credits from the tenant's balance.
 */
export async function logAiUsage(
  db: SupabaseClient,
  args: LogAiUsageArgs,
): Promise<void> {
  if (!args.usage) return

  // Calculate credit cost
  let creditsUsed = 0
  try {
    const rate = await getCreditRateForModel(db, args.provider, args.model)
    if (rate) {
      creditsUsed = calculateCreditsUsed(rate, args.usage)
    }
  } catch (err) {
    console.error('[ai usage] credit calculation failed:', err)
  }

  // Log usage
  try {
    const { error } = await db.from('ai_usage_log').insert({
      account_id: args.accountId,
      conversation_id: args.conversationId,
      mode: args.mode,
      provider: args.provider,
      model: args.model,
      prompt_tokens: args.usage.promptTokens,
      completion_tokens: args.usage.completionTokens,
      total_tokens: args.usage.totalTokens,
      credits_used: creditsUsed,
    })
    if (error) {
      console.error('[ai usage] log insert failed:', error)
    }
  } catch (err) {
    console.error('[ai usage] log insert threw:', err)
  }

  // Deduct credits from tenant balance (fire-and-forget)
  if (creditsUsed > 0) {
    try {
      const deducted = await deductAiCredits(db, args.accountId, creditsUsed)
      if (!deducted) {
        console.warn(
          `[ai usage] insufficient credits for account ${args.accountId} — ` +
          `needed ${creditsUsed}, deduction failed`,
        )
      }
    } catch (err) {
      console.error('[ai usage] credit deduction threw:', err)
    }
  }
}
