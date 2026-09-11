// ============================================================
// Service AI Tools — Service search, bookings
//
// Flow: AI collects info → preview_service_booking → stores in pending
// table → returns buttons → user clicks → handler creates real
// booking (no AI re-entry)
//
// Tools:
// - search_services: search available services
// - get_service: get single service details
// - preview_service_booking: store pending booking + show buttons
// - get_customer_service_bookings: list customer's bookings
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'

// ============================================================
// Tool Definitions
// ============================================================

export const serviceTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_services',
      description: 'Search available services. Returns services with prices and durations.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (e.g. "haircut", "massage", "checkup", "oil change")' },
          category: { type: 'string', description: 'Filter by category' },
          min_price: { type: 'number', description: 'Minimum price' },
          max_price: { type: 'number', description: 'Maximum price' },
          limit: { type: 'number', description: 'Max services to return (default 10)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_service',
      description: 'Get full details of a specific service including price, duration, and description.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'The service ID' },
        },
        required: ['service_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_service_booking',
      description: 'Create a service booking preview with total price. Returns formatted message with Confirm/Edit/Cancel buttons.',
      parameters: {
        type: 'object',
        properties: {
          service_id: { type: 'string', description: 'Service ID to book' },
          customer_name: { type: 'string', description: 'Customer name for the booking' },
          service_date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
          service_time: { type: 'string', description: 'Preferred time (HH:MM, 24h format)' },
          notes: { type: 'string', description: 'Special requests or notes' },
        },
        required: ['service_id', 'customer_name', 'service_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_service_bookings',
      description: "Get the current customer's service booking history.",
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'confirmed', 'completed', 'cancelled', 'all'] },
          limit: { type: 'number', description: 'Max bookings to return (default 5)' },
        },
      },
    },
  },
]

// ============================================================
// Standalone Search Function (used by tool handler + button handler)
// ============================================================

export interface ServiceSearchParams {
  query?: string
  category?: string
  min_price?: number
  max_price?: number
  limit?: number
  offset?: number
}

export interface ServiceSearchResult {
  services: Array<{
    id: string
    name: string
    description: string | null
    price: number
    currency: string
    category: string | null
    duration_minutes: number | null
    image_url: string | null
  }>
  count: number
  has_more: boolean
  offset: number
  buttons?: Array<{ id: string; title: string }>
  list_section?: {
    title: string
    rows: Array<{ id: string; title: string; description?: string }>
  }
}

export async function searchServices(
  db: any,
  accountId: string,
  params: ServiceSearchParams,
): Promise<ServiceSearchResult> {
  const minPrice = params.min_price || 0
  const maxPrice = params.max_price || Infinity
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, category_id, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('account_id', accountId)
    .eq('type', 'service')
    .eq('status', 'active')

  if (params.query) {
    q = q.or(`name.ilike.%${params.query}%,short_description.ilike.%${params.query}%,description.ilike.%${params.query}%`)
  }

  if (params.category) {
    const { data: cats } = await db
      .from('offering_categories')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', `%${params.category}%`)

    if (cats && cats.length > 0) {
      q = q.in('category_id', cats.map((c: any) => c.id))
    }
  }

  const { data: services, error } = await q
    .order('price', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    return { services: [], count: 0, has_more: false, offset }
  }

  // Filter by price client-side (metadata not easily filterable)
  const filtered = (services || []).filter((s: any) => {
    const price = s.price || 0
    return price >= minPrice && price <= maxPrice
  })

  const resultItems = filtered.map((s: any) => {
    const meta = (s.metadata || {}) as Record<string, unknown>
    const media = (s.media as any[]) || []
    const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    return {
      id: s.id,
      name: s.name,
      description: s.short_description || s.description,
      price: s.price,
      currency: s.currency || 'KES',
      category: null,
      duration_minutes: (meta.duration_minutes as number) || null,
      image_url: primaryImage,
    }
  })

  const has_more = filtered.length === limit
  const nextOffset = offset + limit

  const result: ServiceSearchResult = {
    services: resultItems,
    count: filtered.length,
    has_more,
    offset,
  }

  if (has_more) {
    result.buttons = [{ id: `service_more_${nextOffset}`, title: 'See More →' }]
  }

  // Build WhatsApp list rows for clickable service list
  result.list_section = {
    title: 'Services',
    rows: resultItems.map((item: { id: string; name: string; description: string | null; price: number; currency: string; duration_minutes: number | null }) => ({
      id: `service_select_${item.id}_${Math.round(item.price)}`,
      title: `${item.name} — ${item.currency} ${item.price}`,
      description: item.description || undefined,
    })),
  }

  return result
}

// ============================================================
// Tool Handlers
// ============================================================

