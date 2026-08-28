import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply, validateOutput } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { engineSendText } from '@/lib/flows/meta-send'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { checkAiCredits, calculateCreditCost } from './credits'
import { AiError } from './types'

interface DispatchArgs {
  accountId: string
  conversationId: string
  contactId: string
  configOwnerUserId: string
}

/**
 * Default messages for when AI can't handle a conversation.
 * Context-aware: different messages for different skip reasons.
 */
const DEFAULT_MESSAGES = {
  /** No AI config or AI is disabled for this account */
  noAi: "Thanks for your message! Our team will get back to you shortly.",
  /** AI credits exhausted */
  noCredits: "Thanks for your message! Our team will respond as soon as possible.",
  /** Outside working hours */
  outsideHours: "Thanks for your message! Our business hours are Monday to Friday, 9 AM to 5 PM. We'll respond when we're back.",
  /** Human agent assigned — AI steps back */
  humanAssigned: "A team member has been assigned to your conversation and will respond shortly.",
  /** AI can't handle — handing off to human */
  handoff: "I've connected you with our team. A human agent will take over shortly.",
  /** Reply cap reached */
  replyCapReached: "Thanks for your message! A team member will continue this conversation.",
  /** Rate limited */
  rateLimited: "Thanks for your message! Our team will respond shortly.",
  /** General fallback */
  fallback: "Thanks for your message! Our team will get back to you shortly.",
} as const

/**
 * Send a default acknowledgment message to the customer.
 * Used when AI can't handle the conversation.
 */
async function sendDefaultMessage(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  reason: keyof typeof DEFAULT_MESSAGES,
): Promise<void> {
  const text = DEFAULT_MESSAGES[reason] || DEFAULT_MESSAGES.fallback

  try {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: false,
    })
  } catch (err) {
    console.error(`[ai auto-reply] failed to send default message (${reason}):`, err)
  }
}

/**
 * Check if the current message matches any active auto-responder.
 * Returns true if a matching automation exists (AI should skip).
 * Returns false if no match (AI should handle it).
 */
