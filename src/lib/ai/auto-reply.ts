import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply, validateOutput } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { engineSendText, engineSendInteractiveButtons, engineSendMedia, engineSendInteractiveList } from '@/lib/flows/meta-send'
import { buildPaymentMessage } from './payment'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { checkAiCredits, calculateCreditCost } from './credits'
import { AiError, type ChatMessage } from './types'
import { getToolsForBusinessType, executeToolCalls, hasToolCalls, ToolContext } from './tools'
import { parseOrderButtonId, parseFoodOrderButtonId, parseReservationButtonId, parseBookingButtonId, parsePropertyInquiryButtonId, parseProductOrderButtonId, parseMenuMoreButtonId, parseRoomMoreButtonId, parseProductMoreButtonId, parseServiceMoreButtonId, parsePropertyMoreButtonId, parseNgoProgramMoreButtonId, parseNgoCourseMoreButtonId, parseCartButtonId, parseOfferingMoreButtonId } from './tools'
import { clampListSection, clampBody, listCtaFor, type ListSection } from './tools/list-format'
import {
  NEXT_WEEK_BUTTON_LABEL,
  attachScheduleContext,
  buildScheduleListSection,
  createBooking,
  isFutureDate,
  parseContextSlotId,
  parseStayLengthId,
  stayLengthSection,
  type ScheduleContextKind,
} from '@/lib/business/scheduling'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'
import { contactFormUrl, legalUrls, CONSENT_VERSION } from '@/lib/public/customer'
import { searchMenuItems } from './tools/restaurant'
import { searchRooms } from './tools/hotel'
import { searchProducts, getCart, addToCart, clearCart, formatCartSummary, getCartButtons, resolveCataloguePrices } from './tools/retailer'
import { searchServices } from './tools/services'
import { searchProperties } from './tools/property'
import { searchPrograms, searchCourses, enrollContactInCourse } from './tools/ngo'
import { logisticsToolHandlers } from './tools/logistics'
import { getEnabledCapabilityKeys } from '@/lib/business/account-capabilities'

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

// ============================================================
// Customer consent + profile (public data-rights feature)
//
// Consent rules (one ask, three states — see enforceConsentGate):
//
//   SENT + IGNORED  = ACCEPTED. The moment the short consent message
//                     goes out we record the version with
//                     consent_tos_assumed_at set, so silence is
//                     unambiguously agreement. Nothing is re-asked.
//   ACCEPT (tap)    = their own action: accepted_at set, the
//                     assumed marker cleared.
//   DECLINE (tap)   = communication STOPS. Every later inbound gets
//                     the "you have to agree" reply instead of AI /
//                     flows / automations, until they tap Accept.
//
// The message carries ONE link — the policy page. Profile
// (name + email) is required at checkout only, rate-limited nudge.
// ============================================================

const PROFILE_NUDGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

interface PublicContext {
  slug: string
  ownerUserId: string
}

async function loadPublicContext(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
): Promise<PublicContext | null> {
  const { data } = await db
    .from('accounts')
    .select('subdomain, owner_user_id')
    .eq('id', accountId)
    .maybeSingle()
  if (!data?.subdomain || !data.owner_user_id) return null
  return { slug: data.subdomain, ownerUserId: data.owner_user_id }
}

/**
 * Send the Accept/Decline consent message and record the decision.
 *
 * Short on purpose: ONE link (the policy page — sidebar layout, both
 * documents) and nothing else. Records consent_asked_at AND, because
 * silence counts as agreement, the assumption itself
 * (version + accepted_at + consent_tos_assumed_at) as soon as Meta
 * accepts the send — so an ignored ask is already "agreed" rather than
 * a state we have to come back and resolve later. An explicit Accept
 * or Decline tap overwrites this in handleConsentTap.
 *
 * Ask-once semantics — the general hook never re-asks; the checkout
 * gate only re-sends if the first send never went out.
 */
async function sendConsentMessage(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  opts: { checkout?: boolean } = {},
): Promise<boolean> {
  const ctx = await loadPublicContext(db, accountId)
  if (!ctx) return false
  const urls = legalUrls(ctx.slug)

  // ONE link: the policy page. WhatsApp auto-links it, and it is the
  // only place the customer has to go — Terms and Privacy live there.
  const body = clampBody(
    opts.checkout
      ? `Before I can confirm, please accept our Terms of Service: ${urls.terms}`
      : `Please review and accept our Terms of Service: ${urls.terms}`,
  )

  try {
    await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText: body,
      buttons: [
        { id: 'consent_accept', title: 'Accept' },
        { id: 'consent_decline', title: 'Decline' },
      ],
    })
    const sentAt = new Date().toISOString()
    await db
      .from('contacts')
      .update({
        consent_asked_at: sentAt,
        // Ignoring the ask = agreeing (see banner). Recorded now so the
        // state is never ambiguous; Accept/Decline taps overwrite it.
        consent_tos_version: CONSENT_VERSION,
        consent_tos_accepted_at: sentAt,
        consent_tos_assumed_at: sentAt,
        consent_tos_declined_at: null,
      })
      .eq('account_id', accountId)
      .eq('id', contactId)
    return true
  } catch (err) {
    console.error('[ai auto-reply] failed to send consent message:', err)
    return false
  }
}

/**
 * Send a message linking to the customer's personal data page with a
 * tappable CTA URL button ("Open my page"). Meta also auto-hyperlinks
 * the URL in the body text, and the plain-text fallback below relies
 * on that if the interactive send fails. URL buttons never produce a
 * webhook tap, so no dispatch handling is needed for them.
 */
async function sendProfileLinkMessage(
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  link: string,
  bodyText: string,
): Promise<void> {
  const text = clampBody(bodyText)
  try {
    await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText: text,
      buttons: [{ title: 'Open my page', url: link }],
    })
  } catch (err) {
    console.error('[ai auto-reply] profile link button failed, sending plain text:', err)
    try {
      await engineSendText({ accountId, userId, conversationId, contactId, text, aiGenerated: false })
    } catch (textErr) {
      console.error('[ai auto-reply] profile link text fallback failed:', textErr)
    }
  }
}

/** Record the customer's Accept/Decline tap + audit + reply. */
async function handleConsentTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  interactiveReplyId: string,
): Promise<void> {
  const ctx = await loadPublicContext(db, accountId)
  const now = new Date().toISOString()
  const accepted = interactiveReplyId === 'consent_accept'

  await db
    .from('contacts')
    .update(
      accepted
        ? {
            consent_tos_version: CONSENT_VERSION,
            consent_tos_accepted_at: now,
            consent_tos_declined_at: null,
            // Their own tap now — no longer an assumption.
            consent_tos_assumed_at: null,
            consent_asked_at: now,
          }
        : {
            // Decline wipes any assumed acceptance and stops the
            // conversation (enforceConsentGate reads declined_at).
            consent_tos_version: null,
            consent_tos_accepted_at: null,
            consent_tos_assumed_at: null,
            consent_tos_declined_at: now,
            consent_asked_at: now,
          },
    )
    .eq('account_id', accountId)
    .eq('id', contactId)

  try {
    await AuditService.record({
      eventType: accepted ? AuditEventType.CONSENT_ACCEPTED : AuditEventType.CONSENT_DECLINED,
      accountId,
      actorUserId: ctx?.ownerUserId || userId,
      contactId,
      conversationId,
      metadata: { initiator: 'contact', version: accepted ? CONSENT_VERSION : null },
    })
  } catch (err) {
    console.error('[ai auto-reply] consent audit error:', err)
  }

  if (accepted) {
    const text = `Thanks — you've accepted our Terms of Service. If you were confirming an order or booking, tap Confirm again and we're set. Anything else I can help with?`
    try {
      await engineSendText({ accountId, userId, conversationId, contactId, text, aiGenerated: false })
    } catch (err) {
      console.error('[ai auto-reply] consent tap reply failed:', err)
    }
    return
  }

  // Decline: tell them straight away that the conversation is paused
  // and give them the one link + the Accept button to resume.
  await sendBlockedMessage(db, accountId, conversationId, contactId, userId)
}

/**
 * The single "you have to agree" message: short, ONE link (the policy
 * page), plus an Accept button so a declined customer can resume in
 * one tap. Used by the Decline tap and by enforceConsentGate on every
 * later inbound message while they stay declined.
 */
async function sendBlockedMessage(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
): Promise<void> {
  const ctx = await loadPublicContext(db, accountId)
  const url = ctx ? legalUrls(ctx.slug).terms : null
  const body = clampBody(
    url
      ? `To continue, you have to agree to our Terms of Service: ${url}`
      : `To continue, you have to agree to our Terms of Service.`,
  )
  try {
    await engineSendInteractiveButtons({
      accountId,
      userId,
      conversationId,
      contactId,
      bodyText: body,
      buttons: [{ id: 'consent_accept', title: 'Accept' }],
    })
  } catch (err) {
    console.error('[ai auto-reply] consent block message failed:', err)
    try {
      await engineSendText({ accountId, userId, conversationId, contactId, text: body, aiGenerated: false })
    } catch (textErr) {
      console.error('[ai auto-reply] consent block fallback failed:', textErr)
    }
  }
}

/**
 * Decline gate — run by the webhook BEFORE flows / AI / automations.
 *
 * Returns true when the inbound was swallowed: the contact declined
 * and has not accepted since, so nothing answers them but the "you
 * have to agree" message. Consent taps are always passed through so
 * an Accept unblocks them in the same turn.
 *
 * Silence is never blocked here — silence was already recorded as
 * acceptance when the consent message went out.
 */
export async function enforceConsentGate(args: {
  db: ReturnType<typeof supabaseAdmin>
  accountId: string
  conversationId: string
  contactId: string
  userId: string
  interactiveReplyId?: string | null
}): Promise<boolean> {
  const { db, accountId, conversationId, contactId, userId, interactiveReplyId } = args

  const { data: contact } = await db
    .from('contacts')
    .select('consent_tos_version, consent_tos_declined_at')
    .eq('account_id', accountId)
    .eq('id', contactId)
    .maybeSingle()
  if (!contact?.consent_tos_declined_at) return false
  if (contact.consent_tos_version) return false // accepted after declining
  if (interactiveReplyId === 'consent_accept') return false
  if (interactiveReplyId === 'consent_decline') return false

  await sendBlockedMessage(db, accountId, conversationId, contactId, userId)
  return true
}

type CheckoutGate = 'ok' | 'consent' | 'profile'

/**
 * Gate for order/booking confirm buttons:
 *   1. Terms must be accepted — a sent-but-ignored ask already counts,
 *      so this only re-sends if consent was never asked at all
 *   2. Profile needs name + email (points at the public data page)
 * Returns 'ok' when the confirm may proceed.
 */
export async function ensureCheckoutReady(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
): Promise<CheckoutGate> {
  const { data: contact } = await db
    .from('contacts')
    .select('name, email, consent_tos_version')
    .eq('account_id', accountId)
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return 'ok'

  if (!contact.consent_tos_version) {
    await sendConsentMessage(db, accountId, conversationId, contactId, userId, { checkout: true })
    return 'consent'
  }

  if (!contact.name || !contact.email) {
    const ctx = await loadPublicContext(db, accountId)
    if (ctx) {
      const link = contactFormUrl(ctx.slug, contactId)
      try {
        await sendProfileLinkMessage(
          accountId,
          conversationId,
          contactId,
          userId,
          link,
          `Almost there — to confirm this I just need your name and email for the confirmation. Add them here in one step (then tap Confirm again): ${link} — your details stay with ${ctx.slug} and you can delete them anytime from that page.`,
        )
        await db
          .from('contacts')
          .update({ last_profile_nudge_at: new Date().toISOString() })
          .eq('account_id', accountId)
          .eq('id', contactId)
      } catch (err) {
        console.error('[ai auto-reply] checkout profile ask failed:', err)
      }
      return 'profile'
    }
  }

  return 'ok'
}

/**
 * Post-reply hook: offer Terms/Privacy consent once per contact,
 * AFTER the main AI reply. Never re-asks — once sent, silence has
 * already been recorded as acceptance (sendConsentMessage), and a
 * decline blocks the conversation instead of being asked about.
 */
async function maybeRequestConsent(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
): Promise<boolean> {
  const { data: contact } = await db
    .from('contacts')
    .select('consent_tos_version, consent_asked_at')
    .eq('account_id', accountId)
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return false
  if (contact.consent_tos_version || contact.consent_asked_at) return false

  return sendConsentMessage(db, accountId, conversationId, contactId, userId)
}

