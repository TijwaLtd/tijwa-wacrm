// ============================================================
// Common scheduling tools — shared by property viewings,
// restaurant reservations, room bookings and service
// appointments. One list format, one "book now" contract,
// one update path.
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'
import {
  AI_SCHEDULING_GUIDANCE,
  SCHEDULE_BOOKING_TYPE,
  buildScheduleListSection,
  formatSlotLabel,
  isFutureDate,
  parseScheduleSlotId,
} from '@/lib/business/scheduling'

export { AI_SCHEDULING_GUIDANCE }

export const schedulingTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_available_slots',
      description:
        'Show open scheduling slots as a tappable WhatsApp list (Day · Date · Time rows plus a "Next week" button). Use when a customer wants to schedule a viewing, reservation, booking or appointment.',
      parameters: {
        type: 'object',
        properties: {
          mode: {
            type: 'string',
            enum: ['times', 'dates'],
            description:
              '"times" = day+time slots (viewings, reservations, appointments). "dates" = day-only rows (hotel check-ins). Default times.',
          },
          page: {
            type: 'number',
            description: '0 = current window (default), 1 = next week.',
          },
          date: {
            type: 'string',
            description: 'YYYY-MM-DD to show one specific day only.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_schedule',
      description:
        "Update the customer's most recent booking/inquiry to a new date or time. The new date must be in the future.",
      parameters: {
        type: 'object',
        properties: {
          purpose: {
            type: 'string',
            enum: ['viewing', 'reservation', 'booking', 'appointment'],
            description: 'Which schedule to change. Omit to use their most recent booking.',
          },
          date: { type: 'string', description: 'New date YYYY-MM-DD' },
          time: { type: 'string', description: 'New time HH:MM (24h)' },
          end_date: { type: 'string', description: 'New end/check-out date YYYY-MM-DD (bookings)' },
        },
        required: ['date'],
      },
    },
  },
]

/** Slot list result in the exact shape auto-reply's list sender expects. */
export function slotList(
  mode: 'times' | 'dates' = 'times',
  opts: { page?: number; date?: string } = {},
): { response: string; list_section: ScheduleSection | null } {
  const built = buildScheduleListSection({ mode, page: opts.page, date: opts.date })
  return { response: built.response, list_section: built.list_section }
}

type ScheduleSection = { title: string; rows: Array<{ id: string; title: string; description?: string }> }

/**
 * Checkout gate the old Confirm button ran (consent + profile
 * completion). Its messages are sent by the gate itself — we
 * only need to know whether to hold the booking.
 */
export async function scheduleGateReady(ctx: ToolContext): Promise<boolean> {
  try {
    const { ensureCheckoutReady } = await import('../auto-reply')
    const gate = await ensureCheckoutReady(ctx.db, ctx.accountId, ctx.conversationId, ctx.contactId, ctx.userId)
    return gate === 'ok'
  } catch (err) {
    console.error('[scheduling] checkout gate failed:', err)
    return true
  }
}

const getAvailableSlotsHandler: ToolHandler = async (args) => {
  const mode = (args.mode as 'times' | 'dates') || 'times'
  const page = typeof args.page === 'number' ? Math.max(0, Math.trunc(args.page)) : 0
  const date = typeof args.date === 'string' ? args.date : undefined
  return { success: true, ...slotList(mode, { page, date }) }
}

const updateScheduleHandler: ToolHandler = async (args, ctx) => {
  const purpose = args.purpose as keyof typeof SCHEDULE_BOOKING_TYPE | undefined
  const newDate = args.date as string | undefined
  const newTime = args.time as string | undefined
  const newEndDate = args.end_date as string | undefined

  if (!newDate) {
    return { success: false, error: 'date is required' }
  }
  if (!isFutureDate(newDate)) {
    return {
      success: false,
      ...slotList('times'),
      response: `That date has already passed. Here are upcoming times:`,
    }
  }

  const { data: rows, error } = await ctx.db
    .from('bookings')
    .select('*')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return { success: false, error: error.message }

  type BookingRow = {
    id: string
    booking_number?: string | null
    start_date?: string | null
    metadata?: { type?: string } | null
  }
  const list: BookingRow[] = rows || []
  const wantedType = purpose ? SCHEDULE_BOOKING_TYPE[purpose] : null
  const allTypes = Object.values(SCHEDULE_BOOKING_TYPE)
  const target =
    (wantedType && list.find((r) => r.metadata?.type === wantedType)) ||
    list.find((r) => allTypes.includes(r.metadata?.type || '')) ||
    null

  if (!target) {
    return {
      success: false,
      ...slotList('times'),
      response: `I couldn't find a booking to change yet. Let's pick a new slot instead:`,

    }
  }

  const meta: Record<string, unknown> = { ...(target.metadata || {}) }
  const startTime = newTime || extractTime(target.start_date)
  const updates: Record<string, unknown> = {}

  if (newDate) {
    updates.start_date = startTime ? `${newDate}T${startTime}` : newDate
    const type = meta.type as string | undefined
    if (type === 'reservation') {
      meta.reservation_date = newDate
      if (newTime) meta.reservation_time = newTime
    } else if (type === 'property_inquiry') {
      meta.preferred_date = newDate
      if (newTime) meta.preferred_time = newTime
    } else if (type === 'service_booking') {
      meta.service_date = newDate
      if (newTime) meta.service_time = newTime
    } else if (type === 'room_booking') {
      meta.check_in_date = newDate
    }
  }
  if (newEndDate) {
    updates.end_date = newEndDate
    if (meta.type === 'room_booking') meta.check_out_date = newEndDate
  }
  updates.metadata = meta

  const { error: updErr } = await ctx.db
    .from('bookings')
    .update(updates)
    .eq('id', target.id)
    .eq('account_id', ctx.accountId)

  if (updErr) return { success: false, error: updErr.message }

  return {
    success: true,
    response:
      `✅ Updated — now ${formatSlotLabel(newDate, newTime || null)}` +
      (newEndDate ? ` → ${formatSlotLabel(newEndDate, null)}` : '') +
      `\nReference: ${target.booking_number}`,
  }
}

function extractTime(value: unknown): string | null {
  if (typeof value !== 'string' || !value.includes('T')) return null
  const t = value.split('T')[1] || ''
  return t.slice(0, 5) || null
}

export const schedulingToolHandlers: Partial<Record<string, ToolHandler>> = {
  get_available_slots: getAvailableSlotsHandler,
  update_schedule: updateScheduleHandler,
}

/** Re-export for preview handlers that need a parsed slot id. */
export { parseScheduleSlotId }
