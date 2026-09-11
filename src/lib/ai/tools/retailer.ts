// ============================================================
// Retailer / Wholesaler AI Tools — Product search, ordering
//
// Flow: AI collects info → preview_product_order
// → stores in pending table → returns buttons → user clicks
// → handler creates real record (no AI re-entry)
//
// Tools:
// - search_products: search product catalogue (paginated)
// - get_product: get single product details
// - preview_product_order: store pending order + show buttons
// - get_customer_product_orders: list customer's product orders
// ============================================================

import type { ToolDefinition, ToolHandler } from './types'

// ============================================================
// Tool Definitions
// ============================================================

export const retailerTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search the product catalogue. Returns up to 10 products per page with pagination. Use offset to load more.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (e.g. "laptop", "shoes", "bulk rice")' },
          category: { type: 'string', description: 'Filter by category (e.g. "electronics", "clothing", "food")' },
          min_price: { type: 'number', description: 'Minimum price filter' },
          max_price: { type: 'number', description: 'Maximum price filter' },
          limit: { type: 'number', description: 'Max items to return (default 10, max 10)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product',
      description: 'Get full details of a single product including description, price, stock, and images.',
      parameters: {
        type: 'object',
        properties: {
          product_id: { type: 'string', description: 'The product ID' },
        },
        required: ['product_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_product_order',
      description: 'Create a product order preview with total price. Returns formatted message with Confirm/Edit/Cancel buttons. Call this when the customer wants to buy products.',
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
                product_id: { type: 'string' },
              },
            },
            description: 'Order items with quantities and prices',
          },
          order_type: { type: 'string', enum: ['delivery', 'pickup', 'wholesale'], description: 'Order type (default delivery)' },
          delivery_address: { type: 'string', description: 'Delivery address (for delivery orders)' },
          notes: { type: 'string', description: 'Special instructions or notes' },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_product_orders',
      description: "Look up the customer's recent product orders by their phone number.",
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Customer phone number' },
        },
      },
    },
  },
]

// ============================================================
// Standalone Search Function (used by tool handler + button handler)
// ============================================================

export interface ProductSearchParams {
  query?: string
  category?: string
  min_price?: number
  max_price?: number
  limit?: number
  offset?: number
}

export interface ProductSearchResult {
  items: Array<{
    id: string
    name: string
    description: string | null
    price: number
    currency: string
    category: string | null
    stock_status: string | null
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

export async function searchProducts(
  db: any,
  accountId: string,
  params: ProductSearchParams,
): Promise<ProductSearchResult> {
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, category_id, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('account_id', accountId)
    .eq('type', 'product')
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

  // Price filter in-memory
  if (params.min_price != null) {
    filtered = filtered.filter((item: any) => item.price >= params.min_price!)
  }
  if (params.max_price != null) {
    filtered = filtered.filter((item: any) => item.price <= params.max_price!)
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
      stock_status: (meta.stock_status as string) || 'in_stock',
      image_url: primaryImage,
    }
  })

  const result: ProductSearchResult = {
    items: resultItems,
    count: filtered.length,
    has_more,
    offset,
  }

  if (has_more) {
    result.buttons = [{ id: `product_more_${nextOffset}`, title: 'See More →' }]
  }

  // Build WhatsApp list rows for clickable product list
  result.list_section = {
    title: 'Products',
    rows: resultItems.map((item: { id: string; name: string; description: string | null; price: number; currency: string }) => ({
      id: `product_add_${item.id}_${Math.round(item.price)}`,
      title: `${item.name} — ${item.currency} ${item.price}`,
      description: item.description || undefined,
    })),
  }

  return result
}

// ============================================================
// Helper: Calculate total
// ============================================================

function calculateProductTotal(items: Array<{ quantity?: number; unit_price?: number }>): number {
  return items.reduce((sum, item) => {
    return sum + (item.quantity || 1) * (item.unit_price || 0)
  }, 0)
}

// ============================================================
// Tool Handlers
// ============================================================