/** Post-reply hook: rate-limited (7 days) profile-completion nudge. */
async function maybeNudgeProfile(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  consentSentThisTurn: boolean,
): Promise<void> {
  // Don't stack two extra messages in one turn — consent wins.
  if (consentSentThisTurn) return

  const { data: contact } = await db
    .from('contacts')
    .select('name, email, last_profile_nudge_at')
    .eq('account_id', accountId)
    .eq('id', contactId)
    .maybeSingle()
  if (!contact) return
  if (contact.name && contact.email) return

  if (contact.last_profile_nudge_at) {
    const last = Date.parse(contact.last_profile_nudge_at)
    if (Number.isFinite(last) && Date.now() - last < PROFILE_NUDGE_INTERVAL_MS) return
  }

  const ctx = await loadPublicContext(db, accountId)
  if (!ctx) return
  const link = contactFormUrl(ctx.slug, contactId)

  try {
    await sendProfileLinkMessage(
      accountId,
      conversationId,
      contactId,
      userId,
      link,
      `One quick thing — if you'd like order confirmations by email, save your name and email here (you can edit or delete them anytime): ${link}`,
    )
    await db
      .from('contacts')
      .update({ last_profile_nudge_at: new Date().toISOString() })
      .eq('account_id', accountId)
      .eq('id', contactId)
  } catch (err) {
    console.error('[ai auto-reply] profile nudge failed:', err)
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
      const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, configOwnerUserId)
      if (gate !== 'ok') return
      // ── CREATE REAL ORDER ──────────────────────────────────
      // Get the offering for the order
      const offeringId = pending.offering_id
      const offeringName = pending.offering_name || 'Delivery Service'

      // Generate order number via RPC
      const { data: orderNumResult, error: orderNumErr } = await db.rpc('next_order_number', {
        p_account_id: accountId,
      })
      const orderNumber = orderNumResult || `ORD-${Date.now()}`
      if (orderNumErr) {
        console.error('[order button] failed to generate order number:', orderNumErr)
      }

      // Create the order
      const { data: order, error: orderErr } = await db
        .from('orders')
        .insert({
          account_id: accountId,
          order_number: orderNumber,
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
          // Look up profile ID for the rider (assigned_team_member_id references profiles.id, not auth.users.id)
          const { data: riderProfile } = await db
            .from('profiles')
            .select('id')
            .eq('user_id', best.user_id)
            .maybeSingle()

          const profileId = riderProfile?.id || best.user_id

          await db
            .from('orders')
            .update({ assigned_team_member_id: profileId, assigned_role: best.role })
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
      const paymentMsg = await buildPaymentMessage(
        db, accountId, pending.currency || 'KES', order.total || 0, order.order_number,
      )

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

// ============================================================
// Food Order Button Handler (Restaurant)
// ============================================================

async function handleFoodOrderButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: { action: string; orderId: string },
): Promise<void> {
  const { action: btnAction, orderId: pendingId } = action

  const { data: pending } = await db
    .from('pending_food_orders')
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
      text: 'This food order preview has expired or was already processed. Please send your order again.',
      aiGenerated: true,
    })
    return
  }

  switch (btnAction) {
    case 'confirm': {
      const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, configOwnerUserId)
      if (gate !== 'ok') return
      // Generate order number
      const { data: orderNum } = await db.rpc('next_order_number', { p_account_id: accountId })
      if (!orderNum) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to process your order. Please try again.',
          aiGenerated: true,
        })
        return
      }

      // Create real order — reprice from the catalogue before writing totals.
      // The pending row is left untouched; only the real order is repriced.
      const items = await resolveCataloguePrices(
        db,
        accountId,
        (pending.items as Array<{
          name: string
          quantity?: number
          unit_price?: number
          product_id?: string | null
          special_instructions?: string | null
        }>) || [],
        ['menu_item', 'product'],
      )
      const subtotal = items.reduce((sum, i) => sum + (i.quantity || 1) * (i.unit_price || 0), 0)
      const { data: order, error: orderError } = await db
        .from('orders')
        .insert({
          account_id: accountId,
          order_number: orderNum,
          contact_id: contactId,
          status: 'confirmed',
          currency: pending.currency || 'KES',
          subtotal,
          tax_amount: 0,
          discount_amount: 0,
          total: subtotal,
          notes: pending.notes || null,
          metadata: {
            items: items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              special_instructions: i.special_instructions,
            })),
            order_type: pending.order_type,
            table_number: pending.table_number,
            room_number: pending.room_number,
            customer_name: pending.customer_name,
            customer_phone: pending.customer_phone,
          },
        })
        .select()
        .single()

      if (orderError || !order) {
        console.error('[handleFoodOrderButton] create order error:', orderError)
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

      // Insert order items
      if (items.length > 0) {
        const orderItems = items.map((i) => ({
          order_id: order.id,
          offering_id: i.product_id || null,
          name: i.name,
          quantity: i.quantity || 1,
          unit_price: i.unit_price || 0,
          total_price: (i.quantity || 1) * (i.unit_price || 0),
        }))
        await db.from('order_items').insert(orderItems)
      }

      // Send confirmation message
      const itemList = items.map((i) => `• ${i.quantity || 1}x ${i.name}`).join('\n')
      const typeLabel = pending.order_type === 'dine_in' ? `Dine-in (Table ${pending.table_number || '?'})`
        : pending.order_type === 'room_service' ? `Room Service (Room ${pending.room_number || '?'})`
        : 'Takeaway'

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text:
          `✅ *Order Confirmed!*\n\n` +
          `*Order #:* ${order.order_number}\n` +
          `*Type:* ${typeLabel}\n` +
          `*Items:*\n${itemList}\n\n` +
          `*Total:* KES ${subtotal}\n\n` +
          `Your order is being prepared. We'll notify you when it's ready!`,
        aiGenerated: true,
      })

      // ── PAYMENT DETAILS ────────────────────────────────────
      const paymentMsg = await buildPaymentMessage(
        db, accountId, pending.currency || 'KES', subtotal, order.order_number,
      )
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: paymentMsg,
        aiGenerated: true,
      })

      // Delete pending record
      await db.from('pending_food_orders').delete().eq('id', pendingId)
      break
    }

    case 'edit': {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'What would you like to change about your order? You can modify items, quantities, or add special instructions.',
        aiGenerated: true,
      })
      // Store editing state in conversation metadata
      await db
        .from('conversations')
        .update({ metadata: { ...((await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()).data?.metadata || {}), editing_pending_food_order_id: pendingId } })
        .eq('id', conversationId)
      break
    }

    case 'cancel': {
      await db.from('pending_food_orders').delete().eq('id', pendingId)
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'Your food order has been cancelled. Let me know if you\'d like to place a new order!',
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

// ============================================================
// Reservation Button Handler (Restaurant)
// ============================================================

async function handleReservationButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: { action: string; reservationId: string },
): Promise<void> {
  const { action: btnAction, reservationId: pendingId } = action

  const { data: pending } = await db
    .from('pending_reservations')
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
      text: 'This reservation preview has expired or was already processed. Please send your reservation request again.',
      aiGenerated: true,
    })
    return
  }

  switch (btnAction) {
    case 'confirm': {
      const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, configOwnerUserId)
      if (gate !== 'ok') return
      // Generate booking number
      const { data: bookingNum } = await db.rpc('next_booking_number', { p_account_id: accountId })
      const bookingNumber = bookingNum || `RES-${Date.now()}`

      // Create real reservation (using bookings table with type='reservation')
      const { data: reservation, error: resError } = await db
        .from('bookings')
        .insert({
          account_id: accountId,
          booking_number: bookingNumber,
          contact_id: contactId,
          status: 'confirmed',
          start_date: `${pending.reservation_date}T${pending.reservation_time}`,
          end_date: `${pending.reservation_date}T${pending.reservation_time}`, // Will be updated with duration
          guests: pending.party_size,
          currency: 'KES',
          total: 0,
          notes: pending.special_requests || null,
          metadata: {
            type: 'reservation',
            guest_name: pending.guest_name,
            guest_phone: pending.guest_phone,
            party_size: pending.party_size,
            reservation_date: pending.reservation_date,
            reservation_time: pending.reservation_time,
            duration_minutes: pending.duration_minutes,
          },
        })
        .select()
        .single()

      if (resError || !reservation) {
        console.error('[handleReservationButton] create error:', resError)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to create your reservation. Please try again.',
          aiGenerated: true,
        })
        return
      }

      // Format date nicely
      const dateObj = new Date(`${pending.reservation_date}T${pending.reservation_time}`)
      const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
      const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text:
          `✅ *Reservation Confirmed!*\n\n` +
          `*Reservation #:* ${bookingNumber}\n` +
          `*Name:* ${pending.guest_name}\n` +
          `*Guests:* ${pending.party_size}\n` +
          `*Date:* ${formattedDate}\n` +
          `*Time:* ${formattedTime}\n\n` +
          `We look forward to seeing you!`,
        aiGenerated: true,
      })

      await db.from('pending_reservations').delete().eq('id', pendingId)
      break
    }

    case 'edit': {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'What would you like to change about your reservation? You can modify the date, time, party size, or special requests.',
        aiGenerated: true,
      })
      await db
        .from('conversations')
        .update({ metadata: { ...((await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()).data?.metadata || {}), editing_pending_reservation_id: pendingId } })
        .eq('id', conversationId)
      break
    }

    case 'cancel': {
      await db.from('pending_reservations').delete().eq('id', pendingId)
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'Your reservation has been cancelled. Let me know if you\'d like to make a new reservation!',
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

// ============================================================
// Booking Button Handler (Hotel)
// ============================================================

async function handleBookingButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: { action: string; bookingId: string },
): Promise<void> {
  const { action: btnAction, bookingId: pendingId } = action

  const { data: pending } = await db
    .from('pending_bookings')
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
      text: 'This booking preview has expired or was already processed. Please send your booking request again.',
      aiGenerated: true,
    })
    return
  }

  switch (btnAction) {
    case 'confirm': {
      const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, configOwnerUserId)
      if (gate !== 'ok') return
      // Generate booking number
      const { data: bookingNum } = await db.rpc('next_booking_number', { p_account_id: accountId })
      const bookingNumber = bookingNum || `BK-${Date.now()}`

      // Create real booking
      const { data: booking, error: bookError } = await db
        .from('bookings')
        .insert({
          account_id: accountId,
          booking_number: bookingNumber,
          contact_id: contactId,
          offering_id: pending.offering_id,
          status: 'confirmed',
          start_date: pending.check_in_date,
          end_date: pending.check_out_date,
          guests: pending.guests,
          currency: pending.currency || 'KES',
          total: pending.total_price || 0,
          notes: pending.special_requests || null,
          metadata: {
            type: 'room_booking',
            guest_name: pending.guest_name,
            guest_phone: pending.guest_phone,
            room_name: pending.offering_name,
            price_per_night: pending.price_per_night,
            nights: pending.nights,
          },
        })
        .select()
        .single()

      if (bookError || !booking) {
        console.error('[handleBookingButton] create error:', bookError)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to create your booking. Please try again.',
          aiGenerated: true,
        })
        return
      }

      // Format dates
      const checkInObj = new Date(pending.check_in_date)
      const checkOutObj = new Date(pending.check_out_date)
      const formattedCheckIn = checkInObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      const formattedCheckOut = checkOutObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text:
          `✅ *Booking Confirmed!*\n\n` +
          `*Booking #:* ${bookingNumber}\n` +
          `*Room:* ${pending.offering_name}\n` +
          `*Guest:* ${pending.guest_name}\n` +
          `*Check-in:* ${formattedCheckIn}\n` +
          `*Check-out:* ${formattedCheckOut}\n` +
          `*Nights:* ${pending.nights}\n` +
          `*Guests:* ${pending.guests}\n\n` +
          `*Total:* KES ${pending.total_price}\n\n` +
          `We look forward to welcoming you!`,
        aiGenerated: true,
      })

      // ── PAYMENT DETAILS ────────────────────────────────────
      const paymentMsg = await buildPaymentMessage(
        db, accountId, pending.currency || 'KES', pending.total_price || 0, bookingNumber,
      )
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: paymentMsg,
        aiGenerated: true,
      })

      await db.from('pending_bookings').delete().eq('id', pendingId)
      break
    }

    case 'edit': {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'What would you like to change about your booking? You can modify the dates, room type, or special requests.',
        aiGenerated: true,
      })
      await db
        .from('conversations')
        .update({ metadata: { ...((await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()).data?.metadata || {}), editing_pending_booking_id: pendingId } })
        .eq('id', conversationId)
      break
    }

    case 'cancel': {
      await db.from('pending_bookings').delete().eq('id', pendingId)
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'Your booking has been cancelled. Let me know if you\'d like to make a new booking!',
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

// ============================================================
// Direct Pagination Handlers (no AI — like logistics confirm)
// ============================================================

async function handleMenuMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  // Fetch search params from conversation metadata
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const searchParams = (conv?.metadata as Record<string, unknown>)?.menu_search_params as Record<string, unknown> | undefined

  const result = await searchMenuItems(db, accountId, {
    query: searchParams?.query as string | undefined,
    category: searchParams?.category as string | undefined,
    dietary: searchParams?.dietary as string | undefined,
    offset,
  })

  if (result.items.length === 0) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'No more menu items to show.',
      aiGenerated: true,
    })
    return
  }

  // Format items list
  const lines = result.items.map((item, i) =>
    `${offset + i + 1}. *${item.name}* — ${item.currency} ${item.price}\n   ${item.description || ''}`,
  ).join('\n\n')

  const header = `📋 *Menu (continued)*\n\n`
  const footer = result.has_more ? '\n\nType *more* or tap the button to see more.' : '\n\nThat\'s all we have! 🍽️'

  if (result.buttons && result.buttons.length > 0) {
    await engineSendInteractiveButtons({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      bodyText: header + lines + footer,
      buttons: result.buttons.map((b) => ({ id: b.id, title: b.title })),
    })
  } else {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: header + lines + footer,
      aiGenerated: true,
    })
  }
}

