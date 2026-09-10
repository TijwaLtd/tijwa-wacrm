// ============================================================
// Logistics/Delivery Tool Implementations
//
// Flow: AI collects info → preview_delivery_order → stores in
// pending_orders table → returns summary with buttons → user
// clicks Confirm → handler creates real order (no AI re-entry)
//
// Tools available to AI:
// - map_location_to_zone: classify a location (loads from offerings)
// - calculate_delivery_price: get a price quote
// - preview_delivery_order: store pending order + show buttons
// - get_order_by_number / get_customer_orders: look up orders
// - get_delivery_zones / check_working_hours: info tools
// - search_offerings: catalogue search
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'
import { mapLocationToZone } from './zone-mapper'

// ============================================================
// Tool Definitions
// ============================================================

export const logisticsTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'map_location_to_zone',
      description: 'Map a pickup or delivery location to a delivery zone (local/extended). Loads zones from the business offerings. Use to determine zone before calculating price.',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Location from customer (e.g. "Fedha", "Gate B", "Westlands")' },
          location_type: { type: 'string', enum: ['pickup', 'dropoff'], description: 'Pickup or dropoff' },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_delivery_price',
      description: 'Calculate delivery price. Required: items + dropoff_location. Optional: weight_kg, pickup_location, zone_type. Do NOT ask for optional fields.',
      parameters: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' }, description: 'REQUIRED. Items to deliver' },
          item_count: { type: 'number', description: 'Total number of items' },
          pickup_location: { type: 'string', description: 'Pickup address or area' },
          dropoff_location: { type: 'string', description: 'REQUIRED. Delivery destination' },
          vendor_stops: { type: 'number', description: 'Number of pickup stops' },
          weight_kg: { type: 'number', description: 'OPTIONAL. Total weight in kg — do NOT ask for this' },
          zone_type: { type: 'string', enum: ['local', 'extended'], description: 'Delivery zone' },
        },
        required: ['items', 'dropoff_location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_delivery_order',
      description:
        'Store a pending delivery order and return a summary with Confirm/Edit/Cancel buttons. ' +
        'Use this INSTEAD of create_delivery_order. The customer must confirm before the order is created. ' +
        'Required: items + pickup_location + dropoff_location. ' +
        'Optional: weight_kg, notes, customer_name — do NOT ask for these, use only if customer provides them.',
      parameters: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' }, description: 'REQUIRED. Items to deliver, e.g. ["3 cartons of Doll shoes"]' },
          item_count: { type: 'number', description: 'Total number of items' },
          pickup_location: { type: 'string', description: 'REQUIRED. Pickup address or area' },
          dropoff_location: { type: 'string', description: 'REQUIRED. Delivery destination' },
          zone_type: { type: 'string', enum: ['local', 'extended'], description: 'Delivery zone. If unknown, use map_location_to_zone first' },
          vendor_stops: { type: 'number', description: 'Number of pickup stops (default 1). Do not ask — use if customer mentions multiple stops' },
          weight_kg: { type: 'number', description: 'OPTIONAL. Total weight in kg. Do NOT ask — use only if customer volunteers it' },
          notes: { type: 'string', description: 'OPTIONAL. Special instructions. Do NOT ask — use only if customer provides them' },
          customer_name: { type: 'string', description: 'OPTIONAL. Recipient name. Do NOT ask — system defaults to WhatsApp contact name' },
          customer_phone: { type: 'string', description: 'OPTIONAL. Recipient phone. Do NOT ask' },
        },
        required: ['items', 'dropoff_location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_by_number',
      description: 'Look up an order by its order number.',
      parameters: {
        type: 'object',
        properties: {
          order_number: { type: 'string', description: 'Order number (e.g. "ORD-00042")' },
        },
        required: ['order_number'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_orders',
      description: 'Get all orders for the current customer.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'all'] },
          limit: { type: 'number', description: 'Max orders to return (default 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_delivery_zones',
      description: 'Get delivery zones and areas from the business offerings.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_working_hours',
      description: 'Check if the business is currently open.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_offerings',
      description: 'Search the business catalogue.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term' },
          type: { type: 'string', enum: ['product', 'service', 'package', 'menu_item', 'room', 'course', 'event', 'any'] },
        },
        required: ['query'],
      },
    },
  },
]

