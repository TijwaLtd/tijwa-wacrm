import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildConversationContext } from './context'

/** Minimal fake matching the query chain in buildConversationContext:
 *  from().select().eq().in().order().limit() → { data, error }. */
function fakeDb(rows: unknown[]): SupabaseClient {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => Promise.resolve({ data: rows, error: null }),
  }
  return chain as unknown as SupabaseClient
}

describe('buildConversationContext', () => {
  it('maps sender_type to role and returns chronological order', async () => {
    const rows = [
      { sender_type: 'customer', content_text: 'third', content_type: 'text', media_url: null },
      { sender_type: 'agent', content_text: 'second', content_type: 'text', media_url: null },
      { sender_type: 'customer', content_text: 'first', content_type: 'text', media_url: null },
    ]
    const ctx = await buildConversationContext(fakeDb(rows), 'conv-1')
    expect(ctx.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'third' },
    ])
    expect(ctx.messageCount).toBe(3)
    expect(ctx.hasAttachment).toBe(false)
  })

  it('treats bot messages as assistant', async () => {
    const ctx = await buildConversationContext(
      fakeDb([{ sender_type: 'bot', content_text: 'auto reply', content_type: 'text', media_url: null }]),
      'conv-1',
    )
    expect(ctx.messages).toEqual([{ role: 'assistant', content: 'auto reply' }])
  })

  it('drops empty / whitespace-only messages', async () => {
    const ctx = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_text: '   ', content_type: 'text', media_url: null },
        { sender_type: 'customer', content_text: null, content_type: 'text', media_url: null },
        { sender_type: 'customer', content_text: 'real', content_type: 'text', media_url: null },
      ]),
      'conv-1',
    )
    expect(ctx.messages).toEqual([{ role: 'user', content: 'real' }])
  })

  it('detects media attachments', async () => {
    const ctx = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_text: 'check this', content_type: 'image', media_url: 'https://example.com/img.jpg' },
        { sender_type: 'customer', content_text: 'hello', content_type: 'text', media_url: null },
      ]),
      'conv-1',
    )
    expect(ctx.hasAttachment).toBe(true)
    expect(ctx.messages).toEqual([{ role: 'user', content: 'hello' }, { role: 'user', content: 'check this' }])
  })

  it('includes media messages with captions but excludes captionless media', async () => {
    const ctx = await buildConversationContext(
      fakeDb([
        { sender_type: 'customer', content_text: null, content_type: 'image', media_url: 'https://example.com/img.jpg' },
        { sender_type: 'customer', content_text: 'what is this?', content_type: 'image', media_url: 'https://example.com/img2.jpg' },
      ]),
      'conv-1',
    )
    expect(ctx.messages).toEqual([{ role: 'user', content: 'what is this?' }])
    expect(ctx.hasAttachment).toBe(true)
  })
})