async function handleRoomMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  // Fetch search params from conversation metadata
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const searchParams = (conv?.metadata as Record<string, unknown>)?.room_search_params as Record<string, unknown> | undefined

  const result = await searchRooms(db, accountId, {
    check_in: searchParams?.check_in as string | undefined,
    check_out: searchParams?.check_out as string | undefined,
    guests: searchParams?.guests as number | undefined,
    query: searchParams?.query as string | undefined,
    min_price: searchParams?.min_price as number | undefined,
    max_price: searchParams?.max_price as number | undefined,
    offset,
  })

  if (result.rooms.length === 0) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'No more rooms to show.',
      aiGenerated: true,
    })
    return
  }

  // Format rooms list
  const lines = result.rooms.map((room, i) =>
    `${offset + i + 1}. *${room.name}* — ${room.currency} ${room.price_per_night}/night\n` +
    `   👥 Up to ${room.max_guests} guests | 🛏️ ${room.bed_type || 'Standard'}\n` +
    `   ${room.amenities.length > 0 ? '✨ ' + room.amenities.slice(0, 3).join(', ') : ''}`,
  ).join('\n\n')

  const header = result.search_dates
    ? `🏨 *Available Rooms* (${result.search_dates.check_in} to ${result.search_dates.check_out})\n\n`
    : `🏨 *Rooms (continued)*\n\n`
  const footer = result.has_more ? '\n\nType *more* or tap the button to see more.' : '\n\nThat\'s all we have available!'

  if (result.buttons && result.buttons.length > 0) {
    await engineSendInteractiveButtons({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      bodyText: header + lines + footer,
      buttons: result.buttons.map((b) => ({ id: b.id, title: b.title })),
    })
  } else {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: header + lines + footer,
      aiGenerated: true,
    })
  }
}

// ============================================================
// Product Order Handler (retailer/wholesaler — no AI)
// ============================================================

async function handleProductOrderButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: { action: string; orderId: string },
): Promise<void> {
  const { action: btnAction, orderId: pendingId } = action

  const { data: pending } = await db
    .from('pending_product_orders')
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
      text: 'This order preview has expired or was already processed. Please send your order again.',
      aiGenerated: true,
    })
    return
  }

  switch (btnAction) {
    case 'confirm': {
      const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, configOwnerUserId)
      if (gate !== 'ok') return
      // Generate order number
      const { data: orderNum } = await db.rpc('next_order_number', { p_account_id: accountId })
      if (!orderNum) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to process your order. Please try again.',
          aiGenerated: true,
        })
        return
      }

      // Create real order — reprice from the catalogue before writing totals
      const items = await resolveCataloguePrices(
        db,
        accountId,
        (pending.items as Array<{ name: string; quantity?: number; unit_price?: number; product_id?: string | null }>) || [],
      )
      const subtotal = items.reduce((sum, i) => sum + (i.quantity || 1) * (i.unit_price || 0), 0)
      const { data: order, error: orderError } = await db
        .from('orders')
        .insert({
          account_id: accountId,
          order_number: orderNum,
          contact_id: contactId,
          status: 'confirmed',
          currency: pending.currency || 'KES',
          subtotal,
          tax_amount: 0,
          discount_amount: 0,
          total: subtotal,
          notes: pending.notes || null,
          metadata: {
            type: 'product_order',
            items: items.map((i: any) => ({
              name: i.name,
              quantity: i.quantity,
              unit_price: i.unit_price,
              product_id: i.product_id || null,
            })),
            order_type: pending.order_type,
            delivery_address: pending.delivery_address,
            customer_name: pending.customer_name,
            customer_phone: pending.customer_phone,
          },
        })
        .select()
        .single()

      if (orderError || !order) {
        console.error('[handleProductOrderButton] create order error:', orderError)
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

      // Insert order items
      if (items.length > 0) {
        const orderItems = items.map((i: any) => ({
          order_id: order.id,
          offering_id: i.product_id || null,
          name: i.name,
          quantity: i.quantity || 1,
          unit_price: i.unit_price || 0,
          total_price: (i.quantity || 1) * (i.unit_price || 0),
        }))
        await db.from('order_items').insert(orderItems)
      }

      // Send confirmation message
      const itemList = items.map((i: any) => `• ${i.quantity || 1}× ${i.name}`).join('\n')
      const typeLabel = pending.order_type === 'wholesale' ? 'Wholesale Order'
        : pending.order_type === 'pickup' ? 'Pickup'
        : 'Delivery'

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text:
          `✅ *Order Confirmed!*\n\n` +
          `*Order #:* ${order.order_number}\n` +
          `*Type:* ${typeLabel}\n` +
          `*Items:*\n${itemList}\n\n` +
          `*Total:* KES ${subtotal}` +
          (pending.delivery_address ? `\n*Delivery Address:* ${pending.delivery_address}` : '') +
          `\n\nYour order has been placed. We'll notify you when it's on the way!`,
        aiGenerated: true,
      })

      // ── PAYMENT DETAILS ────────────────────────────────────
      const paymentMsg = await buildPaymentMessage(
        db, accountId, pending.currency || 'KES', subtotal, order.order_number,
      )
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: paymentMsg,
        aiGenerated: true,
      })

      // Delete pending record
      await db.from('pending_product_orders').delete().eq('id', pendingId)
      break
    }

    case 'edit': {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'What would you like to change?\n\n• Products\n• Quantities\n• Delivery address\n• Order type (delivery/pickup/wholesale)',
        aiGenerated: true,
      })
      await db
        .from('conversations')
        .update({ metadata: { ...((await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()).data?.metadata || {}), editing_pending_product_order_id: pendingId } })
        .eq('id', conversationId)
      break
    }

    case 'cancel': {
      await db.from('pending_product_orders').delete().eq('id', pendingId)
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'Your order has been cancelled. Let me know if you\'d like to browse products again!',
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

// ============================================================
// Direct Pagination Handler — Products (no AI)
// ============================================================

async function handleProductMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const searchParams = (conv?.metadata as Record<string, unknown>)?.product_search_params as Record<string, unknown> | undefined

  const result = await searchProducts(db, accountId, {
    query: searchParams?.query as string | undefined,
    category: searchParams?.category as string | undefined,
    min_price: searchParams?.min_price as number | undefined,
    max_price: searchParams?.max_price as number | undefined,
    offset,
  })

  if (result.items.length === 0) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'No more products to show.',
      aiGenerated: true,
    })
    return
  }

  const lines = result.items.map((item, i) =>
    `${offset + i + 1}. *${item.name}* — ${item.currency} ${item.price}\n   ${item.description || ''}`,
  ).join('\n\n')

  const header = `🛒 *Products (continued)*\n\n`
  const footer = result.has_more ? '\n\nType *more* or tap the button to see more.' : '\n\nThat\'s all we have!'

  if (result.buttons && result.buttons.length > 0) {
    await engineSendInteractiveButtons({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      bodyText: header + lines + footer,
      buttons: result.buttons.map((b) => ({ id: b.id, title: b.title })),
    })
  } else {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: header + lines + footer,
      aiGenerated: true,
    })
  }
}

// ============================================================
// Service More Handler (no AI — paginated service list)
// ============================================================

async function handleServiceMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  // Fetch search params from conversation metadata
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const searchParams = (conv?.metadata as Record<string, unknown>)?.service_search_params as Record<string, unknown> | undefined

  const result = await searchServices(db, accountId, {
    query: searchParams?.query as string | undefined,
    category: searchParams?.category as string | undefined,
    min_price: searchParams?.min_price as number | undefined,
    max_price: searchParams?.max_price as number | undefined,
    offset,
  })

  if (result.services.length === 0) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'No more services to show.',
      aiGenerated: true,
    })
    return
  }

  // Format services list
  let text = `More services (showing ${offset + 1}–${offset + result.services.length}):\n\n`
  for (const svc of result.services) {
    text += `• ${svc.name} — ${svc.currency} ${svc.price}\n`
    if (svc.description) text += `  ${svc.description}\n`
  }

  const buttons = result.buttons || []

  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText: text,
    buttons: buttons.map((b) => ({ id: b.id, title: b.title })),
  })
}

// ============================================================
// Property Inquiry Button Handler (no AI)
// ============================================================

async function handlePropertyInquiryButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: { action: string; inquiryId: string },
): Promise<void> {
  const { action: btnAction, inquiryId: pendingId } = action

  // Handle direct actions from property list (viewing/question/offer)
  if (btnAction === 'viewing' || btnAction === 'question' || btnAction === 'offer') {
    // The pending record already exists with the right inquiry_type
    // Clean up the other two pending records for this property
    const { data: pending } = await db
      .from('pending_property_inquiries')
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
        text: 'This inquiry has expired. Please tap the property again.',
        aiGenerated: true,
      })
      return
    }

    // Delete other pending records for same property + contact
    await db
      .from('pending_property_inquiries')
      .delete()
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .eq('offering_id', pending.offering_id)
      .neq('id', pendingId)

    if (btnAction === 'viewing') {
      // Slot list goes out directly — no AI round-trip; the tap books it.
      await sendPendingScheduleList(
        db, accountId, conversationId, contactId, configOwnerUserId,
        'property', pendingId, 0,
        `📅 *Schedule Viewing*\n*Property:* ${pending.offering_name}`,
      )
    } else if (btnAction === 'offer') {
      // Ask for offer amount
      await engineSendInteractiveButtons({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        bodyText:
          `💰 *Make an Offer*\n\n` +
          `*Property:* ${pending.offering_name}\n` +
          `*Listed at:* KES ${pending.budget}\n\n` +
          `Please reply with your offer amount (e.g. "4500000" or "4.5M").`,
        buttons: [
          { id: `property_inquiry_confirm_${pendingId}`, title: '✅ Confirm' },
          { id: `property_inquiry_edit_${pendingId}`, title: '✏️ Change Amount' },
          { id: `property_inquiry_cancel_${pendingId}`, title: '❌ Cancel' },
        ],
      })
    } else {
      // question — direct confirm
      const { data: bookingNum } = await db.rpc('next_booking_number', { p_account_id: accountId })
      const bookingNumber = bookingNum || `INQ-${Date.now()}`

      await db.from('bookings').insert({
        account_id: accountId,
        booking_number: bookingNumber,
        contact_id: contactId,
        offering_id: pending.offering_id,
        status: 'confirmed',
        currency: pending.currency || 'KES',
        total: 0,
        notes: pending.notes || null,
        metadata: {
          type: 'property_inquiry',
          inquiry_type: 'inquiry',
          property_name: pending.offering_name,
          customer_name: pending.customer_name,
          customer_phone: pending.customer_phone,
        },
      })

      await db.from('pending_property_inquiries').delete().eq('id', pendingId)

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text:
          `📋 *Inquiry Submitted*\n\n` +
          `*Property:* ${pending.offering_name}\n` +
          `*Reference:* ${bookingNumber}\n\n` +
          `Our team will get back to you shortly.`,
        aiGenerated: true,
      })
    }
    return
  }

  // Handle confirm/edit/cancel from preview
  const { data: pending } = await db
    .from('pending_property_inquiries')
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
      text: 'This inquiry has expired or was already processed. Please send your request again.',
      aiGenerated: true,
    })
    return
  }

  switch (btnAction) {
    case 'confirm': {
      const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, configOwnerUserId)
      if (gate !== 'ok') return
      const { data: bookingNum } = await db.rpc('next_booking_number', { p_account_id: accountId })
      const bookingNumber = bookingNum || `INQ-${Date.now()}`

      const { data: booking, error: bookError } = await db
        .from('bookings')
        .insert({
          account_id: accountId,
          booking_number: bookingNumber,
          contact_id: contactId,
          offering_id: pending.offering_id,
          status: 'confirmed',
          start_date: pending.preferred_date || null,
          guests: 1,
          currency: pending.currency || 'KES',
          total: pending.budget || 0,
          notes: pending.notes || null,
          metadata: {
            type: 'property_inquiry',
            inquiry_type: pending.inquiry_type,
            property_name: pending.offering_name,
            customer_name: pending.customer_name,
            customer_phone: pending.customer_phone,
            preferred_date: pending.preferred_date,
            preferred_time: pending.preferred_time,
            budget: pending.budget,
          },
        })
        .select()
        .single()

      if (bookError || !booking) {
        console.error('[handlePropertyInquiryButton] create error:', bookError)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to submit your inquiry. Please try again.',
          aiGenerated: true,
        })
        return
      }

      const typeLabel = pending.inquiry_type === 'viewing' ? '🏠 Viewing Request' :
        pending.inquiry_type === 'offer' ? '💰 Offer' : '📋 Property Inquiry'

      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text:
          `${typeLabel} Confirmed!\n\n` +
          `*Property:* ${pending.offering_name}\n` +
          `*Reference:* ${bookingNumber}\n` +
          (pending.preferred_date ? `*Date:* ${pending.preferred_date}` : '') +
          (pending.preferred_time ? ` at ${pending.preferred_time}` : '') +
          (pending.preferred_date ? '\n' : '') +
          (pending.budget && pending.inquiry_type === 'offer' ? `*Offer:* ${pending.currency || 'KES'} ${pending.budget}\n` : '') +
          `\nOur team will contact you shortly.`,
        aiGenerated: true,
      })

      await db.from('pending_property_inquiries').delete().eq('id', pendingId)
      break
    }
    case 'edit': {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'Please send your updated details. For example:\n' +
          '- "Saturday 3pm" (for viewing date)\n' +
          '- "5000000" (for offer amount)\n' +
          '- "I need wheelchair access" (for requirements)',
        aiGenerated: true,
      })
      break
    }
    case 'cancel': {
      await db.from('pending_property_inquiries').delete().eq('id', pendingId)
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'Inquiry cancelled. Feel free to ask about other properties.',
        aiGenerated: true,
      })
      break
    }
  }
}