const searchServicesHandler: ToolHandler = async (args, ctx) => {
  const result = await searchServices(ctx.db, ctx.accountId, {
    query: args.query as string | undefined,
    category: args.category as string | undefined,
    min_price: (args.min_price as number) || undefined,
    max_price: (args.max_price as number) || undefined,
    limit: (args.limit as number) || undefined,
    offset: (args.offset as number) || undefined,
  })

  // Store search params in conversation metadata for "More" button
  if (ctx.conversationId) {
    const searchParams: ServiceSearchParams = {
      query: args.query as string | undefined,
      category: args.category as string | undefined,
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
          service_search_params: searchParams,
        },
      })
      .eq('id', ctx.conversationId)
  }

  return result
}

const getServiceHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const serviceId = args.service_id as string

  const { data: service, error } = await db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('id', serviceId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'service')
    .maybeSingle()

  if (error || !service) {
    return { found: false, error: 'Service not found' }
  }

  const meta = (service.metadata || {}) as Record<string, unknown>
  const media = (service.media as any[]) || []
  const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
  const allImages = media.map((m: any) => m.url).filter(Boolean)

  return {
    found: true,
    id: service.id,
    name: service.name,
    description: service.short_description || service.description,
    price: service.price,
    currency: service.currency || 'KES',
    duration_minutes: meta.duration_minutes || null,
    category: meta.category || null,
    image_url: primaryImage,
    image_urls: allImages,
  }
}

const previewServiceBookingHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  const serviceId = args.service_id as string
  const customerName = (args.customer_name as string) || ctx.contactName || 'Customer'
  const serviceDate = args.service_date as string
  const serviceTime = (args.service_time as string) || null
  const notes = (args.notes as string) || null

  if (!serviceDate) {
    return { success: false, error: 'Service date is required' }
  }

  // Look up service details
  const { data: service } = await db
    .from('offerings')
    .select('id, name, price, currency, metadata, media:offering_media(url, is_primary)')
    .eq('id', serviceId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'service')
    .maybeSingle()

  if (!service) {
    return { success: false, error: 'Service not found' }
  }

  const price = service.price || 0
  const meta = (service.metadata || {}) as Record<string, unknown>
  const durationMinutes = (meta.duration_minutes as number) || 60
  const media = (service.media as any[]) || []
  const serviceImageUrl = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null

  // Store in pending_service_bookings
  const { data: pending, error } = await db
    .from('pending_service_bookings')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      offering_id: serviceId,
      offering_name: service.name,
      customer_name: customerName,
      customer_phone: ctx.contactPhone || null,
      service_date: serviceDate,
      service_time: serviceTime,
      duration_minutes: durationMinutes,
      total_price: price,
      currency: service.currency || 'KES',
      notes,
    })
    .select('id')
    .single()

  if (error || !pending) {
    console.error('[services tool] booking preview error:', error)
    return { success: false, error: 'Failed to create booking preview' }
  }

  const pendingId = pending.id

  // Format date nicely
  const dateObj = new Date(serviceDate)
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const message =
    `📋 *Service Booking Preview*\n\n` +
    `*Service:* ${service.name}\n` +
    `*Customer:* ${customerName}\n` +
    `*Date:* ${formattedDate}` +
    (serviceTime ? `\n*Time:* ${serviceTime}` : '') +
    `\n*Duration:* ${durationMinutes} min\n` +
    (notes ? `*Notes:* ${notes}\n` : '') +
    `\n*Price:* ${service.currency || 'KES'} ${price}\n\n` +
    `Reply *confirm* to book, or *edit* to make changes.`

  return {
    success: true,
    pending_booking_id: pendingId,
    price,
    currency: service.currency || 'KES',
    response: message,
    image_url: serviceImageUrl,
    buttons: [
      { id: `booking_confirm_${pendingId}`, title: '✅ Confirm' },
      { id: `booking_edit_${pendingId}`, title: '✏️ Edit' },
      { id: `booking_cancel_${pendingId}`, title: '❌ Cancel' },
    ],
  }
}

const getCustomerServiceBookingsHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const status = args.status as string
  const limit = (args.limit as number) || 5

  let query = db
    .from('bookings')
    .select('id, booking_number, status, total, currency, start_date, end_date, notes, metadata, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: bookings } = await query

  if (!bookings || bookings.length === 0) {
    return { bookings: [], count: 0, message: 'No service bookings found' }
  }

  return {
    bookings: bookings.map((b: any) => {
      const meta = (b.metadata || {}) as Record<string, unknown>
      return {
        booking_number: b.booking_number,
        status: b.status,
        total: b.total,
        currency: b.currency,
        service: meta.service_name || meta.offering_name || null,
        date: b.start_date,
        created_at: b.created_at,
      }
    }),
    count: bookings.length,
  }
}

// ============================================================
// Export Handlers
// ============================================================

export const serviceToolHandlers: Partial<Record<string, ToolHandler>> = {
  search_services: searchServicesHandler,
  get_service: getServiceHandler,
  preview_service_booking: previewServiceBookingHandler,
  get_customer_service_bookings: getCustomerServiceBookingsHandler,
}