// ============================================================
// Price calculation helper
// ============================================================

function calculatePrice(
  pricing: Record<string, unknown> | undefined,
  params: { itemCount: number; stops: number; weight: number },
): { total: number; breakdown: Record<string, number> } {
  if (!pricing) return { total: 0, breakdown: {} }

  const baseFee = (pricing.base_fee as number) || 100
  const perItem = (pricing.per_item as number) || 50
  const perStop = (pricing.per_stop as number) || 100
  const perKg = (pricing.per_kg as number) || 20

  let total = baseFee
  const breakdown: Record<string, number> = { base: baseFee }

  if (params.itemCount > 0) {
    const itemCost = params.itemCount * perItem
    total += itemCost
    breakdown.items = itemCost
  }
  if (params.stops > 1) {
    const stopCost = (params.stops - 1) * perStop
    total += stopCost
    breakdown.stops = stopCost
  }
  if (params.weight > 0) {
    const weightCost = params.weight * perKg
    total += weightCost
    breakdown.weight = weightCost
  }

  // Wednesday discount
  const isWednesday = new Date().getDay() === 3
  const wedDiscount = (pricing.wednesday_discount_percent as number) || 0
  if (isWednesday && wedDiscount > 0) {
    const discount = Math.round(total * wedDiscount / 100)
    total -= discount
    breakdown.wednesday_discount = -discount
  }

  return { total: Math.round(total), breakdown }
}

// ============================================================
// Tool Implementations
// ============================================================

const mapLocationToZoneHandler: ToolHandler = async (args, ctx) => {
  const location = args.location as string
  const locationType = (args.location_type as string) || 'dropoff'

  const result = await mapLocationToZone(ctx.db, ctx.accountId, location, locationType)

  return {
    location,
    location_type: locationType,
    zone_type: result.zone_type,
    confidence: result.confidence,
    matched_area: result.matched_area,
    is_local: result.zone_type === 'local',
  }
}

const calculateDeliveryPriceHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  // Auto-detect zone from offering metadata
  let zoneType = args.zone_type as string
  if (!zoneType && args.dropoff_location) {
    const mapped = await mapLocationToZone(db, ctx.accountId, args.dropoff_location as string)
    zoneType = mapped.zone_type
  }

  const { data: offerings } = await db
    .from('offerings')
    .select('id, name, price, metadata')
    .eq('account_id', ctx.accountId)
    .eq('type', 'service')
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  const offering = offerings?.find((o: any) => {
    const meta = o.metadata as Record<string, unknown>
    return meta?.zone_type === zoneType || meta?.zone_type === 'both'
  }) || offerings?.[0]

  if (!offering) {
    return { error: 'No delivery pricing configured' }
  }

  const meta = (offering.metadata || {}) as Record<string, unknown>
  const pricing = meta.pricing as Record<string, unknown> | undefined

  if (!pricing) {
    return { price: offering.price || 0, currency: 'KES', zone: zoneType }
  }

  const itemCount = (args.item_count as number) || (args.items as string[])?.length || 1
  const stops = (args.vendor_stops as number) || 1
  const weight = (args.weight_kg as number) || 0

  const { total, breakdown } = calculatePrice(pricing, { itemCount, stops, weight })

  return {
    price: total,
    currency: 'KES',
    zone: zoneType,
    breakdown,
    is_wednesday: new Date().getDay() === 3,
    prepayment_required: zoneType === 'extended',
  }
}