// ============================================================
// Property More Handler (no AI — paginated property list)
// ============================================================

async function handlePropertyMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  // Fetch search params from conversation metadata
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const searchParams = (conv?.metadata as Record<string, unknown>)?.property_search_params as Record<string, unknown> | undefined

  const result = await searchProperties(db, accountId, {
    query: searchParams?.query as string | undefined,
    property_type: searchParams?.property_type as string | undefined,
    listing_type: searchParams?.listing_type as string | undefined,
    min_price: searchParams?.min_price as number | undefined,
    max_price: searchParams?.max_price as number | undefined,
    bedrooms: searchParams?.bedrooms as number | undefined,
    offset,
  })

  if (result.properties.length === 0) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'No more properties to show.',
      aiGenerated: true,
    })
    return
  }

  // Format properties list
  let text = `More properties (showing ${offset + 1}–${offset + result.properties.length}):\n\n`
  for (const prop of result.properties) {
    text += `• ${prop.name} — ${prop.currency} ${prop.price}\n`
    if (prop.bedrooms) text += `  ${prop.bedrooms} bed`
    if (prop.bathrooms) text += ` · ${prop.bathrooms} bath`
    if (prop.location) text += ` · ${prop.location}`
    text += '\n'
  }

  const buttons = result.buttons || []

  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText: text,
    buttons: buttons.map((b) => ({ id: b.id, title: b.title })),
  })
}

// ============================================================
// Shared: send an offering's primary photo (best effort)
// ============================================================

type OfferingMedia = { url: string; is_primary?: boolean; sort_order?: number }

async function sendPrimaryPhoto(
  params: {
    accountId: string
    userId: string
    conversationId: string
    contactId: string
  },
  media: unknown,
  logTag: string,
): Promise<void> {
  const list = (media as OfferingMedia[] | null) || []
  const url = list.find((m) => m.is_primary)?.url || list[0]?.url
  if (!url) return
  try {
    await engineSendMedia({ ...params, kind: 'image', link: url })
  } catch (imgErr) {
    console.error(`[${logTag}] failed to send item image:`, imgErr)
  }
}

// ============================================================
// Price Enquiry Handler (no AI — contact-for-price items)
// ============================================================

async function handlePriceEnquire(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: price_enquire_{uuid}
  const match = selectionId.match(/^price_enquire_(.+)$/)
  if (!match) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Invalid selection.', aiGenerated: true })
    return
  }

  const { data: offering } = await db
    .from('offerings')
    .select('name, media:offering_media(url, is_primary, sort_order)')
    .eq('id', match[1])
    .eq('account_id', accountId)
    .maybeSingle()

  const name = offering?.name || 'This item'
  await sendPrimaryPhoto(
    { accountId, userId: configOwnerUserId, conversationId, contactId },
    offering?.media,
    'handlePriceEnquire',
  )
  await engineSendText({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    text:
      `💰 *Price on request*\n\n` +
      `*${name}*\n\n` +
      `Reply with the quantity you need or any question and we'll get right back to you with pricing.`,
    aiGenerated: true,
  })
}

// ============================================================
// Generic Offering Detail Handler (no AI — non-domain types)
// ============================================================

async function handleOfferingListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: offering_select_{uuid}
  const match = selectionId.match(/^offering_select_(.+)$/)
  if (!match) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Invalid selection.', aiGenerated: true })
    return
  }

  const { data: offering } = await db
    .from('offerings')
    .select('name, type, price, currency, short_description, metadata, media:offering_media(url, is_primary, sort_order)')
    .eq('id', match[1])
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()

  if (!offering) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Sorry, that item is no longer available.', aiGenerated: true })
    return
  }

  await sendPrimaryPhoto(
    { accountId, userId: configOwnerUserId, conversationId, contactId },
    offering.media,
    'handleOfferingListSelect',
  )

  const priceLabel = offering.price !== null && offering.price !== undefined
    ? `${offering.currency || 'KES'} ${Math.round(offering.price).toLocaleString('en-US')}`
    : 'Price on request'

  const lines = [
    `*${offering.name}*`,
    offering.short_description || '',
    `💰 ${priceLabel}`,
  ].filter(Boolean).join('\n')

  await engineSendText({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    text: `${lines}\n\nWould you like to go ahead? Just reply and I'll take care of it.`,
    aiGenerated: true,
  })
}

// ============================================================
// Offering More Handler (no AI — paginated catalogue list)
// ============================================================

async function handleOfferingMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  const searchParams = (conv?.metadata as Record<string, unknown>)?.offering_search_params as Record<string, unknown> | undefined

  const handler = logisticsToolHandlers.search_offerings
  if (!handler) return

  // Reuse the tool handler so list rows/pagination stay consistent
  const result = (await handler(
    { query: searchParams?.query, type: searchParams?.type, offset },
    {
      db,
      accountId,
      conversationId,
      contactId,
      contactPhone: null,
      contactName: null,
      businessType: null,
      userId: configOwnerUserId,
    },
  )) as {
    list_section?: ListSection
    buttons?: Array<{ id: string; title: string }>
    offerings?: Array<{ name: string; price: number | null; currency: string | null }>
  }

  const section = clampListSection(result.list_section)
  const cta = section ? listCtaFor(section) : { buttonLabel: 'View Options', fallbackBody: 'Tap an option below:' }

  if (section) {
    try {
      await engineSendInteractiveList({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        bodyText: clampBody(`More results for "${searchParams?.query || 'your search'}":`),
        buttonLabel: cta.buttonLabel,
        sections: [section],
      })
      const buttons = (result.buttons as Array<{ id: string; title: string }> | undefined) || []
      if (buttons.length > 0) {
        await engineSendInteractiveButtons({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          bodyText: 'Need more options?',
          buttons,
        })
      }
      return
    } catch (listErr) {
      console.error('[handleOfferingMore] failed to send list:', listErr)
    }
  }

  const items = (result.offerings as Array<{ name: string; price: number | null; currency: string | null }> ) || []
  const lines = items.map((o, i) =>
    `${offset + i + 1}. *${o.name}* — ${o.price !== null && o.price !== undefined ? `${o.currency || 'KES'} ${Math.round(o.price).toLocaleString('en-US')}` : 'Price on request'}`,
  ).join('\n')
  await engineSendText({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    text: lines || 'No more results to show.',
    aiGenerated: true,
  })
}

// ============================================================
// Product List Selection Handler (no AI — like logistics confirm)
// ============================================================

async function handleProductListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: product_add_{uuid}_{price}
  const match = selectionId.match(/^product_add_(.+)_(\d+)$/)
  if (!match) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Invalid product selection.',
      aiGenerated: true,
    })
    return
  }

  const productId = match[1]
  const price = parseInt(match[2], 10)

  // Look up product name + primary image
  const { data: product } = await db
    .from('offerings')
    .select('name, media:offering_media(url, is_primary, sort_order)')
    .eq('id', productId)
    .eq('account_id', accountId)
    .maybeSingle()

  const productName = product?.name || 'Product'
  const media = (product?.media as Array<{ url: string; is_primary?: boolean; sort_order?: number }>) || []
  const productImage =
    media.find((m) => m.is_primary)?.url || media[0]?.url || null

  // Add to cart
  const cart = await addToCart(db, conversationId, {
    name: productName,
    quantity: 1,
    unit_price: price,
    product_id: productId,
  })

  // Share the product photo first, then cart buttons
  if (productImage) {
    try {
      await engineSendMedia({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        kind: 'image',
        link: productImage,
      })
    } catch (imgErr) {
      console.error('[product_add] failed to send product image:', imgErr)
    }
  }

  // Send cart summary with buttons
  const summary = formatCartSummary(cart)
  const buttons = getCartButtons(cart.length > 0)

  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText: `✅ Added *${productName}* to cart!\n\n${summary}\n\nTap *Checkout* to place order, or browse more products.`,
    buttons,
  })
}

// ============================================================
// Menu List Selection Handler (no AI — same pattern as product)
// ============================================================

async function handleMenuListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: menu_add_{uuid}_{price}
  const match = selectionId.match(/^menu_add_(.+)_(\d+)$/)
  if (!match) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Invalid menu item selection.',
      aiGenerated: true,
    })
    return
  }

  const itemId = match[1]
  const price = parseInt(match[2], 10)

  // Look up item name + primary image
  const { data: item } = await db
    .from('offerings')
    .select('name, media:offering_media(url, is_primary, sort_order)')
    .eq('id', itemId)
    .eq('account_id', accountId)
    .maybeSingle()

  const itemName = item?.name || 'Menu Item'
  await sendPrimaryPhoto(
    { accountId, userId: configOwnerUserId, conversationId, contactId },
    item?.media,
    'handleMenuListSelect',
  )

  // For menu items, we send a direct order confirmation (no cart for food — order is immediate)
  // Create pending food order with quantity 1
  const { data: pending, error: pendingErr } = await db
    .from('pending_food_orders')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      user_id: configOwnerUserId,
      items: [{ name: itemName, quantity: 1, unit_price: price }],
      item_count: 1,
      order_type: 'takeaway',
      notes: null,
      customer_name: null,
      customer_phone: null,
      price: price,
      currency: 'KES',
    })
    .select('id')
    .single()

  if (pendingErr || !pending) {
    console.error('[handleMenuListSelect] pending insert error:', pendingErr)
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Failed to create order. Please try again.',
      aiGenerated: true,
    })
    return
  }

  // Send preview with confirm/edit/cancel buttons
  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText:
      `🍽️ *Order Summary*\n\n` +
      `• 1× ${itemName} — KES ${price}\n\n` +
      `*Total:* KES ${price}\n\n` +
      `Type: Takeaway`,
    buttons: [
      { id: `food_order_confirm_${pending.id}`, title: '✅ Confirm' },
      { id: `food_order_edit_${pending.id}`, title: '✏️ Edit' },
      { id: `food_order_cancel_${pending.id}`, title: '❌ Cancel' },
    ],
  })
}

// ============================================================
// Room List Selection Handler (no AI)
// ============================================================

async function handleRoomListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: room_select_{uuid}_{price}
  const match = selectionId.match(/^room_select_(.+)_(\d+)$/)
  if (!match) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Invalid room selection.',
      aiGenerated: true,
    })
    return
  }

  const roomId = match[1]
  const pricePerNight = parseInt(match[2], 10)

  // Look up room details + primary image
  const { data: room } = await db
    .from('offerings')
    .select('name, metadata, media:offering_media(url, is_primary, sort_order)')
    .eq('id', roomId)
    .eq('account_id', accountId)
    .maybeSingle()

  const roomName = room?.name || 'Room'
  await sendPrimaryPhoto(
    { accountId, userId: configOwnerUserId, conversationId, contactId },
    room?.media,
    'handleRoomListSelect',
  )
  const meta = (room?.metadata || {}) as Record<string, unknown>
  const capacity = (meta.capacity || {}) as Record<string, unknown>
  const maxGuests = (capacity.max_guests as number) || 2

  // Create pending booking
  const { data: pending, error: pendingErr } = await db
    .from('pending_bookings')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      user_id: configOwnerUserId,
      offering_id: roomId,
      offering_name: roomName,
      check_in_date: null,
      check_out_date: null,
      guests: maxGuests,
      room_type: roomName,
      total_price: pricePerNight,
      currency: 'KES',
      notes: null,
      guest_name: null,
      guest_phone: null,
      special_requests: null,
    })
    .select('id')
    .single()

  if (pendingErr || !pending) {
    console.error('[handleRoomListSelect] pending insert error:', pendingErr)
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Failed to create booking. Please try again.',
      aiGenerated: true,
    })
    return
  }

  // Check-in day list goes out directly — no AI round-trip.
  await sendPendingScheduleList(
    db, accountId, conversationId, contactId, configOwnerUserId,
    'room', pending.id, 0,
    `🏨 *Book your stay*\n*Room:* ${roomName}\n*Guests:* ${maxGuests} · KES ${pricePerNight}/night — pick your check-in day:`,
  )
}

