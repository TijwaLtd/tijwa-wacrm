import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage } from './types'
import { aiContextMessageLimit } from './defaults'

interface DbMessage {
  sender_type: 'customer' | 'agent' | 'bot'
  content_text: string | null
  content_type: string
  media_url: string | null
}

export interface ConversationContext {
  messages: ChatMessage[]
  /** Number of messages with text content */
  messageCount: number
  /** Whether any message has an attachment (image, document, etc.) */
  hasAttachment: boolean
}

/**
 * Fetch the last N messages of a conversation and map them to the
 * provider-neutral chat shape. Includes:
 *   - Text messages (content_type = 'text')
 *   - Media messages WITH captions (content_type in image/video/document)
 *
 * Excludes:
 *   - Media messages without captions (no text for model)
 *   - Audio, sticker, location, reaction messages (no text value)
 *
 * Ordered oldest-first (chronological) so the transcript reads
 * naturally and the most recent customer message lands last.
 */
export async function buildConversationContext(
  db: SupabaseClient,
  conversationId: string,
  limit: number = aiContextMessageLimit(),
): Promise<ConversationContext> {
  const { data, error } = await db
    .from('messages')
    .select('sender_type, content_text, content_type, media_url')
    .eq('conversation_id', conversationId)
    .in('content_type', ['text', 'image', 'video', 'document'])
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  const rows = ((data ?? []) as DbMessage[]).reverse()

  // Filter to messages with text content
  const textMessages = rows.filter((m) => m.content_text && m.content_text.trim())

  // Detect if any message has an attachment
  const hasAttachment = rows.some(
    (m) => m.media_url && ['image', 'video', 'document'].includes(m.content_type),
  )

  return {
    messages: textMessages.map((m) => ({
      role: m.sender_type === 'customer' ? 'user' : 'assistant',
      content: m.content_text!.trim(),
    })),
    messageCount: textMessages.length,
    hasAttachment,
  }
}
