// ============================================================
// Restaurant AI Tools — Menu search, food orders, reservations
//
// Flow: AI collects info → preview_food_order/preview_reservation
// → stores in pending table → returns buttons → user clicks
// → handler creates real record (no AI re-entry)
//
// Tools:
// - search_menu_items: search menu by category/query
// - get_menu_item: get single item details
// - preview_food_order: store pending food order + show buttons
// - preview_reservation: store pending reservation + show buttons
// - get_customer_orders: list customer's food orders
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'

// ============================================================
// Tool Definitions
// ============================================================

export const restaurantTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_menu_items',
      description: 'Search the restaurant menu. Returns matching items with prices.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (e.g. "chicken", "pasta", "vegetarian")' },
          category: { type: 'string', description: 'Filter by category (e.g. "breakfast", "main_course", "drinks", "desserts")' },
          dietary: { type: 'string', description: 'Filter by dietary need (e.g. "vegetarian", "vegan", "gluten_free")' },
          limit: { type: 'number', description: 'Max items to return (default 10)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_menu_item',
      description: 'Get full details of a specific menu item including price, description, dietary info, and customizations.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'string', description: 'The menu item ID' },
        },
        required: ['item_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_food_order',
      description: 'Create a food order preview with total price. Returns formatted message with Confirm/Edit/Cancel buttons. Call this when the customer wants to place a food order.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit_price: { type: 'number' },
                special_instructions: { type: 'string' },
              },
            },
            description: 'Order items with quantities and prices',
          },
          order_type: { type: 'string', enum: ['dine_in', 'takeaway', 'room_service'], description: 'Order type (default takeaway)' },
          table_number: { type: 'string', description: 'Table number for dine_in orders' },
          room_number: { type: 'string', description: 'Room number for room_service orders' },
          notes: { type: 'string', description: 'Special instructions or notes' },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_reservation',
      description: 'Create a table reservation preview. Returns formatted message with Confirm/Edit/Cancel buttons.',
      parameters: {
        type: 'object',
        properties: {
          guest_name: { type: 'string', description: 'Name for the reservation' },
          party_size: { type: 'number', description: 'Number of guests' },
          reservation_date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          reservation_time: { type: 'string', description: 'Time in HH:MM format (24h)' },
          duration_minutes: { type: 'number', description: 'Expected duration in minutes (default 120)' },
          special_requests: { type: 'string', description: 'Special requests (e.g. "window seat", "birthday cake")' },
        },
        required: ['guest_name', 'party_size', 'reservation_date', 'reservation_time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_food_orders',
      description: 'Get the current customer\'s food order history.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'all'] },
          limit: { type: 'number', description: 'Max orders to return (default 5)' },
        },
      },
    },
  },
]

// ============================================================
// Price Calculation Helper
// ============================================================

function calculateFoodTotal(
  items: Array<{ name: string; quantity: number; unit_price: number }>
): number {
  return items.reduce((sum, item) => {
    const qty = Math.max(1, item.quantity || 1)
    const price = parseFloat(String(item.unit_price)) || 0
    return sum + qty * price
  }, 0)
}

// ============================================================
// Standalone Search Function (used by tool handler + button handler)
// ============================================================

export interface MenuSearchParams {
  query?: string
  category?: string
  dietary?: string
  limit?: number
  offset?: number
}

export interface MenuSearchResult {
  items: Array<{
    id: string
    name: string
    description: string | null
    price: number
    currency: string
    category: string | null
    dietary_info: Record<string, unknown> | null
    preparation_time: string | null
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

export async function searchMenuItems(
  db: any,
  accountId: string,
  params: MenuSearchParams,
): Promise<MenuSearchResult> {
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, category_id, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('account_id', accountId)
    .eq('type', 'menu_item')
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
      .limit(5)

    if (cats && cats.length > 0) {
      q = q.in('category_id', cats.map((c: any) => c.id))
    }
  }

  const { data: items, error } = await q
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    return { items: [], count: 0, has_more: false, offset }
  }

  let filtered = items || []
  if (params.dietary) {
    filtered = filtered.filter((item: any) => {
      const meta = (item.metadata || {}) as Record<string, unknown>
      const dietaryInfo = meta.dietary_info as Record<string, unknown> | undefined
      return dietaryInfo?.[params.dietary!] === true
    })
  }

  const has_more = filtered.length === limit
  const nextOffset = offset + limit

