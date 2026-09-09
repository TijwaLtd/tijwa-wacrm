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
  /** Latest image URL sent by customer, if any */
  latestImageUrl?: string | null
}

/**
 * Fetch the last N messages of a conversation and map them to the
 * provider-neutral chat shape.
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

  // Find latest customer image URL if present
  const latestCustomerImage = [...rows]
    .reverse()
    .find((m) => m.sender_type === 'customer' && m.content_type === 'image' && m.media_url)

  // Map messages to ChatMessage objects, filling in image description fallback for image-only messages
  const mappedMessages: ChatMessage[] = rows
    .map((m) => {
      let text = m.content_text?.trim() || ''
      if (!text && m.content_type === 'image') {
        text = '[Customer sent an image]'
      }
      if (!text) return null

      return {
        role: m.sender_type === 'customer' ? 'user' : 'assistant',
        content: text,
      } as ChatMessage
    })
    .filter(Boolean) as ChatMessage[]

  const hasAttachment = rows.some(
    (m) => m.media_url && ['image', 'video', 'document'].includes(m.content_type),
  )

  return {
    messages: mappedMessages,
    messageCount: mappedMessages.length,
    hasAttachment,
    latestImageUrl: latestCustomerImage?.media_url || null,
  }
}
