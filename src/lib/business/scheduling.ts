// ============================================================
// Common scheduling — ONE path for viewings, reservations,
// room bookings and appointments.
//
// - buildScheduleListSection() → tappable WhatsApp list of
//   Day · Date · Time rows with a "Next week" footer button
// - slot ids (`slot_2026-10-15_1000`) round-trip through the
//   customer's tapped row title ("Mon 12 Oct · 10:00")
// - createBooking() → the single insert the old Confirm button
//   used to do — tools now call it directly (no confirm step)
// - AI_SCHEDULING_GUIDANCE → the prompt block shared by every
//   scheduling domain so the flow never diverges again
// ============================================================

export type SchedulePurpose = 'viewing' | 'reservation' | 'booking' | 'appointment'

/** Default day slots (24h). Used when the tool doesn't pass its own. */
export const SCHEDULE_SLOTS = ['10:00', '12:00', '15:00', '17:00']

/** Footer button label — doubles as the reply text the customer sends back. */
export const NEXT_WEEK_BUTTON_LABEL = 'Next week →'

/** Days shown per page window (page 0 = now, page 1 = next week). */
export const SCHEDULE_DAYS_PER_PAGE = 3

/** WhatsApp list hard limit (meta-api INTERACTIVE_LIMITS.maxListRowsTotal). */
export const SCHEDULE_MAX_ROWS = 10

export interface ScheduleRow {
  id: string
  title: string
  description?: string
}

export interface ScheduleSection {
  title: string
  rows: ScheduleRow[]
}

export interface ScheduleListResult {
  response: string
  list_section: ScheduleSection | null
}

// ── Dates ────────────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local YYYY-MM-DD (never UTC — slot building happens server-local). */
export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Parse YYYY-MM-DD as a LOCAL date (Date-only strings are UTC otherwise). */
export function parseDateOnly(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

/** "Mon 12 Oct" */
export function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Mon 12 Oct · 10:00" (row title), or "Mon 12 Oct" when no time. */
export function formatSlotLabel(dateISO: string, time?: string | null): string {
  const label = formatDateLabel(parseDateOnly(dateISO))
  return time ? `${label} · ${time}` : label
}

export function scheduleSlotId(dateISO: string, time?: string | null): string {
  return time ? `slot_${dateISO}_${time.replace(':', '')}` : `slot_${dateISO}`
}

export function parseScheduleSlotId(id: string): { date: string; time: string | null } | null {
  const m = id.match(/^slot_(\d{4}-\d{2}-\d{2})(?:_(\d{4}))?$/)
  if (!m) return null
  const raw = m[2]
  const time = raw ? `${raw.slice(0, 2)}:${raw.slice(2, 4)}` : null
  return { date: m[1], time }
}

/** Date must be today-or-later, evaluated at end of that day. */
export function isFutureDate(dateISO: string, now: Date = new Date()): boolean {
  const d = parseDateOnly(dateISO)
  d.setHours(23, 59, 59, 999)
  return d.getTime() > now.getTime()
}

/** Slot must be strictly in the future (today's past times are gone). */
export function isFutureSlot(dateISO: string, time?: string | null, now: Date = new Date()): boolean {
  if (!time) return isFutureDate(dateISO, now)
  const [h, m] = time.split(':').map(Number)
  const d = parseDateOnly(dateISO)
  d.setHours(h || 0, m || 0, 0, 0)
  return d.getTime() > now.getTime()
}

// ── Slot list builder ────────────────────────────────────────

export interface BuildScheduleOptions {
  /** 'times' → day · date · time rows (viewings/reservations/appointments); 'dates' → day rows (check-ins) */
  mode?: 'times' | 'dates'
  /** 0 = current window, 1 = next week (+7 days) */
  page?: number
  /** Show one specific day only */
  date?: string
  slots?: string[]
  now?: Date
}

/**
 * Build the tappable schedule list: one section per day, rows of
 * "Mon 12 Oct · 10:00", capped at Meta's 10-row / 10-section limits.
 * Returns list_section: null when nothing is open in the window.
 */
export function buildScheduleListSection(opts: BuildScheduleOptions = {}): ScheduleListResult {
  const { mode = 'times', page = 0, date, slots, now = new Date() } = opts
  const times = mode === 'dates' ? [''] : slots && slots.length > 0 ? slots : SCHEDULE_SLOTS

  const start = date ? parseDateOnly(date) : new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (!date && page > 0) start.setDate(start.getDate() + page * 7)
  const days = date ? 1 : SCHEDULE_DAYS_PER_PAGE

  const sections: ScheduleSection[] = []
  let rowsLeft = SCHEDULE_MAX_ROWS

  for (let d = 0; d < days && rowsLeft > 0; d++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d)
    const iso = toISODate(day)
    const rows: ScheduleRow[] = []
    for (const t of times) {
      if (rowsLeft <= 0) break
      if (t && !isFutureSlot(iso, t, now)) continue
      rows.push({
        id: scheduleSlotId(iso, t || undefined),
        title: formatSlotLabel(iso, t || undefined),
        description: 'Tap to book',
      })
      rowsLeft--
    }
    if (rows.length > 0) sections.push({ title: formatDateLabel(day), rows })
  }

  const hasRows = sections.length > 0
  const response = !hasRows
    ? 'Nothing open in that window — tap Next week or reply with a date like "15 Oct":'
    : mode === 'dates'
      ? 'Pick a day below, or reply with a date like "15 Oct":'
      : 'Pick a time below, reply with a date like "15 Oct", or tap Next week for later slots:'

  // auto-reply sends exactly one section — fold the days together;
  // every row title already carries its own day + date.
  return {
    response,
    list_section: hasRows ? { title: 'Schedule', rows: sections.flatMap((s) => s.rows) } : null,
  }
}