/**
 * Preview delivery order — stores in pending_orders, returns summary + buttons.
 * Does NOT create the real order. Customer must confirm first.
 */
const previewDeliveryOrderHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  // Auto-detect zone from offering metadata
  let zoneType = args.zone_type as string
  if (!zoneType && args.dropoff_location) {
    const mapped = await mapLocationToZone(db, ctx.accountId, args.dropoff_location as string)
    zoneType = mapped.zone_type
  }

  // Get pricing from offerings
  const { data: offerings } = await db
    .from('offerings')
    .select('id, name, price, metadata')
    .eq('account_id', ctx.accountId)
    .eq('type', 'service')
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  const offering = offerings?.find((o: any) => {
    const meta = o.metadata as Record<string, unknown>
    return meta?.zone_type === zoneType || meta?.zone_type === 'both'
  }) || offerings?.[0]

  const meta = (offering?.metadata || {}) as Record<string, unknown>
  const pricing = meta.pricing as Record<string, unknown> | undefined

  const itemCount = (args.item_count as number) || (args.items as string[])?.length || 1
  const stops = (args.vendor_stops as number) || 1
  const weight = (args.weight_kg as number) || 0

  const { total, breakdown } = calculatePrice(pricing, { itemCount, stops, weight })

  // Default customer_name to contact name from WhatsApp
  let customerName = args.customer_name as string || null
  if (!customerName && ctx.contactName) {
    customerName = ctx.contactName
  }

  // Store in pending_orders
  const { data: pending, error } = await db
    .from('pending_orders')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      items: args.items || [],
      item_count: itemCount,
      pickup_location: args.pickup_location || null,
      dropoff_location: args.dropoff_location,
      zone_type: zoneType || 'local',
      vendor_stops: stops,
      weight_kg: weight || null,
      notes: args.notes || null,
      customer_name: customerName,
      customer_phone: args.customer_phone || null,
      price: total,
      currency: 'KES',
      offering_id: offering?.id || null,
      offering_name: offering?.name || null,
    })
    .select('id')
    .single()

  if (error || !pending) {
    console.error('[logistics tool] preview error:', error)
    return { success: false, error: 'Failed to create preview' }
  }

  const pendingId = pending.id
  const items = (args.items as string[]) || []
  const itemText = items.length > 0 ? items.map((i) => `• ${i}`).join('\n') : '• Items to deliver'
  const isWednesday = new Date().getDay() === 3
  const wedNote = isWednesday ? '\n_Wednesday discount applied!_' : ''
  const prepayNote = zoneType === 'extended' ? '\n\n⚠️ _Prepayment required for extended zone_' : ''

  const message =
    `📦 *Delivery Order Preview*\n\n` +
    `*Items:*\n${itemText}\n\n` +
    `*From:* ${args.pickup_location || 'Pickup location'}\n` +
    `*To:* ${args.dropoff_location}\n` +
    `*Zone:* ${zoneType || 'local'}\n` +
    `*Price:* KES ${total}${wedNote}${prepayNote}\n\n` +
    `Reply *confirm* to approve, or *edit* to make changes.`

  return {
    success: true,
    pending_order_id: pendingId,
    price: total,
    currency: 'KES',
    zone: zoneType,
    response: message,
    buttons: [
      { id: `order_confirm_${pendingId}`, title: '✅ Confirm' },
      { id: `order_edit_${pendingId}`, title: '✏️ Edit' },
      { id: `order_cancel_${pendingId}`, title: '❌ Cancel' },
    ],
  }
}

const getOrderByNumberHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  const { data: order } = await db
    .from('orders')
    .select(`
      id, order_number, status, total, currency, notes, metadata, created_at,
      assigned_team_member_id,
      profiles:assigned_team_member_id(full_name)
    `)
    .eq('account_id', ctx.accountId)
    .eq('order_number', args.order_number as string)
    .maybeSingle()

  if (!order) {
    return { found: false, message: `Order ${args.order_number} not found` }
  }

  const meta = (order.metadata || {}) as Record<string, unknown>
  const assignedProfile = order.profiles as { full_name?: string } | null

  return {
    found: true,
    order_number: order.order_number,
    status: order.status,
    total: order.total,
    currency: order.currency,
    items: meta.items || [],
    dropoff: meta.dropoff_location,
    zone: meta.zone_type,
    assigned_rider: assignedProfile?.full_name || 'Unassigned',
    created_at: order.created_at,
  }
}

const getCustomerOrdersHandler: ToolHandler = async (args, ctx) => {
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
    return { orders: [], count: 0, message: 'No orders found' }
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
        dropoff: meta.dropoff_location,
      }
    }),
    count: orders.length,
  }
}

/**
 * Get delivery zones from the business's offerings.
 * Returns the zones configured in each delivery offering's metadata.
 */
const getDeliveryZonesHandler: ToolHandler = async (_args, ctx) => {
  const { db } = ctx

  const { data: offerings } = await db
    .from('offerings')
    .select('id, name, metadata')
    .eq('account_id', ctx.accountId)
    .eq('status', 'active')

  const zones: Array<{ name: string; type: string; areas: string[]; prepaymentRequired: boolean }> = []

  for (const offering of offerings || []) {
    const meta = (offering.metadata || {}) as Record<string, unknown>
    const zoneType = (meta.zone_type as string) || 'local'
    const areaList = (meta.zones as string[]) || []

    if (areaList.length > 0) {
      zones.push({
        name: offering.name,
        type: zoneType,
        areas: areaList,
        prepaymentRequired: zoneType === 'extended',
      })
    }
  }

  if (zones.length === 0) {
    return {
      zones: [],
      message: 'No delivery zones configured. Please set up delivery offerings with zones in metadata.',
    }
  }

  return { zones }
}

const checkWorkingHoursHandler: ToolHandler = async (_args, ctx) => {
  const { db } = ctx

  const { data } = await db.rpc('is_within_working_hours', {
    p_account_id: ctx.accountId,
  })

  const { data: settings } = await db
    .from('tenant_settings')
    .select('operating_hours')
    .eq('account_id', ctx.accountId)
    .maybeSingle()

  const hours = (settings?.operating_hours || {}) as Record<string, unknown>

  return {
    is_open: data === true,
    days: (hours.days as string[]) || ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    start: (hours.start as string) || '10:00',
    end: (hours.end as string) || '22:00',
    closed_days: (hours.closed_days as string[]) || ['mon'],
  }
}

const searchOfferingsHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const query = args.query as string
  const type = args.type as string

  let q = db
    .from('offerings')
    .select('id, name, type, price, currency, short_description, metadata, status')
    .eq('account_id', ctx.accountId)
    .eq('status', 'active')
    .ilike('name', `%${query}%`)

  if (type && type !== 'any') {
    q = q.eq('type', type)
  }

  const { data: offerings } = await q.limit(10)

  if (!offerings || offerings.length === 0) {
    return { offerings: [], message: `No offerings found for "${query}"` }
  }

  return {
    offerings: offerings.map((o: any) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      price: o.price,
      currency: o.currency,
      description: o.short_description,
    })),
    count: offerings.length,
  }
}

// ============================================================
// Handler map
// ============================================================

export const logisticsToolHandlers: Partial<Record<string, ToolHandler>> = {
  map_location_to_zone: mapLocationToZoneHandler,
  calculate_delivery_price: calculateDeliveryPriceHandler,
  preview_delivery_order: previewDeliveryOrderHandler,
  get_order_by_number: getOrderByNumberHandler,
  get_customer_orders: getCustomerOrdersHandler,
  get_delivery_zones: getDeliveryZonesHandler,
  check_working_hours: checkWorkingHoursHandler,
  search_offerings: searchOfferingsHandler,
}