// ============================================================
// Service List Selection Handler (no AI)
// ============================================================

async function handleServiceListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: service_select_{uuid}_{price}
  const match = selectionId.match(/^service_select_(.+)_(\d+)$/)
  if (!match) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Invalid service selection.',
      aiGenerated: true,
    })
    return
  }

  const serviceId = match[1]
  const price = parseInt(match[2], 10)

  // Look up service name + primary image
  const { data: service } = await db
    .from('offerings')
    .select('name, metadata, media:offering_media(url, is_primary, sort_order)')
    .eq('id', serviceId)
    .eq('account_id', accountId)
    .maybeSingle()

  const serviceName = service?.name || 'Service'
  await sendPrimaryPhoto(
    { accountId, userId: configOwnerUserId, conversationId, contactId },
    service?.media,
    'handleServiceListSelect',
  )
  const meta = (service?.metadata || {}) as Record<string, unknown>
  const durationMinutes = (meta.duration_minutes as number) || 60

  // Create pending service booking
  const { data: pending, error: pendingErr } = await db
    .from('pending_service_bookings')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      user_id: configOwnerUserId,
      offering_id: serviceId,
      offering_name: serviceName,
      total_price: price,
      currency: 'KES',
      duration_minutes: durationMinutes,
    })
    .select('id')
    .single()

  if (pendingErr || !pending) {
    console.error('[handleServiceListSelect] pending insert error:', pendingErr)
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Failed to create booking. Please try again.',
      aiGenerated: true,
    })
    return
  }

  // Slot list goes out directly — no AI round-trip; the tap books it.
  await sendPendingScheduleList(
    db, accountId, conversationId, contactId, configOwnerUserId,
    'service', pending.id, 0,
    `📋 *Book your service*\n*Service:* ${serviceName}\n*Duration:* ${durationMinutes} min · KES ${price} — pick a day:`,
  )
}

// ============================================================
// Property List Selection Handler (no AI)
// ============================================================

async function handlePropertyListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  // Parse: property_select_{uuid}_{price}
  const match = selectionId.match(/^property_select_(.+)_(\d+)$/)
  if (!match) {
    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text: 'Invalid property selection.',
      aiGenerated: true,
    })
    return
  }

  const propertyId = match[1]
  const price = parseInt(match[2], 10)

  // Look up property details + primary image
  const { data: property } = await db
    .from('offerings')
    .select('name, metadata, media:offering_media(url, is_primary, sort_order)')
    .eq('id', propertyId)
    .eq('account_id', accountId)
    .maybeSingle()

  const propertyName = property?.name || 'Property'
  await sendPrimaryPhoto(
    { accountId, userId: configOwnerUserId, conversationId, contactId },
    property?.media,
    'handlePropertyListSelect',
  )
  const meta = (property?.metadata || {}) as Record<string, unknown>
  const listingType = (meta.listing_type as string) || 'sale'
  const bedrooms = meta.bedrooms || null
  const bathrooms = meta.bathrooms || null
  const location = (meta.location as Record<string, unknown>) || {}
  const area = location.area || location.address || ''

  // Create 3 pending records — one per action type
  // The customer taps one button, the others are cleaned up

  // 1. Viewing request
  const { data: viewingPending } = await db
    .from('pending_property_inquiries')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      user_id: configOwnerUserId,
      offering_id: propertyId,
      offering_name: propertyName,
      inquiry_type: 'viewing',
      budget: price,
      currency: 'KES',
    })
    .select('id')
    .single()

  // 2. General inquiry
  const { data: inquiryPending } = await db
    .from('pending_property_inquiries')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      user_id: configOwnerUserId,
      offering_id: propertyId,
      offering_name: propertyName,
      inquiry_type: 'inquiry',
      budget: price,
      currency: 'KES',
    })
    .select('id')
    .single()

  // 3. Offer
  const { data: offerPending } = await db
    .from('pending_property_inquiries')
    .insert({
      account_id: accountId,
      contact_id: contactId,
      conversation_id: conversationId,
      user_id: configOwnerUserId,
      offering_id: propertyId,
      offering_name: propertyName,
      inquiry_type: 'offer',
      budget: price,
      currency: 'KES',
    })
    .select('id')
    .single()

  const bodyText =
    `🏠 *${propertyName}*\n` +
    (area ? `📍 ${area}\n` : '') +
    (bedrooms ? `🛏️ ${bedrooms} bed` : '') +
    (bathrooms ? ` · 🚿 ${bathrooms} bath` : '') +
    (bedrooms || bathrooms ? '\n' : '') +
    `💰 ${price > 0 ? `KES ${price.toLocaleString('en-US')}` : 'Price on request'} (${listingType})\n\n` +
    `What would you like to do?`

  // Show 3 action buttons — each routes to a different pending record
  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText,
    buttons: [
      { id: `property_inquiry_viewing_${viewingPending?.id || 'x'}`, title: '📅 Schedule Viewing' },
      { id: `property_inquiry_question_${inquiryPending?.id || 'x'}`, title: '❓ Ask Question' },
      { id: `property_inquiry_offer_${offerPending?.id || 'x'}`, title: '💰 Make Offer' },
    ],
  })
}

// ============================================================
// Property Inquiry Button Handler (no AI)
// ============================================================
// NGO Program List Selection Handler (no AI)
// ============================================================

async function handleNgoProgramListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  const match = selectionId.match(/^ngo_program_select_(.+)$/)
  if (!match) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Invalid selection.', aiGenerated: true })
    return
  }

  const programId = match[1]
  const { data: program } = await db.from('ngo_programs').select('id, name, description, short_description, category').eq('id', programId).eq('account_id', accountId).eq('status', 'active').maybeSingle()

  if (!program) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Program not found.', aiGenerated: true })
    return
  }

  await engineSendInteractiveButtons({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    bodyText: `📋 *${program.name}*\n\n${program.short_description || program.description || ''}\n\nWould you like to apply?`,
    buttons: [
      { id: `ngo_apply_${programId}`, title: '✅ Apply Now' },
      { id: `ngo_info_${programId}`, title: 'ℹ️ More Info' },
      { id: `ngo_back_${programId}`, title: '🔙 Back' },
    ],
  })
}

// ============================================================
// NGO Course List Selection Handler (no AI)
// ============================================================

async function handleNgoCourseListSelect(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  selectionId: string,
): Promise<void> {
  const match = selectionId.match(/^ngo_course_select_(.+)$/)
  if (!match) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Invalid selection.', aiGenerated: true })
    return
  }

  const courseId = match[1]
  const { data: course } = await db.from('training_courses').select('id, name, description, short_description, category, duration_weeks').eq('id', courseId).eq('account_id', accountId).eq('is_active', true).maybeSingle()

  if (!course) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Course not found.', aiGenerated: true })
    return
  }

  await engineSendInteractiveButtons({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    bodyText: `🎓 *${course.name}*\n\n${course.short_description || course.description || ''}\n\n⏱️ Duration: ${course.duration_weeks} weeks\n📂 Category: ${course.category || 'general'}`,
    buttons: [
      { id: `ngo_enroll_${courseId}`, title: '📝 Enroll Now' },
      { id: `ngo_course_info_${courseId}`, title: 'ℹ️ More Info' },
      { id: `ngo_course_back_${courseId}`, title: '🔙 Back' },
    ],
  })
}

// ============================================================
// NGO Program More Handler (no AI — paginated)
// ============================================================

async function handleNgoProgramMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  const { data: conv } = await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()
  const searchParams = (conv?.metadata as Record<string, unknown>)?.ngo_program_search_params as Record<string, unknown> | undefined

  const result = await searchPrograms(db, accountId, {
    query: searchParams?.query as string | undefined,
    category: searchParams?.category as string | undefined,
    offset,
  })

  if (result.programs.length === 0) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'No more programs to show.', aiGenerated: true })
    return
  }

  let text = `More programs (showing ${offset + 1}–${offset + result.programs.length}):\n\n`
  for (const p of result.programs) {
    text += `• ${p.name}\n`
    if (p.short_description) text += `  ${p.short_description}\n`
  }

  const buttons = result.buttons || []
  await engineSendInteractiveButtons({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    bodyText: text,
    buttons: buttons.map((b) => ({ id: b.id, title: b.title })),
  })
}

// ============================================================
// NGO Course More Handler (no AI — paginated)
// ============================================================

async function handleNgoCourseMore(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  offset: number,
): Promise<void> {
  const { data: conv } = await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()
  const searchParams = (conv?.metadata as Record<string, unknown>)?.ngo_course_search_params as Record<string, unknown> | undefined

  const result = await searchCourses(db, accountId, {
    query: searchParams?.query as string | undefined,
    category: searchParams?.category as string | undefined,
    offset,
  })

  if (result.courses.length === 0) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'No more courses to show.', aiGenerated: true })
    return
  }

  let text = `More courses (showing ${offset + 1}–${offset + result.courses.length}):\n\n`
  for (const c of result.courses) {
    text += `• ${c.name} — ${c.duration_weeks} weeks\n`
  }

  const buttons = result.buttons || []
  await engineSendInteractiveButtons({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    bodyText: text,
    buttons: buttons.map((b) => ({ id: b.id, title: b.title })),
  })
}

// ============================================================
// NGO apply / enroll / info / back taps (no AI)
// ============================================================

async function rememberNgoTapContext(
  db: ReturnType<typeof supabaseAdmin>,
  conversationId: string,
  patch: Record<string, string>,
): Promise<void> {
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()
  await db
    .from('conversations')
    .update({ metadata: { ...((conv?.metadata as Record<string, unknown>) || {}), ...patch } })
    .eq('id', conversationId)
}

async function handleNgoApplyTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  programId: string,
): Promise<void> {
  const { data: program } = await db
    .from('ngo_programs')
    .select('id, name')
    .eq('id', programId)
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()

  if (!program) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'That program is no longer available.', aiGenerated: true })
    return
  }

  // Remember the tap so apply_to_program can resolve the program without an id
  await rememberNgoTapContext(db, conversationId, {
    pending_ngo_program_id: program.id,
    pending_ngo_program_name: program.name,
  })

  await engineSendText({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    text: `Great! To apply for *${program.name}*, what's your full name?`,
    aiGenerated: true,
  })
}

async function handleNgoInfoTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  programId: string,
): Promise<void> {
  const { data: program } = await db
    .from('ngo_programs')
    .select('id, name, description, short_description, category, status, current_enrollments, max_enrollments')
    .eq('id', programId)
    .eq('account_id', accountId)
    .eq('status', 'active')
    .maybeSingle()

  if (!program) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'That program is no longer available.', aiGenerated: true })
    return
  }

  // Remember the program so a follow-up "apply" works without a tap
  await rememberNgoTapContext(db, conversationId, {
    pending_ngo_program_id: program.id,
    pending_ngo_program_name: program.name,
  })

  const spots = program.max_enrollments
    ? `*Spots:* ${program.current_enrollments}/${program.max_enrollments} taken`
    : `*Enrolled so far:* ${program.current_enrollments}`
  await engineSendText({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    text:
      `📋 *${program.name}*\n\n` +
      `${program.description || program.short_description || 'No description available.'}\n\n` +
      (program.category ? `*Category:* ${program.category}\n` : '') +
      `${spots}\n\n` +
      `Reply *apply* to apply for this program, or tap Apply Now.`,
    aiGenerated: true,
  })
}

async function handleNgoCourseInfoTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  courseId: string,
): Promise<void> {
  const { data: course } = await db
    .from('training_courses')
    .select('id, name, description, short_description, category, duration_weeks')
    .eq('id', courseId)
    .eq('account_id', accountId)
    .eq('is_active', true)
    .maybeSingle()

  if (!course) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'That course is no longer available.', aiGenerated: true })
    return
  }

  await rememberNgoTapContext(db, conversationId, {
    pending_ngo_course_id: course.id,
    pending_ngo_course_name: course.name,
  })

  await engineSendText({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    text:
      `🎓 *${course.name}*\n\n` +
      `${course.description || course.short_description || 'No description available.'}\n\n` +
      `⏱️ Duration: ${course.duration_weeks} weeks\n` +
      (course.category ? `📂 Category: ${course.category}\n` : '') +
      `\nTap Enroll Now to join, or reply *enroll*.`,
    aiGenerated: true,
  })
}