// ── Direct (no-AI) schedule context ────────────────────────
//
// Button taps like "📅 Schedule Viewing" send the slot list
// straight from the button handler. The pending record id rides
// inside every row id, so the customer's tap lands in
// handleContextScheduleTap and books without an AI round-trip.

export type ScheduleContextKind = 'property' | 'room' | 'service'

const KIND_CODE: Record<ScheduleContextKind, string> = { property: 'pp', room: 'pb', service: 'ps' }
const CODE_KIND: Record<string, ScheduleContextKind> = { pp: 'property', pb: 'room', ps: 'service' }

/** `slot_pp_2026-10-12_1000_<pending-uuid>` (time `0000` = date-only row). */
export function contextSlotId(
  kind: ScheduleContextKind,
  pendingId: string,
  date: string,
  time?: string | null,
): string {
  return `slot_${KIND_CODE[kind]}_${date}_${time ? time.replace(':', '') : '0000'}_${pendingId}`
}

export function parseContextSlotId(
  id: string,
): { kind: ScheduleContextKind; pendingId: string; date: string; time: string | null } | null {
  const m = id.match(/^slot_(pp|pb|ps)_(\d{4}-\d{2}-\d{2})_(\d{4})_([0-9a-fA-F-]{36})$/)
  if (!m) return null
  const time = m[3] === '0000' ? null : `${m[3].slice(0, 2)}:${m[3].slice(2, 4)}`
  return { kind: CODE_KIND[m[1]], pendingId: m[4], date: m[2], time }
}

/** Re-tag plain slot rows with the pending context so taps skip the AI. */
export function attachScheduleContext(
  section: ScheduleSection,
  kind: ScheduleContextKind,
  pendingId: string,
): ScheduleSection {
  return {
    title: section.title,
    rows: section.rows.map((row) => {
      const parsed = parseScheduleSlotId(row.id)
      return parsed ? { ...row, id: contextSlotId(kind, pendingId, parsed.date, parsed.time) } : row
    }),
  }
}

/** Room stays need a length after the check-in day: `slotn_<uuid>_<date>_<nights>`. */
export function stayLengthId(pendingId: string, checkIn: string, nights: number): string {
  return `slotn_${pendingId}_${checkIn}_${nights}`
}