async function messageMatchesAutoResponder(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  messageText: string,
): Promise<boolean> {
  // Get active auto-responders with keyword triggers
  const { data: automations } = await db
    .from('automations')
    .select('id, trigger_config')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .in('trigger_type', ['keyword_match'])

  if (!automations || automations.length === 0) return false

  // Check if message matches any keyword pattern
  const lowerText = messageText.toLowerCase()
  for (const auto of automations) {
    const config = auto.trigger_config as Record<string, unknown> | null
    const keywords = config?.keywords as string[] | undefined
    if (keywords && Array.isArray(keywords)) {
      for (const kw of keywords) {
        if (lowerText.includes(kw.toLowerCase())) {
          return true
        }
      }
    }
  }

  return false
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * When AI is available:
 *  - AI handles all messages
 *  - On handoff, sends notification to customer
 *  - On skip, sends context-aware default message
 *
 * When AI is NOT available:
 *  - Sends default acknowledgment message
 *  - Auto-assign still runs in background
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const { accountId, conversationId, contactId, configOwnerUserId } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig()
    console.log('[dispatchInboundToAiReply] config:', config ? `provider=${config.provider}, autoReplyEnabled=${config.autoReplyEnabled}` : 'NULL')

    // ── AI NOT AVAILABLE ──────────────────────────────────────
    if (!config || !config.autoReplyEnabled) {
      // No AI — send default message and let auto-assign handle it
      console.log('[dispatchInboundToAiReply] AI not available, sending noAi message')
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noAi')
      return
    }

    // ── CHECK CREDITS ─────────────────────────────────────────
    // First package (starter) is exempt from AI credit check
    const { data: settings } = await db
      .from('tenant_settings')
      .select('plan')
      .eq('account_id', accountId)
      .maybeSingle();

    console.log('[dispatchInboundToAiReply] plan:', settings?.plan, 'is exempt:', settings?.plan === 'starter')

    const isCreditCheckExempt = settings?.plan === 'starter';

    if (!isCreditCheckExempt) {
      const hasCredits = await checkAiCredits(db, accountId)
      console.log('[dispatchInboundToAiReply] hasCredits:', hasCredits)
      if (!hasCredits) {
        console.log('[dispatchInboundToAiReply] no credits, sending noCredits message')
        await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noCredits')
        return
      }
    }

    // ── CHECK WORKING HOURS ───────────────────────────────────
    const { data: withinHours } = await db.rpc('is_within_working_hours', {
      p_account_id: accountId,
    })
    if (withinHours === false) {
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'outsideHours')
      return
    }

    // ── CHECK AUTO-RESPONDERS (keyword match only) ────────────
    // Only skip AI if the message actually matches a keyword automation.
    // AI handles all non-matching messages.
    const { data: conv } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count, last_message_text, human_assigned_at, human_replied')
      .eq('id', conversationId)
      .maybeSingle()
    console.log('[dispatchInboundToAiReply] conv:', conv ? `assigned=${conv.assigned_agent_id}, ai_disabled=${conv.ai_autoreply_disabled}, reply_count=${conv.ai_reply_count}` : 'NULL')
    if (!conv) {
      // This shouldn't happen in normal flow — findOrCreateConversation runs first.
      // But if it does (race condition, eventual consistency), create one and let
      // the customer know we received their message.
      console.warn('[dispatchInboundToAiReply] no conversation found — this should not happen in normal flow')
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noAi')
      return
    }

    // Check if message matches a keyword automation
    const lastMessage = conv.last_message_text || ''
    const matchesAutoResponder = await messageMatchesAutoResponder(db, accountId, lastMessage)
    console.log('[dispatchInboundToAiReply] matchesAutoResponder:', matchesAutoResponder)
    if (matchesAutoResponder) {
      console.log('[dispatchInboundToAiReply] matches keyword automation, skipping AI')
      return
    }

    // ── CHECK HUMAN TIMEOUT ───────────────────────────────────
    // If human is assigned but hasn't replied, check if timeout elapsed.
    // If timeout → re-enable AI and let it handle.
    if (conv.assigned_agent_id && conv.human_assigned_at && !conv.human_replied) {
      const { data: settings } = await db
        .from('tenant_settings')
        .select('ai_human_timeout_minutes')
        .eq('account_id', accountId)
        .maybeSingle()

      const timeoutMinutes = settings?.ai_human_timeout_minutes ?? 5
      const assignedAt = new Date(conv.human_assigned_at)
      const now = new Date()
      const minutesSinceAssigned = (now.getTime() - assignedAt.getTime()) / (1000 * 60)

      if (minutesSinceAssigned >= timeoutMinutes) {
        // Timeout elapsed — human hasn't replied, re-enable AI
        console.log(`[ai auto-reply] human timeout (${timeoutMinutes}min) elapsed for conversation ${conversationId} — re-enabling AI`)
        await db
          .from('conversations')
          .update({
            ai_autoreply_disabled: false,
            human_replied: false,
            human_assigned_at: null,
          })
          .eq('id', conversationId)

        // Clear assigned agent so AI can handle
        conv.assigned_agent_id = null
        conv.ai_autoreply_disabled = false
      } else {
        // Human is assigned, hasn't replied yet, but timeout hasn't elapsed
        // Stay quiet — give human more time
        console.log('[dispatchInboundToAiReply] human assigned, timeout not elapsed, skipping')
        return
      }
    }

    // ── CHECK CONVERSATION STATE ──────────────────────────────
    if (conv.assigned_agent_id) {
      // Human assigned and has replied (or just assigned, within timeout)
      console.log('[dispatchInboundToAiReply] human assigned, skipping')
      return
    }
    if (conv.ai_autoreply_disabled) {
      console.log('[dispatchInboundToAiReply] ai_autoreply_disabled=true, skipping')
      return
    }
    if (conv.ai_reply_count >= config.autoReplyMaxPerConversation) {
      console.log('[dispatchInboundToAiReply] reply cap reached, sending replyCapReached')
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'replyCapReached')
      return
    }

    // ── BUILD CONTEXT & GENERATE ──────────────────────────────
    const ctx = await buildConversationContext(db, conversationId)
    console.log('[dispatchInboundToAiReply] context messages:', ctx.messages.length)
    if (ctx.messages.length === 0) {
      // Nearly impossible in normal flow — the inbound message was just inserted.
      // If it happens (e.g., race with another concurrent insert), acknowledge to
      // the customer so they're not left waiting.
      console.warn('[dispatchInboundToAiReply] no messages in context — this should not happen in normal flow')
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noAi')
      return
    }

    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'rateLimited')
      return
    }

    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      config,
      latestUserMessage(ctx.messages),
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    const { text, handoff, usage } = await generateReply({
      config,
      systemPrompt,
      messages: ctx.messages,
    })

    const creditsUsed = calculateCreditCost({
      contextLength: ctx.messageCount,
      hasKnowledge: !!knowledge,
      hasAttachment: ctx.hasAttachment,
      model: config.model,
      isHandoff: handoff,
    })

    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: config.provider,
      model: config.model,
      usage,
      creditsUsed,
    })

    // ── VALIDATE OUTPUT ───────────────────────────────────────
    let reply
    try {
      reply = validateOutput(text)
    } catch (err) {
      if (err instanceof AiError) {
        console.warn(`[ai auto-reply] output validation failed (${err.code}) — handing off.`)
        reply = { type: 'handoff' as const }
      } else {
        throw err
      }
    }

    // ── HANDOFF ───────────────────────────────────────────────
    if (reply.type === 'handoff' || handoff) {
      // Send handoff message to customer FIRST
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'handoff')

      // Then disable AI and assign to human
      const summary = buildHandoffSummary({
        messages: ctx.messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      if (config.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = config.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)
      return
    }

    // ── SEND AI REPLY ─────────────────────────────────────────
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: config.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: reply.text,
      aiGenerated: true,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}