async function handleNgoBackTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  kind: 'program' | 'course',
): Promise<void> {
  const metaKey = kind === 'program' ? 'ngo_program_search_params' : 'ngo_course_search_params'
  const { data: conv } = await db.from('conversations').select('metadata').eq('id', conversationId).maybeSingle()
  const searchParams = ((conv?.metadata as Record<string, unknown>)?.[metaKey] as Record<string, unknown>) || undefined

  if (kind === 'program') {
    const result = await searchPrograms(db, accountId, {
      query: searchParams?.query as string | undefined,
      category: searchParams?.category as string | undefined,
      offset: 0,
    })
    if (result.programs.length === 0) {
      await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'No programs to show right now.', aiGenerated: true })
      return
    }
    const section = clampListSection(result.list_section)
    if (!section) {
      await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Here are our programs — ask me about any of them!', aiGenerated: true })
      return
    }
    const cta = listCtaFor(section)
    await engineSendInteractiveList({
      accountId, userId: configOwnerUserId, conversationId, contactId,
      bodyText: 'Browse our programs:',
      buttonLabel: cta.buttonLabel,
      sections: [section],
    })
    return
  }

  const result = await searchCourses(db, accountId, {
    query: searchParams?.query as string | undefined,
    category: searchParams?.category as string | undefined,
    offset: 0,
  })
  if (result.courses.length === 0) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'No courses to show right now.', aiGenerated: true })
    return
  }
  const section = clampListSection(result.list_section)
  if (!section) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: 'Here are our training courses — ask me about any of them!', aiGenerated: true })
    return
  }
  const cta = listCtaFor(section)
  await engineSendInteractiveList({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    bodyText: 'Browse our training courses:',
    buttonLabel: cta.buttonLabel,
    sections: [section],
  })
}

async function handleNgoEnrollTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  courseId: string,
): Promise<void> {
  const result = await enrollContactInCourse(db, accountId, contactId, courseId)
  if (!result.ok) {
    await engineSendText({ accountId, userId: configOwnerUserId, conversationId, contactId, text: result.error || 'Could not enroll you right now — please try again.', aiGenerated: true })
    return
  }

  const lessonLine = result.firstLesson
    ? `\n\n*First lesson:* ${result.firstLesson.title}\n${result.firstLesson.content || ''}`
    : ''
  await engineSendText({
    accountId, userId: configOwnerUserId, conversationId, contactId,
    text:
      `🎓 *Enrolled!*\n\n` +
      `*Course:* ${result.courseName}\n` +
      `*Duration:* ${result.durationWeeks} weeks` +
      `${lessonLine}\n\n` +
      `Say *start lesson* anytime to continue.`,
    aiGenerated: true,
  })
}

// ============================================================
// Cart Button Handler (no AI)
// ============================================================

async function handleCartButton(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  configOwnerUserId: string,
  action: 'checkout' | 'clear' | 'continue',
): Promise<void> {
  switch (action) {
    case 'checkout': {
      const cart = await getCart(db, conversationId)
      if (cart.length === 0) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Your cart is empty! Browse products and add some items first.',
          aiGenerated: true,
        })
        return
      }
      // Call preview_product_order directly — same pattern as confirm button
      // We need to create the pending order and show confirm/edit/cancel
      // Reprice from the catalogue before building the pending order
      const pricedCart = await resolveCataloguePrices(db, accountId, cart)
      const total = pricedCart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      const itemCount = pricedCart.reduce((sum, item) => sum + item.quantity, 0)

      const { data: pending, error: pendingErr } = await db
        .from('pending_product_orders')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          user_id: configOwnerUserId,
          items: pricedCart.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit_price: i.unit_price,
            product_id: i.product_id,
          })),
          item_count: itemCount,
          order_type: 'delivery',
          delivery_address: null,
          notes: null,
          customer_name: null,
          customer_phone: null,
          price: total,
          currency: 'KES',
        })
        .select('id')
        .single()

      if (pendingErr || !pending) {
        console.error('[handleCartButton] checkout pending error:', pendingErr)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: 'Failed to create order. Please try again.',
          aiGenerated: true,
        })
        return
      }

      // Clear cart after creating pending order
      await clearCart(db, conversationId)

      // Share the first product's photo with the preview
      const firstWithImage = cart.find((i) => i.product_id)
      if (firstWithImage?.product_id) {
        try {
          const { data: offering } = await db
            .from('offerings')
            .select('media:offering_media(url, is_primary, sort_order)')
            .eq('id', firstWithImage.product_id)
            .eq('account_id', accountId)
            .maybeSingle()
          const previewMedia = (offering?.media as Array<{ url: string; is_primary?: boolean; sort_order?: number }>) || []
          const previewImage =
            previewMedia.find((m) => m.is_primary)?.url || previewMedia[0]?.url || null
          if (previewImage) {
            await engineSendMedia({
              accountId,
              userId: configOwnerUserId,
              conversationId,
              contactId,
              kind: 'image',
              link: previewImage,
            })
          }
        } catch (imgErr) {
          console.error('[handleCartButton] failed to send cart image:', imgErr)
        }
      }

      // Format items list
      const itemList = pricedCart.map(i => `• ${i.quantity}× ${i.name} — KES ${i.unit_price * i.quantity}`).join('\n')

      // Send preview with confirm/edit/cancel buttons
      await engineSendInteractiveButtons({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        bodyText:
          `🛒 *Order Preview*\n\n` +
          `*Items:*\n${itemList}\n\n` +
          `*Total:* KES ${total}`,
        buttons: [
          { id: `product_order_confirm_${pending.id}`, title: '✅ Confirm' },
          { id: `product_order_edit_${pending.id}`, title: '✏️ Edit' },
          { id: `product_order_cancel_${pending.id}`, title: '❌ Cancel' },
        ],
      })
      break
    }

    case 'clear': {
      await clearCart(db, conversationId)
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: '🗑️ Cart cleared! Browse products and add items when ready.',
        aiGenerated: true,
      })
      break
    }

    case 'continue': {
      await engineSendText({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        text: 'What would you like to add? Tell me the product name or say "show products" to browse.',
        aiGenerated: true,
      })
      break
    }
  }
}

// ============================================================
// Direct schedule flow (no AI round-trip)
//
// Tapping "📅 Schedule Viewing" / a room / a service sends the
// shared slot list straight away; tapping a slot books it right
// here — the same insert the old Confirm button did.
// ============================================================

const SCHEDULE_PENDING_TABLE: Record<ScheduleContextKind, string> = {
  property: 'pending_property_inquiries',
  room: 'pending_bookings',
  service: 'pending_service_bookings',
}

async function sendPendingScheduleList(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  kind: ScheduleContextKind,
  pendingId: string,
  page: number,
  intro: string,
): Promise<void> {
  const mode = kind === 'room' ? ('dates' as const) : ('times' as const)
  const built = buildScheduleListSection({ mode, page })

  if (!built.list_section) {
    await engineSendText({ accountId, userId, conversationId, contactId, text: built.response, aiGenerated: true })
    return
  }

  const section = attachScheduleContext(built.list_section, kind, pendingId)
  await engineSendInteractiveList({
    accountId,
    userId,
    conversationId,
    contactId,
    bodyText: `${intro}\n\n${built.response}`.slice(0, 1024),
    buttonLabel: NEXT_WEEK_BUTTON_LABEL,
    sections: [section],
  })

  // Remember which window we sent so "Next week" can keep jumping.
  try {
    const { data: row } = await db
      .from(SCHEDULE_PENDING_TABLE[kind])
      .select('metadata')
      .eq('id', pendingId)
      .maybeSingle()
    await db
      .from(SCHEDULE_PENDING_TABLE[kind])
      .update({ metadata: { ...((row?.metadata as Record<string, unknown>) || {}), schedule_page: page } })
      .eq('id', pendingId)
      .eq('account_id', accountId)
  } catch (err) {
    console.error('[schedule] failed to persist schedule_page:', err)
  }
}

async function handleNextWeekTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 45 * 60 * 1000).toISOString()
  const candidates: Array<{ kind: ScheduleContextKind; col: string }> = [
    { kind: 'property', col: 'preferred_date' },
    { kind: 'room', col: 'check_in_date' },
    { kind: 'service', col: 'service_date' },
  ]

  for (const c of candidates) {
    const { data: row } = await db
      .from(SCHEDULE_PENDING_TABLE[c.kind])
      .select('id, metadata')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .is(c.col, null)
      .gt('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!row) continue

    const page = ((((row.metadata as Record<string, unknown>) || {})?.schedule_page as number) || 0) + 1
    await sendPendingScheduleList(db, accountId, conversationId, contactId, userId, c.kind, row.id, page,
      'Here are the next openings:')
    return true
  }
  return false
}

async function handleContextScheduleTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  tap: { kind: ScheduleContextKind; pendingId: string; date: string; time: string | null },
): Promise<void> {
  const { kind, pendingId, date, time } = tap
  const table = SCHEDULE_PENDING_TABLE[kind]
  const { data: pending } = await db
    .from(table)
    .select('*')
    .eq('id', pendingId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (!pending) {
    await engineSendText({
      accountId, userId, conversationId, contactId,
      text: 'This schedule has expired — tap the item again to start over.',
      aiGenerated: true,
    })
    return
  }

  // Rooms: check-in day picked → ask how long, then book on the nights tap.
  if (kind === 'room') {
    await engineSendInteractiveList({
      accountId, userId, conversationId, contactId,
      bodyText:
        `*How long is your stay?*\n\n` +
        `*Room:* ${pending.offering_name || pending.room_type}\n` +
        `*Check-in:* ${date}`,
      buttonLabel: 'Change day',
      sections: [stayLengthSection(pendingId, date)],
    })
    return
  }

  if (!isFutureDate(date)) {
    await sendPendingScheduleList(db, accountId, conversationId, contactId, userId, kind, pendingId, 0,
      'That date has passed — here are upcoming times:')
    return
  }

  const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, userId)
  if (gate !== 'ok') return

  if (kind === 'property') {
    const { ok, bookingNumber, error } = await createBooking({
      db, accountId, contactId,
      start: time ? `${date}T${time}` : date,
      offeringId: pending.offering_id,
      guests: 1,
      total: pending.budget || 0,
      currency: pending.currency || 'KES',
      notes: pending.notes,
      fallbackPrefix: 'INQ',
      metadata: {
        type: 'property_inquiry',
        inquiry_type: pending.inquiry_type || 'viewing',
        property_name: pending.offering_name,
        offering_name: pending.offering_name,
        customer_name: pending.customer_name,
        customer_phone: pending.customer_phone,
        preferred_date: date,
        preferred_time: time,
        budget: pending.budget,
      },
    })
    if (!ok || !bookingNumber) {
      await engineSendText({ accountId, userId, conversationId, contactId, text: 'Failed to schedule your viewing. Please try again.', aiGenerated: true })
      console.error('[schedule] property booking failed:', error)
      return
    }
    await db.from(table).delete().eq('id', pendingId).eq('account_id', accountId)
    await engineSendText({
      accountId, userId, conversationId, contactId,
      text:
        `\u2705 *Viewing scheduled!*\n\n` +
        `*Property:* ${pending.offering_name}\n` +
        `*Date:* ${date}` + (time ? ` at ${time}` : '') + `\n` +
        `*Reference:* ${bookingNumber}\n\n` +
        `Reply with a new date any time to change it.`,
      aiGenerated: true,
    })
    return
  }

  // service
  const { ok, bookingNumber, error } = await createBooking({
    db, accountId, contactId,
    start: time ? `${date}T${time}` : date,
    offeringId: pending.offering_id,
    guests: 1,
    total: pending.total_price || 0,
    currency: pending.currency || 'KES',
    notes: pending.notes,
    fallbackPrefix: 'BK',
    metadata: {
      type: 'service_booking',
      service_name: pending.offering_name,
      offering_name: pending.offering_name,
      customer_name: pending.customer_name,
      customer_phone: pending.customer_phone,
      service_date: date,
      service_time: time,
      duration_minutes: pending.duration_minutes,
    },
  })
  if (!ok || !bookingNumber) {
    await engineSendText({ accountId, userId, conversationId, contactId, text: 'Failed to book. Please try again.', aiGenerated: true })
    console.error('[schedule] service booking failed:', error)
    return
  }
  await db.from(table).delete().eq('id', pendingId).eq('account_id', accountId)
  await engineSendText({
    accountId, userId, conversationId, contactId,
    text:
      `\u2705 *Booked!*\n\n` +
      `*Service:* ${pending.offering_name}\n` +
      `*Date:* ${date}` + (time ? ` at ${time}` : '') + `\n` +
      (pending.duration_minutes ? `*Duration:* ${pending.duration_minutes} min\n` : '') +
      `*Reference:* ${bookingNumber}\n\n` +
      `Reply with a new date any time to change it.`,
    aiGenerated: true,
  })
}

