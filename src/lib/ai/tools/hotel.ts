// ============================================================
// Hotel AI Tools — Room search, bookings
//
// Flow: AI collects info → preview_booking → stores in pending
// table → returns buttons → user clicks → handler creates real
// booking (no AI re-entry)
//
// Tools:
// - search_rooms: search available rooms by dates/capacity
// - get_room: get single room details
// - preview_booking: store pending booking + show buttons
// - get_customer_bookings: list customer's bookings
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'

// ============================================================
// Tool Definitions
// ============================================================

export const hotelTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_rooms',
      description: 'Search available hotel rooms. Returns rooms with prices and amenities.',
      parameters: {
        type: 'object',
        properties: {
          check_in: { type: 'string', description: 'Check-in date (YYYY-MM-DD). If provided with check_out, filters by availability.' },
          check_out: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
          guests: { type: 'number', description: 'Number of guests (filters by room capacity)' },
          query: { type: 'string', description: 'Search term (e.g. "deluxe", "suite", "presidential")' },
          min_price: { type: 'number', description: 'Minimum price per night' },
          max_price: { type: 'number', description: 'Maximum price per night' },
          limit: { type: 'number', description: 'Max rooms to return (default 10)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_room',
      description: 'Get full details of a specific room including price, amenities, capacity, and policies.',
      parameters: {
        type: 'object',
        properties: {
          room_id: { type: 'string', description: 'The room ID' },
        },
        required: ['room_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_booking',
      description: 'Create a room booking preview with total price. Returns formatted message with Confirm/Edit/Cancel buttons.',
      parameters: {
        type: 'object',
        properties: {
          room_id: { type: 'string', description: 'Room type ID to book' },
          guest_name: { type: 'string', description: 'Guest name for the booking' },
          check_in_date: { type: 'string', description: 'Check-in date (YYYY-MM-DD)' },
          check_out_date: { type: 'string', description: 'Check-out date (YYYY-MM-DD)' },
          guests: { type: 'number', description: 'Number of guests (default 1)' },
          special_requests: { type: 'string', description: 'Special requests (e.g. "late check-in", "extra pillows")' },
        },
        required: ['room_id', 'guest_name', 'check_in_date', 'check_out_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_bookings',
      description: 'Get the current customer\'s booking history.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'all'] },
          limit: { type: 'number', description: 'Max bookings to return (default 5)' },
        },
      },
    },
  },
]

// ============================================================
// Price Calculation Helper
// ============================================================

function calculateNights(checkIn: string, checkOut: string): number {
  const start = new Date(checkIn)
  const end = new Date(checkOut)
  const diffMs = end.getTime() - start.getTime()
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

// ============================================================
// Standalone Search Function (used by tool handler + button handler)
// ============================================================

export interface RoomSearchParams {
  check_in?: string
  check_out?: string
  guests?: number
  query?: string
  min_price?: number
  max_price?: number
  limit?: number
  offset?: number
}

export interface RoomSearchResult {
  rooms: Array<{
    id: string
    name: string
    description: string | null
    price_per_night: number
    currency: string
    max_guests: number
    bed_type: string | null
    amenities: string[]
    view: string | null
    image_url: string | null
  }>
  count: number
  has_more: boolean
  offset: number
  search_dates: { check_in: string; check_out: string } | null
  buttons?: Array<{ id: string; title: string }>
}

export async function searchRooms(
  db: any,
  accountId: string,
  params: RoomSearchParams,
): Promise<RoomSearchResult> {
  const guests = params.guests || 1
  const minPrice = params.min_price || 0
  const maxPrice = params.max_price || Infinity
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('account_id', accountId)
    .eq('type', 'room')
    .eq('status', 'active')

  if (params.query) {
    q = q.or(`name.ilike.%${params.query}%,short_description.ilike.%${params.query}%,description.ilike.%${params.query}%`)
  }

  const { data: rooms, error } = await q
    .order('price', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    return { rooms: [], count: 0, has_more: false, offset, search_dates: null }
  }

  let filtered = (rooms || []).filter((room: any) => {
    const meta = (room.metadata || {}) as Record<string, unknown>
    const capacity = (meta.capacity as Record<string, unknown>) || {}
    const maxGuests = (capacity.max_guests as number) || 2
    if (guests > maxGuests) return false
    if (room.price < minPrice) return false
    if (room.price > maxPrice) return false
    return true
  })

  if (params.check_in && params.check_out) {
    const { data: bookedRooms } = await db
      .from('bookings')
      .select('offering_id')
      .eq('account_id', accountId)
      .in('status', ['pending', 'confirmed', 'checked_in'])
      .lt('start_date', params.check_out)
      .gt('end_date', params.check_in)

    const bookedIds = new Set((bookedRooms || []).map((b: any) => b.offering_id))
    filtered = filtered.filter((room: any) => !bookedIds.has(room.id))
  }

  const has_more = filtered.length === limit
  const nextOffset = offset + limit

  const resultRooms = filtered.map((room: any) => {
    const meta = (room.metadata || {}) as Record<string, unknown>
    const capacity = (meta.capacity as Record<string, unknown>) || {}
    const media = (room.media as any[]) || []
    const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    return {
      id: room.id,
      name: room.name,
      description: room.short_description || room.description,
      price_per_night: room.price,
      currency: room.currency || 'KES',
      max_guests: capacity.max_guests || 2,
      bed_type: capacity.bed_type || null,
      amenities: meta.amenities || [],
      view: meta.view || null,
      image_url: primaryImage,
    }
  })

  const result: RoomSearchResult = {
    rooms: resultRooms,
    count: filtered.length,
    has_more,
    offset,
    search_dates: params.check_in && params.check_out
      ? { check_in: params.check_in, check_out: params.check_out }
      : null,
  }

  if (has_more) {
    result.buttons = [{ id: `room_more_${nextOffset}`, title: 'See More →' }]
  }

  return result
}

// ============================================================
// Tool Handlers
// ============================================================

const searchRoomsHandler: ToolHandler = async (args, ctx) => {
  const result = await searchRooms(ctx.db, ctx.accountId, {
    check_in: args.check_in as string | undefined,
    check_out: args.check_out as string | undefined,
    guests: (args.guests as number) || undefined,
    query: args.query as string | undefined,
    min_price: (args.min_price as number) || undefined,
    max_price: (args.max_price as number) || undefined,
    limit: (args.limit as number) || undefined,
    offset: (args.offset as number) || undefined,
  })

  // Store search params in conversation metadata for "More" button
  if (ctx.conversationId) {
    const searchParams: RoomSearchParams = {
      check_in: args.check_in as string | undefined,
      check_out: args.check_out as string | undefined,
      guests: (args.guests as number) || undefined,
      query: args.query as string | undefined,
      min_price: (args.min_price as number) || undefined,
      max_price: (args.max_price as number) || undefined,
    }
    const { data: conv } = await ctx.db
      .from('conversations')
      .select('metadata')
      .eq('id', ctx.conversationId)
      .maybeSingle()

    await ctx.db
      .from('conversations')
      .update({
        metadata: {
          ...(conv?.metadata || {}),
          room_search_params: searchParams,
        },
      })
      .eq('id', ctx.conversationId)
  }

  return result
}

const getRoomHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const roomId = args.room_id as string

  const { data: room, error } = await db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('id', roomId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'room')
    .maybeSingle()

  if (error || !room) {
    return { found: false, error: 'Room not found' }
  }

  const meta = (room.metadata || {}) as Record<string, unknown>
  const capacity = (meta.capacity as Record<string, unknown>) || {}
  const policies = (meta.policies as Record<string, unknown>) || {}
  const media = (room.media as any[]) || []
  const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
  const allImages = media.map((m: any) => m.url).filter(Boolean)

  return {
    found: true,
    id: room.id,
    name: room.name,
    description: room.short_description || room.description,
    price_per_night: room.price,
    currency: room.currency || 'KES',
    max_guests: capacity.max_guests || 2,
    bed_type: capacity.bed_type || null,
    bedrooms: capacity.bedrooms || 1,
    bathrooms: capacity.bathrooms || 1,
    amenities: meta.amenities || [],
    view: meta.view || null,
    floor: meta.floor || null,
    room_size_sqm: meta.room_size_sqm || null,
    check_in_time: policies.check_in || '14:00',
    check_out_time: policies.check_out || '11:00',
    cancellation_policy: policies.cancellation || null,
    image_url: primaryImage,
    image_urls: allImages,
  }
}

const previewBookingHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  const roomId = args.room_id as string
  const guestName = (args.guest_name as string) || ctx.contactName || 'Guest'
  const checkInDate = args.check_in_date as string
  const checkOutDate = args.check_out_date as string
  const guests = (args.guests as number) || 1
  const specialRequests = (args.special_requests as string) || null

  if (!checkInDate || !checkOutDate) {
    return { success: false, error: 'Check-in and check-out dates are required' }
  }

  const nights = calculateNights(checkInDate, checkOutDate)

  // Look up room details
  const { data: room } = await db
    .from('offerings')
    .select('id, name, price, currency, metadata, media:offering_media(url, is_primary)')
    .eq('id', roomId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'room')
    .maybeSingle()

  if (!room) {
    return { success: false, error: 'Room not found' }
  }

  const pricePerNight = room.price || 0
  const totalPrice = pricePerNight * nights
  const media = (room.media as any[]) || []
  const roomImageUrl = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null

  // Store in pending_bookings
  const { data: pending, error } = await db
    .from('pending_bookings')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      offering_id: roomId,
      offering_name: room.name,
      guest_name: guestName,
      guest_phone: ctx.contactPhone || null,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      nights,
      guests,
      price_per_night: pricePerNight,
      total_price: totalPrice,
      currency: room.currency || 'KES',
      special_requests: specialRequests,
    })
    .select('id')
    .single()

  if (error || !pending) {
    console.error('[hotel tool] booking preview error:', error)
    return { success: false, error: 'Failed to create booking preview' }
  }

  const pendingId = pending.id

  // Format dates nicely
  const checkInObj = new Date(checkInDate)
  const checkOutObj = new Date(checkOutDate)
  const formattedCheckIn = checkInObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const formattedCheckOut = checkOutObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const message =
    `🏨 *Booking Preview*\n\n` +
    `*Room:* ${room.name}\n` +
    `*Guest:* ${guestName}\n` +
    `*Check-in:* ${formattedCheckIn}\n` +
    `*Check-out:* ${formattedCheckOut}\n` +
    `*Nights:* ${nights}\n` +
    `*Guests:* ${guests}\n` +
    (specialRequests ? `*Special Requests:* ${specialRequests}\n` : '') +
    `\n*Price:* KES ${pricePerNight}/night × ${nights} nights = *KES ${totalPrice}*\n\n` +
    `Reply *confirm* to book, or *edit* to make changes.`

  return {
    success: true,
    pending_booking_id: pendingId,
    price: totalPrice,
    currency: room.currency || 'KES',
    nights,
    response: message,
    image_url: roomImageUrl,
    buttons: [
      { id: `booking_confirm_${pendingId}`, title: '✅ Confirm' },
      { id: `booking_edit_${pendingId}`, title: '✏️ Edit' },
      { id: `booking_cancel_${pendingId}`, title: '❌ Cancel' },
    ],
  }
}

const getCustomerBookingsHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const status = args.status as string
  const limit = (args.limit as number) || 5

  let query = db
    .from('bookings')
    .select('id, booking_number, status, total, currency, start_date, end_date, guests, notes, metadata, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: bookings } = await query

  if (!bookings || bookings.length === 0) {
    return { bookings: [], count: 0, message: 'No bookings found' }
  }

  return {
    bookings: bookings.map((b: any) => {
      const meta = (b.metadata || {}) as Record<string, unknown>
      return {
        booking_number: b.booking_number,
        status: b.status,
        total: b.total,
        currency: b.currency,
        room: meta.room_name || meta.offering_name || null,
        check_in: b.start_date,
        check_out: b.end_date,
        guests: b.guests,
        created_at: b.created_at,
      }
    }),
    count: bookings.length,
  }
}

// ============================================================
// Export Handlers
// ============================================================

export const hotelToolHandlers: Record<string, ToolHandler> = {
  search_rooms: searchRoomsHandler,
  get_room: getRoomHandler,
  preview_booking: previewBookingHandler,
  get_customer_bookings: getCustomerBookingsHandler,
}