  const resultItems = filtered.map((item: any) => {
    const meta = (item.metadata || {}) as Record<string, unknown>
    const media = (item.media as any[]) || []
    const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    return {
      id: item.id,
      name: item.name,
      description: item.short_description || item.description,
      price: item.price,
      currency: item.currency || 'KES',
      category: meta.category || null,
      dietary_info: meta.dietary_info || null,
      preparation_time: meta.preparation_time || null,
      image_url: primaryImage,
    }
  })

  const result: MenuSearchResult = {
    items: resultItems,
    count: filtered.length,
    has_more,
    offset,
  }

  if (has_more) {
    result.buttons = [{ id: `menu_more_${nextOffset}`, title: 'See More →' }]
  }

  // Build WhatsApp list rows for clickable menu list
  result.list_section = {
    title: 'Menu',
    rows: resultItems.map((item: { id: string; name: string; description: string | null; price: number; currency: string }) => ({
      id: `menu_add_${item.id}_${Math.round(item.price)}`,
      title: `${item.name} — ${item.currency} ${item.price}`,
      description: item.description || undefined,
    })),
  }

  return result
}

// ============================================================
// Tool Handlers
// ============================================================

const searchMenuItemsHandler: ToolHandler = async (args, ctx) => {
  const result = await searchMenuItems(ctx.db, ctx.accountId, {
    query: args.query as string | undefined,
    category: args.category as string | undefined,
    dietary: args.dietary as string | undefined,
    limit: (args.limit as number) || undefined,
    offset: (args.offset as number) || undefined,
  })

  // Store search params in conversation metadata for "More" button
  if (ctx.conversationId) {
    const searchParams: MenuSearchParams = {
      query: args.query as string | undefined,
      category: args.category as string | undefined,
      dietary: args.dietary as string | undefined,
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
          menu_search_params: searchParams,
        },
      })
      .eq('id', ctx.conversationId)
  }

  return result
}

const getMenuItemHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const itemId = args.item_id as string

  const { data: item, error } = await db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('id', itemId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'menu_item')
    .maybeSingle()

  if (error || !item) {
    return { found: false, error: 'Menu item not found' }
  }

  const meta = (item.metadata || {}) as Record<string, unknown>
  const media = (item.media as any[]) || []
  const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
  const allImages = media.map((m: any) => m.url).filter(Boolean)

  return {
    found: true,
    id: item.id,
    name: item.name,
    description: item.short_description || item.description,
    price: item.price,
    currency: item.currency || 'KES',
    dietary_info: meta.dietary_info || null,
    preparation_time: meta.preparation_time || null,
    serves: meta.serves || null,
    ingredients: meta.ingredients || null,
    allergens: meta.allergens || null,
    customizations: meta.customizations || null,
    availability: meta.availability || null,
    image_url: primaryImage,
    image_urls: allImages,
  }
}

const previewFoodOrderHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  const items = (args.items as Array<{
    name: string
    quantity: number
    unit_price: number
    special_instructions?: string
  }>) || []

  if (items.length === 0) {
    return { success: false, error: 'No items provided' }
  }

  const orderType = (args.order_type as string) || 'takeaway'
  const itemCount = items.reduce((sum, i) => sum + (i.quantity || 1), 0)
  const total = calculateFoodTotal(items)

  // Default customer_name to contact name
  let customerName = ctx.contactName || null

  // Look up offering image if items reference a specific menu item
  let offeringImageUrl: string | null = null
  if (items.length === 1 && items[0].name) {
    const { data: offering } = await db
      .from('offerings')
      .select('id, media:offering_media(url, is_primary)')
      .eq('account_id', ctx.accountId)
      .eq('type', 'menu_item')
      .eq('status', 'active')
      .ilike('name', `%${items[0].name}%`)
      .limit(1)
      .maybeSingle()
    if (offering) {
      const media = (offering.media as any[]) || []
      offeringImageUrl = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    }
  }

  // Store in pending_food_orders
  const { data: pending, error } = await db
    .from('pending_food_orders')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      items: items.map(i => ({
        name: i.name,
        quantity: i.quantity || 1,
        unit_price: i.unit_price || 0,
        special_instructions: i.special_instructions || null,
      })),
      item_count: itemCount,
      order_type: orderType,
      table_number: args.table_number || null,
      room_number: args.room_number || null,
      pickup_location: null,
      notes: args.notes || null,
      customer_name: customerName,
      customer_phone: ctx.contactPhone || null,
      price: total,
      currency: 'KES',
    })
    .select('id')
    .single()

  if (error || !pending) {
    console.error('[restaurant tool] preview error:', error)
    return { success: false, error: 'Failed to create preview' }
  }

  const pendingId = pending.id
  const itemList = items.map((i) =>
    `• ${i.quantity}x ${i.name}${i.special_instructions ? ` (${i.special_instructions})` : ''}`
  ).join('\n')

  const typeLabel = orderType === 'dine_in' ? `🍽️ Dine-in (Table ${args.table_number || '?'})`
    : orderType === 'room_service' ? `🛎️ Room Service (Room ${args.room_number || '?'})`
    : `🥡 Takeaway`

  const message =
    `🍽️ *Food Order Preview*\n\n` +
    `${typeLabel}\n\n` +
    `*Items:*\n${itemList}\n\n` +
    `*Total:* KES ${total}\n\n` +
    `Reply *confirm* to place your order, or *edit* to make changes.`

  return {
    success: true,
    pending_order_id: pendingId,
    price: total,
    currency: 'KES',
    order_type: orderType,
    response: message,
    image_url: offeringImageUrl,
    buttons: [
      { id: `food_order_confirm_${pendingId}`, title: '✅ Confirm' },
      { id: `food_order_edit_${pendingId}`, title: '✏️ Edit' },
      { id: `food_order_cancel_${pendingId}`, title: '❌ Cancel' },
    ],
  }
}

const previewReservationHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  const guestName = (args.guest_name as string) || ctx.contactName || 'Guest'
  const partySize = (args.party_size as number) || 1
  const reservationDate = args.reservation_date as string
  const reservationTime = args.reservation_time as string
  const duration = (args.duration_minutes as number) || 120
  const specialRequests = (args.special_requests as string) || null

  if (!reservationDate || !reservationTime) {
    return { success: false, error: 'Date and time are required' }
  }

  // Store in pending_reservations
  const { data: pending, error } = await db
    .from('pending_reservations')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      guest_name: guestName,
      guest_phone: ctx.contactPhone || null,
      party_size: partySize,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      duration_minutes: duration,
      special_requests: specialRequests,
    })
    .select('id')
    .single()

  if (error || !pending) {
    console.error('[restaurant tool] reservation preview error:', error)
    return { success: false, error: 'Failed to create reservation preview' }
  }

  const pendingId = pending.id

  // Format date nicely
  const dateObj = new Date(`${reservationDate}T${reservationTime}`)
  const formattedDate = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const message =
    `📅 *Reservation Preview*\n\n` +
    `*Name:* ${guestName}\n` +
    `*Guests:* ${partySize}\n` +
    `*Date:* ${formattedDate}\n` +
    `*Time:* ${formattedTime}\n` +
    `*Duration:* ${duration} minutes\n` +
    (specialRequests ? `*Special Requests:* ${specialRequests}\n` : '') +
    `\nReply *confirm* to book, or *edit* to make changes.`

  return {
    success: true,
    pending_reservation_id: pendingId,
    response: message,
    buttons: [
      { id: `reservation_confirm_${pendingId}`, title: '✅ Confirm' },
      { id: `reservation_edit_${pendingId}`, title: '✏️ Edit' },
      { id: `reservation_cancel_${pendingId}`, title: '❌ Cancel' },
    ],
  }
}

const getCustomerFoodOrdersHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const status = args.status as string
  const limit = (args.limit as number) || 5

  let query = db
    .from('orders')
    .select('id, order_number, status, total, currency, metadata, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: orders } = await query

  if (!orders || orders.length === 0) {
    return { orders: [], count: 0, message: 'No food orders found' }
  }

  return {
    orders: orders.map((o: any) => {
      const meta = (o.metadata || {}) as Record<string, unknown>
      return {
        order_number: o.order_number,
        status: o.status,
        total: o.total,
        currency: o.currency,
        items: meta.items || [],
        order_type: meta.order_type || 'takeaway',
        created_at: o.created_at,
      }
    }),
    count: orders.length,
  }
}

// ============================================================
// Export Handlers
// ============================================================

export const restaurantToolHandlers: Partial<Record<string, ToolHandler>> = {
  search_menu_items: searchMenuItemsHandler,
  get_menu_item: getMenuItemHandler,
  preview_food_order: previewFoodOrderHandler,
  preview_reservation: previewReservationHandler,
  get_customer_food_orders: getCustomerFoodOrdersHandler,
}
