import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply, validateOutput } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { engineSendText, engineSendInteractiveButtons } from '@/lib/flows/meta-send'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { checkAiCredits, calculateCreditCost } from './credits'
import { AiError, type ChatMessage } from './types'
import { getToolsForBusinessType, executeToolCalls, hasToolCalls, ToolContext } from './tools'
import { parseOrderButtonId } from './tools'

interface DispatchArgs {
  accountId: string
  conversationId: string
  contactId: string
  configOwnerUserId: string
  /** Present when the inbound message is a button/list tap. */
  interactiveReplyId?: string | null
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
 * Handle a button click for order actions (confirm, edit, cancel).
 * Called when the user taps an interactive button on a preview message.
 *
 * Flow:
 * - Confirm: looks up pending_orders → creates real order → sends 2 messages (details + payment) → deletes pending
 * - Edit: looks up pending_orders → sends context back to AI → AI collects changes → new preview
 * - Cancel: deletes pending_orders → sends cancellation message
 */
async function handleOrderButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: { action: string; orderId: string },
): Promise<void> {
  const { action: btnAction, orderId: pendingId } = action

  // Look up the pending order
  const { data: pending } = await db
    .from('pending_orders')
    .select('*')
    .eq('id', pendingId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (!pending) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'This order preview has expired or was already processed. Please send your delivery request again.',
      aiGenerated: true,
    })
    return
  }

  switch (btnAction) {
    case 'confirm': {
      // ── CREATE REAL ORDER ──────────────────────────────────
      // Get the offering for the order
      const offeringId = pending.offering_id
      const offeringName = pending.offering_name || 'Delivery Service'

      // Create the order — order_number auto-generated by DB
      const { data: order, error: orderErr } = await db
        .from('orders')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          status: 'confirmed',
          currency: pending.currency,
          subtotal: pending.price,
          tax_amount: 0,
          discount_amount: 0,
          total: pending.price,
          notes: pending.notes,
          metadata: {
            items: pending.items,
            item_count: pending.item_count,
            pickup_location: pending.pickup_location,
            dropoff_location: pending.dropoff_location,
            zone_type: pending.zone_type,
            vendor_stops: pending.vendor_stops,
            weight_kg: pending.weight_kg,
            customer_name: pending.customer_name,
            customer_phone: pending.customer_phone,
            offering_id: offeringId,
            offering_name: offeringName,
          },
        })
        .select('id, order_number, total, status, created_at')
        .single()

      if (orderErr || !order) {
        console.error('[order button] create order error:', orderErr)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to create your order. Please try again.',
          aiGenerated: true,
        })
        return
      }

      // Create order items
      const items = (pending.items as string[]) || []
      if (items.length > 0 && offeringId) {
        const orderItems = items.map((item: string) => ({
          order_id: order.id,
          offering_id: offeringId,
          name: item,
          quantity: 1,
          unit_price: order.total / items.length,
          total_price: order.total / items.length,
        }))
        await db.from('order_items').insert(orderItems)
      }

      // Assign rider
      const { data: members } = await db
        .from('account_memberships')
        .select('user_id, role, business_metadata')
        .eq('account_id', accountId)
        .in('role', ['rider', 'driver'])

      let riderName = 'Pending'
      if (members && members.length > 0) {
        const riderIds = members.map((m: any) => m.user_id)
        const { data: activeOrders } = await db
          .from('orders')
          .select('assigned_team_member_id')
          .eq('account_id', accountId)
          .in('status', ['pending', 'confirmed', 'processing'])
          .in('assigned_team_member_id', riderIds)

        const loadMap = new Map<string, number>()
        for (const id of riderIds) loadMap.set(id, 0)
        for (const o of activeOrders || []) {
          const id = o.assigned_team_member_id
          if (id) loadMap.set(id, (loadMap.get(id) || 0) + 1)
        }

        const scored = members.map((m: any) => {
          const meta = (m.business_metadata || {}) as Record<string, unknown>
          const logisticsMeta = (meta.logistics || {}) as Record<string, unknown>
          const activeLoad = loadMap.get(m.user_id) || 0
          const maxActive = (logisticsMeta.max_active_orders as number) || 5
          let score = (1 - activeLoad / maxActive) * 50
          if (activeLoad < maxActive) score += 30
          return { ...m, score, activeLoad, maxActive }
        })
        scored.sort((a: any, b: any) => b.score - a.score)
        const best = scored.find((r: any) => r.activeLoad < r.maxActive) || scored[0]

        if (best) {
          await db
            .from('orders')
            .update({ assigned_team_member_id: best.user_id, assigned_role: best.role })
            .eq('id', order.id)

          // Assign conversation to rider so they see it in their inbox
          await db
            .from('conversations')
            .update({
              assigned_agent_id: best.user_id,
              human_assigned_at: new Date().toISOString(),
              human_replied: false,
            })
            .eq('id', conversationId)
            .eq('account_id', accountId)

          const { data: profile } = await db
            .from('profiles')
            .select('full_name')
            .eq('user_id', best.user_id)
            .maybeSingle()
          riderName = profile?.full_name || 'Assigned'
        }
      }

      // ── MESSAGE 1: ORDER CONFIRMATION ──────────────────────
      const itemText = items.length > 0 ? items.map((i) => `• ${i}`).join('\n') : '• Items to deliver'
      const isWednesday = new Date().getDay() === 3
      const wedNote = isWednesday ? '\n\n💰 _Wednesday discount applied!_' : ''

      const confirmationMsg =
        `✅ *Order Confirmed!*\n\n` +
        `*Order #:* ${order.order_number}\n` +
        `*Items:*\n${itemText}\n\n` +
        `*From:* ${pending.pickup_location || 'Pickup location'}\n` +
        `*To:* ${pending.dropoff_location}\n` +
        `*Zone:* ${pending.zone_type}\n` +
        `*Total:* ${pending.currency} ${order.total}\n` +
        `*Rider:* ${riderName}` +
        wedNote

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: confirmationMsg,
        aiGenerated: true,
      })

      // ── MESSAGE 2: PAYMENT DETAILS ─────────────────────────
      const { data: settings } = await db
        .from('tenant_settings')
        .select('payment_methods')
        .eq('account_id', accountId)
        .maybeSingle()

      const paymentMethods = (settings?.payment_methods || []) as Array<{
        type: string
        name: string
        till_number?: string
        paybill_number?: string
        account_number?: string
        bank_name?: string
        instructions?: string
      }>

      let paymentMsg: string

      if (paymentMethods.length > 0) {
        let paymentLines = `*Amount:* ${pending.currency} ${order.total}\n*Order:* ${order.order_number}\n`
        paymentLines += `\n*Payment Methods:*\n`
        for (const method of paymentMethods) {
          if (method.type === 'mpesa_till' && method.till_number) {
            paymentLines += `• *${method.name}:* ${method.till_number}\n`
          } else if (method.type === 'mpesa_paybill' && method.paybill_number) {
            paymentLines += `• *${method.name}:* ${method.paybill_number}`
            if (method.account_number) paymentLines += ` (Acc: ${method.account_number})`
            paymentLines += `\n`
          } else if (method.type === 'bank_transfer') {
            paymentLines += `• *${method.name}:*`
            if (method.bank_name) paymentLines += ` ${method.bank_name}`
            if (method.account_number) paymentLines += ` (${method.account_number})`
            paymentLines += `\n`
          } else if (method.type === 'cash') {
            paymentLines += `• *${method.name}*\n`
          } else {
            paymentLines += `• *${method.name}*\n`
          }
          if (method.instructions) {
            paymentLines += `  _${method.instructions}_\n`
          }
        }
        paymentLines += `\nSend payment confirmation screenshot once paid.`
        paymentMsg = `💳 *Payment Details*\n\n${paymentLines}`
      } else {
        paymentMsg =
          `💳 *Payment*\n\n` +
          `*Amount:* ${pending.currency} ${order.total}\n` +
          `*Order:* ${order.order_number}\n\n` +
          `Our payment handler will reach out to you shortly with payment instructions.\n` +
          `Please standby.`
      }

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: paymentMsg,
        aiGenerated: true,
      })

      // Delete the pending order
      await db.from('pending_orders').delete().eq('id', pendingId)
      break
    }

    case 'edit': {
      // ── SEND CONTEXT BACK TO AI ────────────────────────────
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'What would you like to change?\n\n• Pickup location\n• Dropoff location\n• Items\n• Special instructions\n• Customer name',
        aiGenerated: true,
      })

      // Store the pending ID in conversation metadata so AI can reference it
      const { data: convMeta } = await db
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .maybeSingle()

      await db
        .from('conversations')
        .update({
          metadata: {
            ...(convMeta?.metadata || {}),
            editing_pending_order_id: pendingId,
          },
        })
        .eq('id', conversationId)
      break
    }

    case 'cancel': {
      // ── DELETE PENDING ORDER ────────────────────────────────
      await db.from('pending_orders').delete().eq('id', pendingId)

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: '❌ Order cancelled.\n\nIf you\'d like to place a new order, just let me know!',
        aiGenerated: true,
      })
      break
    }

    default:
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'I\'m not sure what to do with that action. How can I help?',
        aiGenerated: true,
      })
  }
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
  const { accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId } = args

  try {
    const db = supabaseAdmin()

    const config = await loadAiConfig()
    console.log('[dispatchInboundToAiReply] config:', config ? `provider=${config.provider}, autoReplyEnabled=${config.autoReplyEnabled}` : 'NULL')

    // ── AI NOT AVAILABLE ──────────────────────────────────────
    if (!config || !config.autoReplyEnabled) {
      // No AI — but still handle order buttons (they don't need AI)
      if (interactiveReplyId) {
        const buttonAction = parseOrderButtonId(interactiveReplyId)
        if (buttonAction) {
          console.log(`[dispatchInboundToAiReply] button click (no AI config): ${buttonAction.action}`)
          await handleOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, buttonAction)
          return
        }
      }
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noAi')
      return
    }

    // ── BUTTON CLICK HANDLING (before credits check) ──────────
    // Order buttons always work — they don't consume AI credits.
    if (interactiveReplyId) {
      const buttonAction = parseOrderButtonId(interactiveReplyId)
      if (buttonAction) {
        console.log(`[dispatchInboundToAiReply] button click: ${buttonAction.action} on order ${buttonAction.orderId}`)
        await handleOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, buttonAction)
        return
      }
    }

    // ── CHECK CREDITS ─────────────────────────────────────────
    const hasCredits = await checkAiCredits(db, accountId)
    console.log('[dispatchInboundToAiReply] hasCredits:', hasCredits)
    if (!hasCredits) {
      console.log('[dispatchInboundToAiReply] no credits, sending noCredits message')
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noCredits')
      return
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

    // ── CHECK HUMAN ASSIGNMENT ────────────────────────────────
    // If human is assigned and has actively replied, AI stays quiet.
    // If human is assigned but hasn't replied yet, AI steps in immediately
    // so the customer isn't left waiting.
    if (conv.assigned_agent_id) {
      if (conv.human_replied) {
        // Human is actively handling — AI stays out
        console.log('[dispatchInboundToAiReply] human assigned and replied, skipping AI')
        return
      }
      // Human assigned but hasn't replied — clear assignment so AI handles
      console.log(`[dispatchInboundToAiReply] human assigned but hasn't replied — clearing assignment for AI on conversation ${conversationId}`)
      await db
        .from('conversations')
        .update({
          assigned_agent_id: null,
          human_assigned_at: null,
          human_replied: false,
        })
        .eq('id', conversationId)
      conv.assigned_agent_id = null
    }

    // ── CHECK CONVERSATION STATE ──────────────────────────────
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

    // Fetch business type for tone adaptation
    const { data: account } = await db
      .from('accounts')
      .select('business_type')
      .eq('id', accountId)
      .maybeSingle()
    const businessType = account?.business_type || null

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
      5,
      { imageUrl: ctx.latestImageUrl },
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
      businessType,
    })

    // ── EDIT MODE CONTEXT ────────────────────────────────────
    // If the user is editing a pending order, load it and inject
    // the data into the conversation so AI knows what to ask about.
    let editingPendingOrder: Record<string, unknown> | null = null
    const { data: convMeta } = await db
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .maybeSingle()

    const pendingOrderId = convMeta?.metadata?.editing_pending_order_id as string | undefined
    if (pendingOrderId) {
      const { data: pendingOrder } = await db
        .from('pending_orders')
        .select('*')
        .eq('id', pendingOrderId)
        .eq('account_id', accountId)
        .maybeSingle()

      if (pendingOrder) {
        editingPendingOrder = pendingOrder as Record<string, unknown>
        console.log('[dispatchInboundToAiReply] editing pending order:', pendingOrderId)
      } else {
        // Pending order expired or was processed — clear the metadata
        await db
          .from('conversations')
          .update({ metadata: { ...(convMeta?.metadata || {}), editing_pending_order_id: null } })
          .eq('id', conversationId)
      }
    }

    // ── TOOL EXECUTION LOOP ────────────────────────────────────
    // AI gets tools based on business type. If it returns tool calls,
    // we execute them and feed results back. Max 5 iterations to
    // prevent infinite loops.
    const tools = getToolsForBusinessType(businessType)
    const toolDefs = tools.map((t) => ({ type: 'function' as const, function: t.definition.function }))

    const toolCtx: ToolContext = {
      db,
      accountId,
      conversationId,
      contactId,
      contactPhone: null,
      contactName: null,
      businessType,
      userId: configOwnerUserId,
    }

    // Fetch contact details for tool context
    const { data: contact } = await db
      .from('contacts')
      .select('phone, name')
      .eq('id', contactId)
      .maybeSingle()
    if (contact) {
      toolCtx.contactPhone = contact.phone
      toolCtx.contactName = contact.name
    }

    let toolMessages: ChatMessage[] = [...ctx.messages]

    // If editing a pending order, inject context into the conversation
    if (editingPendingOrder) {
      const items = (editingPendingOrder.items as string[]) || []
      const contextMsg =
        `[SYSTEM: The customer is editing a pending delivery order. Here are the current details — apply changes the customer mentions.]\n\n` +
        `Current order preview:\n` +
        `- Items: ${items.join(', ')}\n` +
        `- Pickup: ${editingPendingOrder.pickup_location || 'Not set'}\n` +
        `- Dropoff: ${editingPendingOrder.dropoff_location}\n` +
        `- Zone: ${editingPendingOrder.zone_type}\n` +
        `- Price: ${editingPendingOrder.currency} ${editingPendingOrder.price}\n` +
        `- Notes: ${editingPendingOrder.notes || 'None'}\n` +
        `- Customer name: ${editingPendingOrder.customer_name || 'Not set'}\n` +
        `- Weight: ${editingPendingOrder.weight_kg || 'Not specified'}kg\n\n` +
        `After applying changes, call preview_delivery_order with the updated details. ` +
        `Delete the old pending order after creating the new preview.`

      // Add as a system-style user message at the beginning
      toolMessages.unshift({ role: 'user', content: contextMsg })
    }

    let finalText = ''
    let finalHandoff = false
    let finalButtons: Array<{ id: string; title: string }> | null = null
    let finalHeader: string | undefined
    let finalFooter: string | undefined
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let lastUsage = null

    const MAX_TOOL_ROUNDS = 5
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const result = await generateReply({
        config,
        systemPrompt,
        messages: toolMessages,
        tools: toolDefs.length > 0 ? toolDefs : undefined,
      })

      console.log('[ai-tool-loop] round:', round, {
        hasToolCalls: hasToolCalls({ tool_calls: result.tool_calls }),
        toolCallCount: result.tool_calls?.length ?? 0,
        toolNames: result.tool_calls?.map((tc: any) => tc.function?.name) ?? [],
        textPreview: (result.text || '').slice(0, 200),
        handoff: result.handoff,
      })

      // Track cumulative usage
      if (result.usage) {
        lastUsage = result.usage
        totalUsage.promptTokens += result.usage.promptTokens
        totalUsage.completionTokens += result.usage.completionTokens
        totalUsage.totalTokens += result.usage.totalTokens
      }

      // If no tool calls, we have our final text response
      if (!hasToolCalls({ tool_calls: result.tool_calls })) {
        finalText = result.text
        finalHandoff = result.handoff
        console.log('[ai-tool-loop] no tool calls — final text:', (result.text || '').slice(0, 300))
        break
      }

      // Execute tool calls
      const toolResults = await executeToolCalls(result.tool_calls!, toolCtx)

      console.log('[ai-tool-loop] round:', round, 'tool results:',
        toolResults.map(tr => ({ id: tr.tool_call_id, contentPreview: tr.content.slice(0, 200) }))
      )

      // Capture buttons from tool results (for interactive responses)
      for (const tr of toolResults) {
        try {
          const parsed = JSON.parse(tr.content)
          if (parsed.buttons && Array.isArray(parsed.buttons) && parsed.buttons.length > 0) {
            finalButtons = parsed.buttons
            finalHeader = parsed.header
            finalFooter = parsed.footer

            // If we were editing and a new preview was created, delete the old pending order
            if (editingPendingOrder && parsed.pending_order_id) {
              await db.from('pending_orders').delete().eq('id', editingPendingOrder.id)
              // Clear the editing state from conversation metadata
              await db
                .from('conversations')
                .update({ metadata: { ...(convMeta?.metadata || {}), editing_pending_order_id: null } })
                .eq('id', conversationId)
              editingPendingOrder = null
              console.log('[dispatchInboundToAiReply] deleted old pending order after edit')
            }
          }
          // Use the structured response message if available
          if (parsed.response && !finalText) {
            finalText = parsed.response
          }
        } catch {
          // Not JSON, ignore
        }
      }

      // Add assistant message with tool calls to history
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.text || '',
        tool_calls: result.tool_calls,
      }
      toolMessages.push(assistantMsg)

      // Add tool results to history
      for (const tr of toolResults) {
        toolMessages.push({
          role: 'tool' as const,
          content: tr.content,
          tool_call_id: tr.tool_call_id,
        })
      }

      // If this was the last round, use whatever text we have
      if (round === MAX_TOOL_ROUNDS - 1) {
        finalText = result.text || 'I processed your request. Let me know if you need anything else.'
        finalHandoff = false
      }
    }

    const text = finalText
    const handoff = finalHandoff

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
      usage: lastUsage || totalUsage,
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

    // Send interactive buttons if available, otherwise plain text
    if (finalButtons && finalButtons.length > 0 && reply.text) {
      try {
        await engineSendInteractiveButtons({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          bodyText: reply.text,
          headerText: finalHeader,
          footerText: finalFooter,
          buttons: finalButtons.map((b) => ({ id: b.id, title: b.title })),
        })
      } catch (btnErr) {
        console.error('[ai auto-reply] failed to send interactive buttons, falling back to text:', btnErr)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: reply.text,
          aiGenerated: true,
        })
      }
    } else {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: reply.text,
        aiGenerated: true,
      })
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}
