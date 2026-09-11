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
import { parseOrderButtonId, parseFoodOrderButtonId, parseReservationButtonId, parseBookingButtonId, parsePropertyInquiryButtonId, parseProductOrderButtonId, parseMenuMoreButtonId, parseRoomMoreButtonId, parseProductMoreButtonId, parseServiceMoreButtonId, parsePropertyMoreButtonId, parseCartButtonId } from './tools'
import { searchMenuItems } from './tools/restaurant'
import { searchRooms } from './tools/hotel'
import { searchProducts, getCart, addToCart, clearCart, formatCartSummary, getCartButtons } from './tools/retailer'
import { searchServices } from './tools/services'
import { searchProperties } from './tools/property'

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

      // Create real order
      const items = (pending.items as any[]) || []
      const { data: order, error: orderError } = await db
        .from('orders')
        .insert({
          account_id: accountId,
          order_number: orderNum,
          contact_id: contactId,
          status: 'confirmed',
          currency: pending.currency || 'KES',
          subtotal: pending.price || 0,
          tax_amount: 0,
          discount_amount: 0,
          total: pending.price || 0,
          notes: pending.notes || null,
          metadata: {
            items: items.map((i: any) => ({
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
        const orderItems = items.map((i: any) => ({
          order_id: order.id,
          offering_id: null,
          name: i.name,
          quantity: i.quantity || 1,
          unit_price: i.unit_price || 0,
          total_price: (i.quantity || 1) * (i.unit_price || 0),
        }))
        await db.from('order_items').insert(orderItems)
      }

      // Send confirmation message
      const itemList = items.map((i: any) => `• ${i.quantity || 1}x ${i.name}`).join('\n')
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
          `*Total:* KES ${pending.price}\n\n` +
          `Your order is being prepared. We'll notify you when it's ready!`,
        aiGenerated: true,
      })

      // ── PAYMENT DETAILS ────────────────────────────────────
      const paymentMsg = await buildPaymentMessage(
        db, accountId, pending.currency || 'KES', pending.price || 0, order.order_number,
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

      // Create real order
      const items = (pending.items as any[]) || []
      const { data: order, error: orderError } = await db
        .from('orders')
        .insert({
          account_id: accountId,
          order_number: orderNum,
          contact_id: contactId,
          status: 'confirmed',
          currency: pending.currency || 'KES',
          subtotal: pending.price || 0,
          tax_amount: 0,
          discount_amount: 0,
          total: pending.price || 0,
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
          `*Total:* KES ${pending.price}` +
          (pending.delivery_address ? `\n*Delivery Address:* ${pending.delivery_address}` : '') +
          `\n\nYour order has been placed. We'll notify you when it's on the way!`,
        aiGenerated: true,
      })

      // ── PAYMENT DETAILS ────────────────────────────────────
      const paymentMsg = await buildPaymentMessage(
        db, accountId, pending.currency || 'KES', pending.price || 0, order.order_number,
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
      // Ask for date/time, then AI will handle the rest
      await engineSendInteractiveButtons({
        accountId,
        userId: configOwnerUserId,
        conversationId,
        contactId,
        bodyText:
          `📅 *Schedule Viewing*\n\n` +
          `*Property:* ${pending.offering_name}\n\n` +
          `When would you like to view this property?\n` +
          `Please reply with the date and time (e.g. "Saturday 3pm" or "2026-09-15 10:00").`,
        buttons: [
          { id: `property_inquiry_confirm_${pendingId}`, title: '✅ Confirm' },
          { id: `property_inquiry_edit_${pendingId}`, title: '✏️ Change Date' },
          { id: `property_inquiry_cancel_${pendingId}`, title: '❌ Cancel' },
        ],
      })
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

  // Look up product name
  const { data: product } = await db
    .from('offerings')
    .select('name')
    .eq('id', productId)
    .eq('account_id', accountId)
    .maybeSingle()

  const productName = product?.name || 'Product'

  // Add to cart
  const cart = await addToCart(db, conversationId, {
    name: productName,
    quantity: 1,
    unit_price: price,
    product_id: productId,
  })

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

  // Look up item name
  const { data: item } = await db
    .from('offerings')
    .select('name')
    .eq('id', itemId)
    .eq('account_id', accountId)
    .maybeSingle()

  const itemName = item?.name || 'Menu Item'

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

  // Look up room details
  const { data: room } = await db
    .from('offerings')
    .select('name, metadata')
    .eq('id', roomId)
    .eq('account_id', accountId)
    .maybeSingle()

  const roomName = room?.name || 'Room'
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

  // Send preview with confirm/edit/cancel buttons
  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText:
      `🏨 *Booking Summary*\n\n` +
      `*Room:* ${roomName}\n` +
      `*Guests:* ${maxGuests}\n` +
      `*Price:* KES ${pricePerNight}/night\n\n` +
      `Please confirm your booking.`,
    buttons: [
      { id: `booking_confirm_${pending.id}`, title: '✅ Confirm' },
      { id: `booking_edit_${pending.id}`, title: '✏️ Edit' },
      { id: `booking_cancel_${pending.id}`, title: '❌ Cancel' },
    ],
  })
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

  // Look up service name
  const { data: service } = await db
    .from('offerings')
    .select('name, metadata')
    .eq('id', serviceId)
    .eq('account_id', accountId)
    .maybeSingle()

  const serviceName = service?.name || 'Service'
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

  // Send preview with confirm/edit/cancel buttons
  await engineSendInteractiveButtons({
    accountId,
    userId: configOwnerUserId,
    conversationId,
    contactId,
    bodyText:
      `📋 *Service Booking Summary*\n\n` +
      `*Service:* ${serviceName}\n` +
      `*Duration:* ${durationMinutes} min\n` +
      `*Price:* KES ${price}\n\n` +
      `Please confirm your booking.`,
    buttons: [
      { id: `booking_confirm_${pending.id}`, title: '✅ Confirm' },
      { id: `booking_edit_${pending.id}`, title: '✏️ Edit' },
      { id: `booking_cancel_${pending.id}`, title: '❌ Cancel' },
    ],
  })
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

  // Look up property details
  const { data: property } = await db
    .from('offerings')
    .select('name, metadata')
    .eq('id', propertyId)
    .eq('account_id', accountId)
    .maybeSingle()

  const propertyName = property?.name || 'Property'
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
    `💰 KES ${price} (${listingType})\n\n` +
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
      const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

      const { data: pending, error: pendingErr } = await db
        .from('pending_product_orders')
        .insert({
          account_id: accountId,
          contact_id: contactId,
          conversation_id: conversationId,
          user_id: configOwnerUserId,
          items: cart.map(i => ({
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

      // Format items list
      const itemList = cart.map(i => `• ${i.quantity}× ${i.name} — KES ${i.unit_price * i.quantity}`).join('\n')

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

    console.log('[ai-tool-loop] tools configured:', {
      businessType,
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

    // Send interactive list if tool returned list_section (clickable product list)
    if (finalListSection && finalListSection.rows.length > 0) {
      try {
        await engineSendInteractiveList({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          bodyText: reply.text || 'Tap a product to add to cart:',
          buttonLabel: 'Browse Products',
          sections: [finalListSection],
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
      } catch (listErr) {
        console.error('[ai auto-reply] failed to send list, falling back to text:', listErr)
        await engineSendText({
          accountId,
          userId: configOwnerUserId,
          conversationId,
          contactId,
          text: reply.text || 'Here are the products:',
          aiGenerated: true,
        })
      }
    // Send interactive buttons if available, otherwise plain text
    } else if (finalButtons && finalButtons.length > 0 && reply.text) {
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