const searchProductsHandler: ToolHandler = async (args, ctx) => {
  const result = await searchProducts(ctx.db, ctx.accountId, {
    query: args.query as string | undefined,
    category: args.category as string | undefined,
    min_price: (args.min_price as number) || undefined,
    max_price: (args.max_price as number) || undefined,
    limit: (args.limit as number) || undefined,
    offset: (args.offset as number) || undefined,
  })

  // Store search params in conversation metadata for "More" button
  if (ctx.conversationId) {
    const searchParams: ProductSearchParams = {
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
          product_search_params: searchParams,
        },
      })
      .eq('id', ctx.conversationId)
  }

  return result
}

const getProductHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const productId = args.product_id as string

  const { data: product, error } = await db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('id', productId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'product')
    .maybeSingle()

  if (error || !product) {
    return { found: false, error: 'Product not found' }
  }

  const meta = (product.metadata || {}) as Record<string, unknown>
  const media = (product.media as any[]) || []
  const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
  const allImages = media.map((m: any) => m.url).filter(Boolean)

  return {
    found: true,
    id: product.id,
    name: product.name,
    description: product.short_description || product.description,
    price: product.price,
    currency: product.currency || 'KES',
    category: meta.category || null,
    stock_status: meta.stock_status || 'in_stock',
    sku: meta.sku || null,
    brand: meta.brand || null,
    weight: meta.weight || null,
    dimensions: meta.dimensions || null,
    image_url: primaryImage,
    image_urls: allImages,
  }
}

const previewProductOrderHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const items = (args.items as Array<{
    name: string
    quantity: number
    unit_price: number
    product_id?: string
  }>) || []

  if (items.length === 0) {
    return { success: false, error: 'No items provided' }
  }

  const total = calculateProductTotal(items)
  const itemCount = items.reduce((sum, i) => sum + (i.quantity || 1), 0)
  const orderType = (args.order_type as string) || 'delivery'
  const deliveryAddress = (args.delivery_address as string) || null

  // Default customer_name to contact name
  let customerName = ctx.contactName || null

  // Look up product image if single item
  let offeringImageUrl: string | null = null
  if (items.length === 1 && items[0].product_id) {
    const { data: offering } = await db
      .from('offerings')
      .select('id, media:offering_media(url, is_primary)')
      .eq('id', items[0].product_id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (offering) {
      const media = (offering.media as any[]) || []
      offeringImageUrl = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    }
  } else if (items.length === 1 && items[0].name) {
    const { data: offering } = await db
      .from('offerings')
      .select('id, media:offering_media(url, is_primary)')
      .eq('account_id', ctx.accountId)
      .eq('type', 'product')
      .eq('status', 'active')
      .ilike('name', `%${items[0].name}%`)
      .limit(1)
      .maybeSingle()
    if (offering) {
      const media = (offering.media as any[]) || []
      offeringImageUrl = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    }
  }

  // Store in pending_product_orders
  const { data: pending, error: pendingErr } = await db
    .from('pending_product_orders')
    .insert({
      account_id: ctx.accountId,
      contact_id: ctx.contactId,
      conversation_id: ctx.conversationId,
      user_id: ctx.userId,
      items: items.map(i => ({
        name: i.name,
        quantity: i.quantity || 1,
        unit_price: i.unit_price || 0,
        product_id: i.product_id || null,
      })),
      item_count: itemCount,
      order_type: orderType,
      delivery_address: deliveryAddress,
      notes: args.notes || null,
      customer_name: customerName,
      customer_phone: ctx.contactPhone || null,
      price: total,
      currency: 'KES',
    })
    .select('id')
    .single()

  if (pendingErr || !pending) {
    console.error('[preview_product_order] pending insert error:', pendingErr)
    return { success: false, error: 'Failed to create order preview' }
  }

  const pendingId = pending.id

  // Format items list
  const itemList = items.map(i =>
    `• ${i.quantity || 1}× ${i.name} @ KES ${i.unit_price || 0} = KES ${(i.quantity || 1) * (i.unit_price || 0)}`
  ).join('\n')

  const typeLabel = orderType === 'wholesale' ? 'Wholesale Order'
    : orderType === 'pickup' ? 'Pickup'
    : 'Delivery'

  const message =
    `🛒 *Product Order Preview*\n\n` +
    `${typeLabel}\n\n` +
    `*Items:*\n${itemList}\n\n` +
    `*Total:* KES ${total}` +
    (deliveryAddress ? `\n*Delivery Address:* ${deliveryAddress}` : '') +
    `\n\nReply *confirm* to place your order, or *edit* to make changes.`

  return {
    success: true,
    pending_order_id: pendingId,
    price: total,
    currency: 'KES',
    order_type: orderType,
    response: message,
    image_url: offeringImageUrl,
    buttons: [
      { id: `product_order_confirm_${pendingId}`, title: '✅ Confirm' },
      { id: `product_order_edit_${pendingId}`, title: '✏️ Edit' },
      { id: `product_order_cancel_${pendingId}`, title: '❌ Cancel' },
    ],
  }
}

const getCustomerProductOrdersHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const phone = (args.phone as string) || ctx.contactPhone

  if (!phone) {
    return { orders: [], count: 0, message: 'No phone number provided.' }
  }

  // Find contact by phone
  const { data: contact } = await db
    .from('contacts')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('phone', phone)
    .maybeSingle()

  if (!contact) {
    return { orders: [], count: 0, message: 'No orders found for this number.' }
  }

  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, status, total, currency, metadata, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', contact.id)
    .eq('metadata->>type', 'product_order')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!orders || orders.length === 0) {
    return { orders: [], count: 0, message: 'No recent product orders found.' }
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
        order_type: meta.order_type || 'delivery',
        created_at: o.created_at,
      }
    }),
    count: orders.length,
  }
}

// ============================================================
// Cart Helpers (stored in conversation metadata)
// ============================================================

export interface CartItem {
  name: string
  quantity: number
  unit_price: number
  product_id: string | null
}

export async function getCart(db: any, conversationId: string): Promise<CartItem[]> {
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()
  return ((conv?.metadata as Record<string, unknown>)?.cart as CartItem[]) || []
}

export async function saveCart(db: any, conversationId: string, cart: CartItem[]): Promise<void> {
  const { data: conv } = await db
    .from('conversations')
    .select('metadata')
    .eq('id', conversationId)
    .maybeSingle()

  await db
    .from('conversations')
    .update({
      metadata: { ...(conv?.metadata || {}), cart },
    })
    .eq('id', conversationId)
}

export async function addToCart(db: any, conversationId: string, item: CartItem): Promise<CartItem[]> {
  const cart = await getCart(db, conversationId)
  const existing = cart.find(c => c.product_id === item.product_id && c.name === item.name)
  if (existing) {
    existing.quantity += item.quantity
  } else {
    cart.push(item)
  }
  await saveCart(db, conversationId, cart)
  return cart
}

export async function removeFromCart(db: any, conversationId: string, productName: string): Promise<CartItem[]> {
  let cart = await getCart(db, conversationId)
  cart = cart.filter(c => !c.name.toLowerCase().includes(productName.toLowerCase()))
  await saveCart(db, conversationId, cart)
  return cart
}

export async function clearCart(db: any, conversationId: string): Promise<void> {
  await saveCart(db, conversationId, [])
}

export function formatCartSummary(cart: CartItem[]): string {
  if (cart.length === 0) return '🛒 *Your cart is empty*'
  const lines = cart.map((item, i) =>
    `${i + 1}. ${item.quantity}× ${item.name} — KES ${item.unit_price * item.quantity}`
  ).join('\n')
  const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  return `🛒 *Your Cart*\n\n${lines}\n\n💰 *Total: KES ${total}*`
}

export function getCartButtons(hasItems: boolean): Array<{ id: string; title: string }> {
  if (!hasItems) return []
  return [
    { id: 'cart_checkout', title: '✅ Checkout' },
    { id: 'cart_clear', title: '🗑️ Clear' },
    { id: 'cart_continue', title: '🛒 Add More' },
  ]
}

// ============================================================

// ============================================================
// Export Handlers
// ============================================================

export const retailerToolHandlers: Partial<Record<string, ToolHandler>> = {
  search_products: searchProductsHandler,
  get_product: getProductHandler,
  preview_product_order: previewProductOrderHandler,
  get_customer_product_orders: getCustomerProductOrdersHandler,
}
