import { describe, it, expect, vi } from 'vitest'
import { logAiUsage } from './usage'
import type { SupabaseClient } from '@supabase/supabase-js'

function fakeDb() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
  const db = { from: vi.fn(() => ({ insert })), rpc }
  return { db: db as unknown as SupabaseClient, insert, rpc }
}

describe('logAiUsage', () => {
  it('inserts a row with pre-calculated creditsUsed', async () => {
    const { db, insert } = fakeDb()
    await logAiUsage(db, {
      accountId: 'acct-1',
      conversationId: 'conv-1',
      mode: 'auto_reply',
      provider: 'anthropic',
      model: 'claude-x',
      usage: { promptTokens: 30, completionTokens: 6, totalTokens: 36 },
      creditsUsed: 0.5,
    })
    expect(insert).toHaveBeenCalledWith({
      account_id: 'acct-1',
      conversation_id: 'conv-1',
      mode: 'auto_reply',
      provider: 'anthropic',
      model: 'claude-x',
      prompt_tokens: 30,
      completion_tokens: 6,
      total_tokens: 36,
      credits_used: 0.5,
    })
  })

  it('deducts credits when creditsUsed > 0', async () => {
    const { db, rpc } = fakeDb()
    await logAiUsage(db, {
      accountId: 'acct-1',
      conversationId: 'conv-1',
      mode: 'auto_reply',
      provider: 'openai',
      model: 'gpt-x',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      creditsUsed: 0.2,
    })
    expect(rpc).toHaveBeenCalledWith('deduct_ai_credits', {
      p_account_id: 'acct-1',
      p_credits: 0.2,
    })
  })

  it('is a no-op when usage is null (no insert, no deduct)', async () => {
    const { db, insert, rpc } = fakeDb()
    await logAiUsage(db, {
      accountId: 'acct-1',
      conversationId: null,
      mode: 'draft',
      provider: 'openai',
      model: 'gpt-x',
      usage: null,
      creditsUsed: 0,
    })
    expect(insert).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never throws when the insert errors', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const db = { from: vi.fn(() => ({ insert })), rpc } as unknown as SupabaseClient
    await expect(
      logAiUsage(db, {
        accountId: 'acct-1',
        conversationId: 'conv-1',
        mode: 'draft',
        provider: 'openai',
        model: 'gpt-x',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        creditsUsed: 0.2,
      }),
    ).resolves.toBeUndefined()
  })
})
