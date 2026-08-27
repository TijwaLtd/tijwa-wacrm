import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiProvider, AiUsage } from './types'
import { deductAiCredits } from './credits'

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
  /** Pre-calculated credit cost from calculateCreditCost() */
  creditsUsed: number
}

/**
 * Best-effort append to `ai_usage_log` — one row per LLM call, for cost
 * visibility on the account's AI credit spend. NEVER throws: usage
 * accounting must not fail a reply the customer is waiting on, so any DB
 * error is logged and swallowed.
 *
 * Credits are calculated BEFORE the LLM call based on operation complexity,
 * not after based on tokens. This makes costs predictable for users.
 */
export async function logAiUsage(
  db: SupabaseClient,
  args: LogAiUsageArgs,
): Promise<void> {
  if (!args.usage) return
  // Log usage
  try {
    const { error } = await db.from('ai_usage_log').insert({
      account_id: args.accountId,
      conversation_id: args.conversationId,
      mode: args.mode,
      provider: args.provider,
      model: args.model,
      prompt_tokens: args.usage?.promptTokens ?? 0,
      completion_tokens: args.usage?.completionTokens ?? 0,
      total_tokens: args.usage?.totalTokens ?? 0,
      credits_used: args.creditsUsed,
    })
    if (error) {
      console.error('[ai usage] log insert failed:', error)
    }
  } catch (err) {
    console.error('[ai usage] log insert threw:', err)
  }

  // Deduct credits from tenant balance (fire-and-forget)
  if (args.creditsUsed > 0) {
    try {
      const deducted = await deductAiCredits(db, args.accountId, args.creditsUsed)
      if (!deducted) {
        console.warn(
          `[ai usage] insufficient credits for account ${args.accountId} — ` +
          `needed ${args.creditsUsed}, deduction failed`,
        )
      }
    } catch (err) {
      console.error('[ai usage] credit deduction threw:', err)
    }
  }
}