async function handleStayLengthTap(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  conversationId: string,
  contactId: string,
  userId: string,
  tap: { pendingId: string; checkIn: string; nights: number },
): Promise<void> {
  const { pendingId, checkIn, nights } = tap
  const { data: pending } = await db
    .from('pending_bookings')
    .select('*')
    .eq('id', pendingId)
    .eq('account_id', accountId)
    .maybeSingle()

  if (!pending) {
    await engineSendText({
      accountId, userId, conversationId, contactId,
      text: 'This schedule has expired — tap the room again to start over.',
      aiGenerated: true,
    })
    return
  }

  if (!isFutureDate(checkIn) || nights < 1) {
    await sendPendingScheduleList(db, accountId, conversationId, contactId, userId, 'room', pendingId, 0,
      'That date has passed — here are upcoming days:')
    return
  }

  const gate = await ensureCheckoutReady(db, accountId, conversationId, contactId, userId)
  if (gate !== 'ok') return

  const perNight = pending.total_price || 0
  const endDate = new Date(checkIn)
  endDate.setDate(endDate.getDate() + nights)
  const checkOut = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  const guests = pending.guests || 1

  const { ok, bookingNumber, error } = await createBooking({
    db, accountId, contactId,
    start: checkIn,
    end: checkOut,
    offeringId: pending.offering_id,
    guests,
    total: perNight * nights,
    currency: pending.currency || 'KES',
    notes: pending.notes,
    fallbackPrefix: 'BK',
    metadata: {
      type: 'room_booking',
      room_name: pending.offering_name || pending.room_type,
      offering_name: pending.offering_name,
      guest_name: pending.guest_name,
      guest_phone: pending.guest_phone,
      check_in_date: checkIn,
      check_out_date: checkOut,
      nights,
      guests,
      price_per_night: perNight,
    },
  })

  if (!ok || !bookingNumber) {
    await engineSendText({ accountId, userId, conversationId, contactId, text: 'Failed to book. Please try again.', aiGenerated: true })
    console.error('[schedule] room booking failed:', error)
    return
  }
  await db.from('pending_bookings').delete().eq('id', pendingId).eq('account_id', accountId)
  await engineSendText({
    accountId, userId, conversationId, contactId,
    text:
      `\u2705 *Booked!*\n\n` +
      `*Room:* ${pending.offering_name || pending.room_type}\n` +
      `*Check-in:* ${checkIn}\n` +
      `*Check-out:* ${checkOut}\n` +
      `*Nights:* ${nights}\n` +
      `*Total:* ${pending.currency || 'KES'} ${perNight * nights}\n` +
      `*Reference:* ${bookingNumber}\n\n` +
      `Reply with a new date any time to change it.`,
    aiGenerated: true,
  })
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

    // ── CONSENT TAPS ──────────────────────────────────────────
    // Accept/Decline needs no AI config — handle before anything else.
    if (interactiveReplyId === 'consent_accept' || interactiveReplyId === 'consent_decline') {
      await handleConsentTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
      return
    }

    // ── SCHEDULE TAPS (direct — booked without an AI round-trip) ──
    if (interactiveReplyId) {
      const stayTap = parseStayLengthId(interactiveReplyId)
      if (stayTap) {
        await handleStayLengthTap(db, accountId, conversationId, contactId, configOwnerUserId, stayTap)
        return
      }
      const slotTap = parseContextSlotId(interactiveReplyId)
      if (slotTap) {
        await handleContextScheduleTap(db, accountId, conversationId, contactId, configOwnerUserId, slotTap)
        return
      }
      if (interactiveReplyId === NEXT_WEEK_BUTTON_LABEL) {
        if (await handleNextWeekTap(db, accountId, conversationId, contactId, configOwnerUserId)) return
      }
    }

    const config = await loadAiConfig()
    console.log('[dispatchInboundToAiReply] config:', config ? `provider=${config.provider}, autoReplyEnabled=${config.autoReplyEnabled}` : 'NULL')

    // ── AI NOT AVAILABLE ──────────────────────────────────────
    if (!config || !config.autoReplyEnabled) {
      // No AI — but still handle buttons (they don't need AI)
      if (interactiveReplyId) {
        const orderAction = parseOrderButtonId(interactiveReplyId)
        if (orderAction) {
          console.log(`[dispatchInboundToAiReply] button click (no AI config): ${orderAction.action}`)
          await handleOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, orderAction)
          return
        }
        const foodAction = parseFoodOrderButtonId(interactiveReplyId)
        if (foodAction) {
          console.log(`[dispatchInboundToAiReply] food order button click (no AI config): ${foodAction.action}`)
          await handleFoodOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, foodAction)
          return
        }
        const reservationAction = parseReservationButtonId(interactiveReplyId)
        if (reservationAction) {
          console.log(`[dispatchInboundToAiReply] reservation button click (no AI config): ${reservationAction.action}`)
          await handleReservationButton(db, accountId, conversationId, contactId, configOwnerUserId, reservationAction)
          return
        }
        const bookingAction = parseBookingButtonId(interactiveReplyId)
        if (bookingAction) {
          console.log(`[dispatchInboundToAiReply] booking button click (no AI config): ${bookingAction.action}`)
          await handleBookingButton(db, accountId, conversationId, contactId, configOwnerUserId, bookingAction)
          return
        }
        const propertyInquiryAction = parsePropertyInquiryButtonId(interactiveReplyId)
        if (propertyInquiryAction) {
          console.log(`[dispatchInboundToAiReply] property inquiry button click (no AI config): ${propertyInquiryAction.action}`)
          await handlePropertyInquiryButton(db, accountId, conversationId, contactId, configOwnerUserId, propertyInquiryAction)
          return
        }
        const menuMore = parseMenuMoreButtonId(interactiveReplyId)
        if (menuMore) {
          console.log(`[dispatchInboundToAiReply] menu more click (no AI config): offset=${menuMore.offset}`)
          await handleMenuMore(db, accountId, conversationId, contactId, configOwnerUserId, menuMore.offset)
          return
        }
        const roomMore = parseRoomMoreButtonId(interactiveReplyId)
        if (roomMore) {
          console.log(`[dispatchInboundToAiReply] room more click (no AI config): offset=${roomMore.offset}`)
          await handleRoomMore(db, accountId, conversationId, contactId, configOwnerUserId, roomMore.offset)
          return
        }
        const productAction = parseProductOrderButtonId(interactiveReplyId)
        if (productAction) {
          console.log(`[dispatchInboundToAiReply] product order button click (no AI config): ${productAction.action}`)
          await handleProductOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, productAction)
          return
        }
        const productMore = parseProductMoreButtonId(interactiveReplyId)
        if (productMore) {
          console.log(`[dispatchInboundToAiReply] product more click (no AI config): offset=${productMore.offset}`)
          await handleProductMore(db, accountId, conversationId, contactId, configOwnerUserId, productMore.offset)
          return
        }
        const serviceMore = parseServiceMoreButtonId(interactiveReplyId)
        if (serviceMore) {
          console.log(`[dispatchInboundToAiReply] service more click (no AI config): offset=${serviceMore.offset}`)
          await handleServiceMore(db, accountId, conversationId, contactId, configOwnerUserId, serviceMore.offset)
          return
        }
        const propertyMore = parsePropertyMoreButtonId(interactiveReplyId)
        if (propertyMore) {
          console.log(`[dispatchInboundToAiReply] property more click (no AI config): offset=${propertyMore.offset}`)
          await handlePropertyMore(db, accountId, conversationId, contactId, configOwnerUserId, propertyMore.offset)
          return
        }
        const ngoProgramMore = parseNgoProgramMoreButtonId(interactiveReplyId)
        if (ngoProgramMore) {
          console.log(`[dispatchInboundToAiReply] ngo program more click (no AI config): offset=${ngoProgramMore.offset}`)
          await handleNgoProgramMore(db, accountId, conversationId, contactId, configOwnerUserId, ngoProgramMore.offset)
          return
        }
        const ngoCourseMore = parseNgoCourseMoreButtonId(interactiveReplyId)
        if (ngoCourseMore) {
          console.log(`[dispatchInboundToAiReply] ngo course more click (no AI config): offset=${ngoCourseMore.offset}`)
          await handleNgoCourseMore(db, accountId, conversationId, contactId, configOwnerUserId, ngoCourseMore.offset)
          return
        }
        const offeringMore = parseOfferingMoreButtonId(interactiveReplyId)
        if (offeringMore) {
          console.log(`[dispatchInboundToAiReply] offering more click (no AI config): offset=${offeringMore.offset}`)
          await handleOfferingMore(db, accountId, conversationId, contactId, configOwnerUserId, offeringMore.offset)
          return
        }
        const cartAction = parseCartButtonId(interactiveReplyId)
        if (cartAction) {
          console.log(`[dispatchInboundToAiReply] cart button click (no AI config): ${cartAction.action}`)
          await handleCartButton(db, accountId, conversationId, contactId, configOwnerUserId, cartAction.action)
          return
        }
        // Product list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('product_add_')) {
          console.log(`[dispatchInboundToAiReply] product list select (no AI config): ${interactiveReplyId}`)
          await handleProductListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // Menu list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('menu_add_')) {
          console.log(`[dispatchInboundToAiReply] menu list select (no AI config): ${interactiveReplyId}`)
          await handleMenuListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // Room list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('room_select_')) {
          console.log(`[dispatchInboundToAiReply] room list select (no AI config): ${interactiveReplyId}`)
          await handleRoomListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // Service list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('service_select_')) {
          console.log(`[dispatchInboundToAiReply] service list select (no AI config): ${interactiveReplyId}`)
          await handleServiceListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // Property list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('property_select_')) {
          console.log(`[dispatchInboundToAiReply] property list select (no AI config): ${interactiveReplyId}`)
          await handlePropertyListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // NGO program list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('ngo_program_select_')) {
          console.log(`[dispatchInboundToAiReply] ngo program list select (no AI config): ${interactiveReplyId}`)
          await handleNgoProgramListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // NGO course list selection (WhatsApp list reply)
        if (interactiveReplyId.startsWith('ngo_course_select_')) {
          console.log(`[dispatchInboundToAiReply] ngo course list select (no AI config): ${interactiveReplyId}`)
          await handleNgoCourseListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // NGO apply / info / back / enroll taps (no AI)
        if (interactiveReplyId.startsWith('ngo_apply_')) {
          console.log(`[dispatchInboundToAiReply] ngo apply tap (no AI config): ${interactiveReplyId}`)
          await handleNgoApplyTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_apply_'.length))
          return
        }
        if (interactiveReplyId.startsWith('ngo_info_')) {
          console.log(`[dispatchInboundToAiReply] ngo info tap (no AI config): ${interactiveReplyId}`)
          await handleNgoInfoTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_info_'.length))
          return
        }
        if (interactiveReplyId.startsWith('ngo_back_')) {
          console.log(`[dispatchInboundToAiReply] ngo back tap (no AI config)`)
          await handleNgoBackTap(db, accountId, conversationId, contactId, configOwnerUserId, 'program')
          return
        }
        if (interactiveReplyId.startsWith('ngo_enroll_')) {
          console.log(`[dispatchInboundToAiReply] ngo enroll tap (no AI config): ${interactiveReplyId}`)
          await handleNgoEnrollTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_enroll_'.length))
          return
        }
        if (interactiveReplyId.startsWith('ngo_course_info_')) {
          console.log(`[dispatchInboundToAiReply] ngo course info tap (no AI config): ${interactiveReplyId}`)
          await handleNgoCourseInfoTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_course_info_'.length))
          return
        }
        if (interactiveReplyId.startsWith('ngo_course_back_')) {
          console.log(`[dispatchInboundToAiReply] ngo course back tap (no AI config)`)
          await handleNgoBackTap(db, accountId, conversationId, contactId, configOwnerUserId, 'course')
          return
        }
        // Contact-for-price item enquiry (WhatsApp list reply)
        if (interactiveReplyId.startsWith('price_enquire_')) {
          console.log(`[dispatchInboundToAiReply] price enquire select (no AI config): ${interactiveReplyId}`)
          await handlePriceEnquire(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
        // Generic offering detail (WhatsApp list reply)
        if (interactiveReplyId.startsWith('offering_select_')) {
          console.log(`[dispatchInboundToAiReply] offering list select (no AI config): ${interactiveReplyId}`)
          await handleOfferingListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
          return
        }
      }
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'noAi')
      return
    }

    // ── BUTTON CLICK HANDLING (before credits check) ──────────
    // Buttons always work — they don't consume AI credits.
    if (interactiveReplyId) {
      const orderAction = parseOrderButtonId(interactiveReplyId)
      if (orderAction) {
        console.log(`[dispatchInboundToAiReply] button click: ${orderAction.action} on order ${orderAction.orderId}`)
        await handleOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, orderAction)
        return
      }
      const foodAction = parseFoodOrderButtonId(interactiveReplyId)
      if (foodAction) {
        console.log(`[dispatchInboundToAiReply] food order button click: ${foodAction.action}`)
        await handleFoodOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, foodAction)
        return
      }
      const reservationAction = parseReservationButtonId(interactiveReplyId)
      if (reservationAction) {
        console.log(`[dispatchInboundToAiReply] reservation button click: ${reservationAction.action}`)
        await handleReservationButton(db, accountId, conversationId, contactId, configOwnerUserId, reservationAction)
        return
      }
      const bookingAction = parseBookingButtonId(interactiveReplyId)
      if (bookingAction) {
        console.log(`[dispatchInboundToAiReply] booking button click: ${bookingAction.action}`)
        await handleBookingButton(db, accountId, conversationId, contactId, configOwnerUserId, bookingAction)
        return
      }
      const propertyInquiryAction = parsePropertyInquiryButtonId(interactiveReplyId)
      if (propertyInquiryAction) {
        console.log(`[dispatchInboundToAiReply] property inquiry button click: ${propertyInquiryAction.action}`)
        await handlePropertyInquiryButton(db, accountId, conversationId, contactId, configOwnerUserId, propertyInquiryAction)
        return
      }
      const menuMore = parseMenuMoreButtonId(interactiveReplyId)
      if (menuMore) {
        console.log(`[dispatchInboundToAiReply] menu more click: offset=${menuMore.offset}`)
        await handleMenuMore(db, accountId, conversationId, contactId, configOwnerUserId, menuMore.offset)
        return
      }
      const roomMore = parseRoomMoreButtonId(interactiveReplyId)
      if (roomMore) {
        console.log(`[dispatchInboundToAiReply] room more click: offset=${roomMore.offset}`)
        await handleRoomMore(db, accountId, conversationId, contactId, configOwnerUserId, roomMore.offset)
        return
      }
      const productAction = parseProductOrderButtonId(interactiveReplyId)
      if (productAction) {
        console.log(`[dispatchInboundToAiReply] product order button click: ${productAction.action}`)
        await handleProductOrderButton(db, accountId, conversationId, contactId, configOwnerUserId, productAction)
        return
      }
      const productMore = parseProductMoreButtonId(interactiveReplyId)
      if (productMore) {
        console.log(`[dispatchInboundToAiReply] product more click: offset=${productMore.offset}`)
        await handleProductMore(db, accountId, conversationId, contactId, configOwnerUserId, productMore.offset)
        return
      }
      const serviceMore = parseServiceMoreButtonId(interactiveReplyId)
      if (serviceMore) {
        console.log(`[dispatchInboundToAiReply] service more click: offset=${serviceMore.offset}`)
        await handleServiceMore(db, accountId, conversationId, contactId, configOwnerUserId, serviceMore.offset)
        return
      }
      const propertyMore = parsePropertyMoreButtonId(interactiveReplyId)
      if (propertyMore) {
        console.log(`[dispatchInboundToAiReply] property more click: offset=${propertyMore.offset}`)
        await handlePropertyMore(db, accountId, conversationId, contactId, configOwnerUserId, propertyMore.offset)
        return
      }
      const ngoProgramMore = parseNgoProgramMoreButtonId(interactiveReplyId)
      if (ngoProgramMore) {
        console.log(`[dispatchInboundToAiReply] ngo program more click: offset=${ngoProgramMore.offset}`)
        await handleNgoProgramMore(db, accountId, conversationId, contactId, configOwnerUserId, ngoProgramMore.offset)
        return
      }
      const ngoCourseMore = parseNgoCourseMoreButtonId(interactiveReplyId)
      if (ngoCourseMore) {
        console.log(`[dispatchInboundToAiReply] ngo course more click: offset=${ngoCourseMore.offset}`)
        await handleNgoCourseMore(db, accountId, conversationId, contactId, configOwnerUserId, ngoCourseMore.offset)
        return
      }
      const offeringMore = parseOfferingMoreButtonId(interactiveReplyId)
      if (offeringMore) {
        console.log(`[dispatchInboundToAiReply] offering more click: offset=${offeringMore.offset}`)
        await handleOfferingMore(db, accountId, conversationId, contactId, configOwnerUserId, offeringMore.offset)
        return
      }
      const cartAction = parseCartButtonId(interactiveReplyId)
      if (cartAction) {
        console.log(`[dispatchInboundToAiReply] cart button click: ${cartAction.action}`)
        await handleCartButton(db, accountId, conversationId, contactId, configOwnerUserId, cartAction.action)
        return
      }
      // Product list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('product_add_')) {
        console.log(`[dispatchInboundToAiReply] product list select: ${interactiveReplyId}`)
        await handleProductListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // Menu list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('menu_add_')) {
        console.log(`[dispatchInboundToAiReply] menu list select: ${interactiveReplyId}`)
        await handleMenuListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // Room list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('room_select_')) {
        console.log(`[dispatchInboundToAiReply] room list select: ${interactiveReplyId}`)
        await handleRoomListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // Service list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('service_select_')) {
        console.log(`[dispatchInboundToAiReply] service list select: ${interactiveReplyId}`)
        await handleServiceListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // Property list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('property_select_')) {
        console.log(`[dispatchInboundToAiReply] property list select: ${interactiveReplyId}`)
        await handlePropertyListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // NGO program list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('ngo_program_select_')) {
        console.log(`[dispatchInboundToAiReply] ngo program list select: ${interactiveReplyId}`)
        await handleNgoProgramListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // NGO course list selection (WhatsApp list reply)
      if (interactiveReplyId.startsWith('ngo_course_select_')) {
        console.log(`[dispatchInboundToAiReply] ngo course list select: ${interactiveReplyId}`)
        await handleNgoCourseListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // NGO apply / info / back / enroll taps
      if (interactiveReplyId.startsWith('ngo_apply_')) {
        console.log(`[dispatchInboundToAiReply] ngo apply tap: ${interactiveReplyId}`)
        await handleNgoApplyTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_apply_'.length))
        return
      }
      if (interactiveReplyId.startsWith('ngo_info_')) {
        console.log(`[dispatchInboundToAiReply] ngo info tap: ${interactiveReplyId}`)
        await handleNgoInfoTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_info_'.length))
        return
      }
      if (interactiveReplyId.startsWith('ngo_back_')) {
        console.log(`[dispatchInboundToAiReply] ngo back tap`)
        await handleNgoBackTap(db, accountId, conversationId, contactId, configOwnerUserId, 'program')
        return
      }
      if (interactiveReplyId.startsWith('ngo_enroll_')) {
        console.log(`[dispatchInboundToAiReply] ngo enroll tap: ${interactiveReplyId}`)
        await handleNgoEnrollTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_enroll_'.length))
        return
      }
      if (interactiveReplyId.startsWith('ngo_course_info_')) {
        console.log(`[dispatchInboundToAiReply] ngo course info tap: ${interactiveReplyId}`)
        await handleNgoCourseInfoTap(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId.slice('ngo_course_info_'.length))
        return
      }
      if (interactiveReplyId.startsWith('ngo_course_back_')) {
        console.log(`[dispatchInboundToAiReply] ngo course back tap`)
        await handleNgoBackTap(db, accountId, conversationId, contactId, configOwnerUserId, 'course')
        return
      }
      // Contact-for-price item enquiry (WhatsApp list reply)
      if (interactiveReplyId.startsWith('price_enquire_')) {
        console.log(`[dispatchInboundToAiReply] price enquire select: ${interactiveReplyId}`)
        await handlePriceEnquire(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
        return
      }
      // Generic offering detail (WhatsApp list reply)
      if (interactiveReplyId.startsWith('offering_select_')) {
        console.log(`[dispatchInboundToAiReply] offering list select: ${interactiveReplyId}`)
        await handleOfferingListSelect(db, accountId, conversationId, contactId, configOwnerUserId, interactiveReplyId)
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

    // Enabled capabilities — gates toolsets and prompt tool sections
    // (undefined = unknown → business-type fallback inside the helpers)
    const capabilities = await getEnabledCapabilityKeys(db, accountId)

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
      capabilities,
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
    const tools = getToolsForBusinessType(businessType, capabilities)
    const toolDefs = tools.map((t) => ({ type: 'function' as const, function: t.definition.function }))

    console.log('[ai-tool-loop] tools configured:', {
      businessType,
      capabilities,
      toolCount: toolDefs.length,
      toolNames: toolDefs.map((t) => t.function.name),
    })

    const toolCtx: ToolContext = {
      db,
      accountId,
      conversationId,
      contactId,
      contactPhone: null,
      contactName: null,
      businessType,
      capabilities,
      userId: configOwnerUserId,
    }

    // Fetch contact details for tool context
    const { data: contact } = await db
      .from('contacts')
      .select('phone, name')
      .eq('id', contactId)
      .maybeSingle()
    if (contact) {
      // Skip `bsuid_` placeholder phones — they're not real numbers
      // and would pollute order/booking customer_phone fields.
      const phone = contact.phone || ''
      toolCtx.contactPhone =
        phone && !phone.startsWith('bsuid_') ? phone : null
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
    let finalImageUrl: string | null = null
    let finalListSection: { title: string; rows: Array<{ id: string; title: string; description?: string }> } | null = null
    let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    let lastUsage = null

    const MAX_TOOL_ROUNDS = 5
    let toolResponseCaptured = false
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

      // Debug: show full tool call arguments on first round
      if (round === 0 && result.tool_calls) {
        for (const tc of result.tool_calls) {
          console.log('[ai-tool-loop] tool call:', tc.function.name, 'args:', tc.function.arguments)
        }
      }

      // Track cumulative usage
      if (result.usage) {
        lastUsage = result.usage
        totalUsage.promptTokens += result.usage.promptTokens
        totalUsage.completionTokens += result.usage.completionTokens
        totalUsage.totalTokens += result.usage.totalTokens
      }

      // If no tool calls, we have our final text response
      if (!hasToolCalls({ tool_calls: result.tool_calls })) {
        // Don't let AI text override a tool's structured response
        if (!toolResponseCaptured) {
          finalText = result.text
        }
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
          // Capture image_url from tool results
          if (parsed.image_url && !finalImageUrl) {
            finalImageUrl = parsed.image_url
          }
          // Capture list_section from tool results (for clickable product lists)
          if (parsed.list_section && !finalListSection) {
            finalListSection = parsed.list_section
          }
          // Use the structured response message if available
          if (parsed.response && !finalText) {
            finalText = parsed.response
            toolResponseCaptured = true
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
        if (!toolResponseCaptured) {
          finalText = result.text || 'I processed your request. Let me know if you need anything else.'
        }
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
      // Send handoff message to customer
      await sendDefaultMessage(db, accountId, conversationId, contactId, configOwnerUserId, 'handoff')

      // Log the handoff but do NOT disable AI — it stays active for the next message.
      // This prevents the bot from getting permanently stuck after a single handoff trigger.
      const summary = buildHandoffSummary({
        messages: ctx.messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
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

    // ── SEND IMAGE (if tool returned one) ─────────────────────
    if (finalImageUrl) {
      try {
        await engineSendMedia({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          kind: 'image',
          link: finalImageUrl,
        })
      } catch (imgErr) {
        console.error('[ai auto-reply] failed to send image:', imgErr)
        // Continue to send text/buttons even if image fails
      }
    }

    // Send interactive list if tool returned list_section (clickable catalogue list)
    let primarySent = false
    if (finalListSection && finalListSection.rows.length > 0) {
      // Meta rejects lists whose rows exceed 24/72 chars or >10 rows —
      // clamp defensively, then pick CTA wording from the row id prefix.
      const listSection = clampListSection(finalListSection)
      const cta = listSection
        ? listCtaFor(listSection)
        : { buttonLabel: 'View Options', fallbackBody: 'Tap an option below:' }
      if (listSection) {
        try {
          await engineSendInteractiveList({
            accountId,
            userId: configOwnerUserId,
            conversationId,
            contactId,
            bodyText: clampBody(reply.text || cta.fallbackBody),
            buttonLabel: cta.buttonLabel,
            sections: [listSection],
          })
          // Send See More button as separate message if there are more items
          if (finalButtons && finalButtons.length > 0) {
            await engineSendInteractiveButtons({
              accountId,
              userId: configOwnerUserId,
              conversationId,
              contactId,
              bodyText: 'Need more options?',
              buttons: finalButtons.map((b) => ({ id: b.id, title: b.title })),
            })
          }
          primarySent = true
        } catch (listErr) {
          console.error('[ai auto-reply] failed to send list, falling back to text:', listErr)
        }
      }
      if (!primarySent) {
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: reply.text || 'Here are the results:',
          aiGenerated: true,
        })
        primarySent = true
      }
    }

    // Send interactive buttons if available, otherwise plain text
    if (!primarySent) {
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
    }

    // ── POST-REPLY HOOKS (consent ask + profile nudge) ───────
    // Deliberately AFTER the main reply, never mid-answer and
    // never blocking — silence on the consent message means NOT
    // accepted (checkout re-asks when needed).
    try {
      const consentSent = await maybeRequestConsent(db, accountId, conversationId, contactId, configOwnerUserId)
      await maybeNudgeProfile(db, accountId, conversationId, contactId, configOwnerUserId, consentSent)
    } catch (hookErr) {
      console.error('[ai auto-reply] post-reply hooks failed:', hookErr)
    }
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}