export function parseStayLengthId(id: string): { pendingId: string; checkIn: string; nights: number } | null {
  const m = id.match(/^slotn_([0-9a-fA-F-]{36})_(\d{4}-\d{2}-\d{2})_(\d{1,2})$/)
  if (!m) return null
  return { pendingId: m[1], checkIn: m[2], nights: parseInt(m[3], 10) }
}

/** Stay-length choices offered after a room check-in day is tapped. */
export const STAY_LENGTH_OPTIONS = [1, 2, 3, 4, 5, 7, 14]

export function stayLengthSection(
  pendingId: string,
  checkIn: string,
): { title: string; rows: Array<{ id: string; title: string; description?: string }> } {
  const checkoutLabel = (n: number): string => {
    const d = parseDateOnly(checkIn)
    d.setDate(d.getDate() + n)
    return formatDateLabel(d)
  }
  return {
    title: 'How long?',
    rows: STAY_LENGTH_OPTIONS.map((n) => ({
      id: stayLengthId(pendingId, checkIn, n),
      title: n === 1 ? '1 night' : `${n} nights`,
      description: `out ${checkoutLabel(n)}`,
    })),
  }
}

// ── Booking creation (what the Confirm button used to do) ────

export interface BookingDb {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown }>
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }>
  }
}

export interface CreateBookingParams {
  db: BookingDb
  accountId: string
  contactId: string
  start?: string | null
  end?: string | null
  offeringId?: string | null
  guests?: number
  total?: number
  currency?: string
  metadata: Record<string, unknown>
  notes?: string | null
  fallbackPrefix?: string
}

export async function createBooking(
  params: CreateBookingParams,
): Promise<{ ok: boolean; bookingNumber?: string; error?: string }> {
  const { db, accountId, contactId } = params
  const fallback = `${params.fallbackPrefix || 'BK'}-${Date.now()}`

  let bookingNumber = fallback
  try {
    const { data } = await db.rpc('next_booking_number', { p_account_id: accountId })
    if (data) bookingNumber = String(data)
  } catch {
    // keep fallback
  }

  const { error } = await db.from('bookings').insert({
    account_id: accountId,
    booking_number: bookingNumber,
    contact_id: contactId,
    offering_id: params.offeringId || null,
    status: 'confirmed',
    start_date: params.start || null,
    end_date: params.end || params.start || null,
    guests: params.guests || 1,
    currency: params.currency || 'KES',
    total: params.total || 0,
    notes: params.notes || null,
    metadata: params.metadata,
  })

  if (error) {
    console.error('[scheduling] createBooking error:', error)
    return { ok: false, error: error.message || 'Failed to create booking' }
  }
  return { ok: true, bookingNumber }
}

/** bookings.metadata.type → the purpose it was created for. */
export const SCHEDULE_BOOKING_TYPE: Record<SchedulePurpose, string> = {
  viewing: 'property_inquiry',
  reservation: 'reservation',
  booking: 'room_booking',
  appointment: 'service_booking',
}

// ── Shared AI prompt block ───────────────────────────────────

export const AI_SCHEDULING_GUIDANCE =
  'SCHEDULING (viewings, reservations, room bookings, appointments):\n' +
  '- To offer times, call get_available_slots (mode="times" for viewings/reservations/appointments, mode="dates" for hotel check-ins). ' +
  'It returns a tappable list of Day · Date · Time rows with a "Next week" button to jump ahead.\n' +
  '- If the customer replies with ANY future date/time — "15 Oct", "next Tuesday", or a tapped row like "Mon 12 Oct · 10:00" — treat it as chosen and call the booking tool ' +
  '(preview_property_inquiry / preview_reservation / preview_booking / preview_service_booking). It books immediately and returns the confirmation.\n' +
  '- NEVER ask a scheduling customer to confirm again. NEVER send Confirm/Edit/Cancel buttons for scheduling.\n' +
  '- A reply of "Next week" or "Next week →" means: call get_available_slots(page=1).\n' +
  '- If the date has already passed, say so and call get_available_slots again — never book the past.\n' +
  '- If a required date/time is missing, send the slot list from get_available_slots instead of asking an open question.\n' +
  '- To change an existing booking, call update_schedule with the new future date/time.\n'
