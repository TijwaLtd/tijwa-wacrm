// ============================================================
// Property AI Tools — Property search, inquiries, viewings
//
// Flow: AI collects info → preview_property_inquiry → stores in pending
// table → returns buttons → user clicks → handler creates real
// inquiry (no AI re-entry)
//
// Tools:
// - search_properties: search property listings
// - get_property: get single property details
// - preview_property_inquiry: store pending inquiry + show buttons
// - get_customer_property_inquiries: list customer's inquiries
// ============================================================

import type { ToolDefinition, ToolHandler, ToolContext } from './types'
import { createBooking, isFutureDate } from '@/lib/business/scheduling'
import { slotList, scheduleGateReady } from './scheduling'
import { buildListRow, formatPriceLabel } from './list-format'

// ============================================================
// Tool Definitions
// ============================================================

export const propertyTools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'search_properties',
      description: 'Search property listings. Returns properties with prices, location, and details.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search term (e.g. "2 bedroom", "apartment", " Kilimani")' },
          property_type: { type: 'string', description: 'Filter by type: "apartment", "house", "villa", "land", "office", "shop"' },
          listing_type: { type: 'string', description: 'Filter by: "sale", "rent", "lease"' },
          min_price: { type: 'number', description: 'Minimum price' },
          max_price: { type: 'number', description: 'Maximum price' },
          bedrooms: { type: 'number', description: 'Number of bedrooms' },
          limit: { type: 'number', description: 'Max properties to return (default 10)' },
          offset: { type: 'number', description: 'Offset for pagination (default 0)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_property',
      description: 'Get full details of a specific property including price, location, size, and features.',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'string', description: 'The property ID' },
        },
        required: ['property_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preview_property_inquiry',
      description: 'Create a property inquiry or viewing request. Returns formatted message with Confirm/Edit/Cancel buttons.',
      parameters: {
        type: 'object',
        properties: {
          property_id: { type: 'string', description: 'Property ID to inquire about' },
          customer_name: { type: 'string', description: 'Customer name' },
          inquiry_type: { type: 'string', enum: ['inquiry', 'viewing', 'offer'], description: 'Type of inquiry (default: inquiry)' },
          preferred_date: { type: 'string', description: 'Preferred viewing date (YYYY-MM-DD)' },
          preferred_time: { type: 'string', description: 'Preferred viewing time (HH:MM, 24h)' },
          budget: { type: 'number', description: 'Budget amount (if making an offer)' },
          notes: { type: 'string', description: 'Additional notes or requirements' },
        },
        required: ['property_id', 'customer_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_customer_property_inquiries',
      description: "Get the current customer's property inquiry history.",
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'contacted', 'viewed', 'closed', 'all'] },
          limit: { type: 'number', description: 'Max inquiries to return (default 5)' },
        },
      },
    },
  },
]

// ============================================================
// Standalone Search Function (used by tool handler + button handler)
// ============================================================

export interface PropertySearchParams {
  query?: string
  property_type?: string
  listing_type?: string
  min_price?: number
  max_price?: number
  bedrooms?: number
  limit?: number
  offset?: number
}

export interface PropertySearchResult {
  /** Tool-authored caption: exact match / "here are the alternatives" / empty. */
  response?: string
  properties: Array<{
    id: string
    name: string
    description: string | null
    price: number
    currency: string
    property_type: string | null
    listing_type: string | null
    bedrooms: number | null
    bathrooms: number | null
    area_sqft: number | null
    location: string | null
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

export async function searchProperties(
  db: any,
  accountId: string,
  params: PropertySearchParams,
): Promise<PropertySearchResult> {
  const minPrice = params.min_price || 0
  const maxPrice = params.max_price || Infinity
  const limit = Math.min(params.limit || 10, 10)
  const offset = params.offset || 0

  let q = db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('account_id', accountId)
    .eq('type', 'property')
    .eq('status', 'active')

  if (params.query) {
    q = q.or(`name.ilike.%${params.query}%,short_description.ilike.%${params.query}%,description.ilike.%${params.query}%`)
  }

  const { data: properties, error } = await q
    .order('price', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    return { properties: [], count: 0, has_more: false, offset }
  }

  // Filter by price, property type, listing type, bedrooms client-side
  let filtered = (properties || []).filter((p: any) => {
    const price = p.price || 0
    if (price < minPrice || price > maxPrice) return false

    const meta = (p.metadata || {}) as Record<string, unknown>

    if (params.property_type) {
      const propType = (meta.property_type as string)?.toLowerCase() || ''
      if (!propType.includes(params.property_type.toLowerCase())) return false
    }

    if (params.listing_type) {
      const listType = (meta.listing_type as string)?.toLowerCase() || ''
      if (!listType.includes(params.listing_type.toLowerCase())) return false
    }

    if (params.bedrooms) {
      const beds = (meta.bedrooms as number) || 0
      if (beds !== params.bedrooms) return false
    }

    return true
  })

  // ── Specific request handling ─────────────────────────────
  // If the customer named something specific and it exists, send only
  // that — no page of near-matches. If nothing matched, never answer
  // with an empty list: fall back to the closest matches so the reply
  // can open with "here are the alternatives".
  if (params.query && filtered.length > 0) {
    const term = params.query.trim().toLowerCase()
    const exact = filtered.filter((item: { name?: string | null }) => String(item.name || '').trim().toLowerCase() === term)
    if (exact.length > 0) filtered = exact
  }

  let alternatives = false
  if (filtered.length === 0 && params.query) {
    const tokens = params.query.trim().split(/\s+/).filter(Boolean).slice(0, 4)
    if (tokens.length > 0) {
      const { data: altRows } = await db
        .from('offerings')
        .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
        .eq('account_id', accountId)
        .eq('type', 'property')
        .eq('status', 'active')
        .or(tokens.map((token) => `name.ilike.%${token}%`).join(','))
        .order('price')
        .limit(limit)
      filtered = altRows || []
      alternatives = filtered.length > 0
    }
  }

  const resultItems = filtered.map((p: any) => {
    const meta = (p.metadata || {}) as Record<string, unknown>
    const media = (p.media as any[]) || []
    const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
    const location = (meta.location as Record<string, unknown>) || {}
    return {
      id: p.id,
      name: p.name,
      description: p.short_description || p.description,
      price: p.price,
      currency: p.currency || 'KES',
      property_type: (meta.property_type as string) || null,
      listing_type: (meta.listing_type as string) || null,
      bedrooms: (meta.bedrooms as number) || null,
      bathrooms: (meta.bathrooms as number) || null,
      area_sqft: (meta.area_sqft as number) || null,
      location: location.area || location.address || null,
      image_url: primaryImage,
    }
  })

  const has_more = filtered.length === limit
  const nextOffset = offset + limit

  const result: PropertySearchResult = {
    properties: resultItems,
    count: filtered.length,
    has_more,
    offset,
  }

  if (has_more) {
    result.buttons = [{ id: `property_more_${nextOffset}`, title: 'See More →' }]
  }

  // Build WhatsApp list rows for clickable property list.
  // Row title ≤24 chars (name only), price/beds/area in description (≤72).
  result.list_section = {
    title: 'Properties',
    rows: resultItems.map((item: { id: string; name: string; price: number | null; currency: string; bedrooms: number | null; listing_type: string | null; location: string | null }) => buildListRow(
      `property_select_${item.id}_${Math.round(item.price ?? 0)}`,
      item.name,
      [
        formatPriceLabel(item.currency, item.price),
        item.listing_type,
        item.bedrooms ? `${item.bedrooms} bed` : null,
        item.location,
      ],
    )),
  }

  if (alternatives) {
    result.response = `Here are the alternatives — nothing matched "${params.query}" exactly:`
  } else if (params.query && resultItems.length === 0) {
    result.response = `We don't have any listing matching "${params.query}" yet.`
  } else if (params.query && resultItems.length === 1) {
    result.response = `Here it is:`
  }

  return result
}

// ============================================================
// Tool Handlers
// ============================================================

const searchPropertiesHandler: ToolHandler = async (args, ctx) => {
  const result = await searchProperties(ctx.db, ctx.accountId, {
    query: args.query as string | undefined,
    property_type: args.property_type as string | undefined,
    listing_type: args.listing_type as string | undefined,
    min_price: (args.min_price as number) || undefined,
    max_price: (args.max_price as number) || undefined,
    bedrooms: (args.bedrooms as number) || undefined,
    limit: (args.limit as number) || undefined,
    offset: (args.offset as number) || undefined,
  })

  // Store search params in conversation metadata for "More" button
  if (ctx.conversationId) {
    const searchParams: PropertySearchParams = {
      query: args.query as string | undefined,
      property_type: args.property_type as string | undefined,
      listing_type: args.listing_type as string | undefined,
      min_price: (args.min_price as number) || undefined,
      max_price: (args.max_price as number) || undefined,
      bedrooms: (args.bedrooms as number) || undefined,
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
          property_search_params: searchParams,
        },
      })
      .eq('id', ctx.conversationId)
  }

  return result
}

const getPropertyHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const propertyId = args.property_id as string

  const { data: property, error } = await db
    .from('offerings')
    .select('id, name, slug, short_description, description, price, currency, metadata, media:offering_media(url, alt_text, sort_order, is_primary)')
    .eq('id', propertyId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'property')
    .maybeSingle()

  if (error || !property) {
    return { found: false, error: 'Property not found' }
  }

  const meta = (property.metadata || {}) as Record<string, unknown>
  const location = (meta.location as Record<string, unknown>) || {}
  const features = (meta.features as string[]) || []
  const policies = (meta.policies as Record<string, unknown>) || {}
  const media = (property.media as any[]) || []
  const primaryImage = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null
  const allImages = media.map((m: any) => m.url).filter(Boolean)

  return {
    found: true,
    id: property.id,
    name: property.name,
    description: property.short_description || property.description,
    price: property.price,
    currency: property.currency || 'KES',
    property_type: meta.property_type || null,
    listing_type: meta.listing_type || null,
    bedrooms: meta.bedrooms || null,
    bathrooms: meta.bathrooms || null,
    area_sqft: meta.area_sqft || null,
    area: meta.area || null,
    location: location.area || location.address || null,
    features,
    parking: meta.parking || null,
    furnished: meta.furnished || null,
    available_from: meta.available_from || null,
    viewings_allowed: policies.viewings !== false,
    image_url: primaryImage,
    image_urls: allImages,
  }
}

const previewPropertyInquiryHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx

  const propertyId = args.property_id as string
  const customerName = (args.customer_name as string) || ctx.contactName || 'Customer'
  const inquiryType = (args.inquiry_type as string) || 'inquiry'
  const preferredDate = (args.preferred_date as string) || null
  const preferredTime = (args.preferred_time as string) || null
  const budget = (args.budget as number) || null
  const notes = (args.notes as string) || null

  // Viewings need a future date/time — answer with the slot list,
  // never an open question and never a past date.
  if (inquiryType === 'viewing' && (!preferredDate || !isFutureDate(preferredDate))) {
    return {
      success: true,
      ...slotList('times'),
      response: preferredDate
        ? 'That date has passed — here are upcoming viewing times:'
        : 'When would you like to view it? Pick a time below, or reply with a date like "15 Oct":',
    }
  }

  // Look up property details
  const { data: property } = await db
    .from('offerings')
    .select('id, name, price, currency, metadata, media:offering_media(url, is_primary)')
    .eq('id', propertyId)
    .eq('account_id', ctx.accountId)
    .eq('type', 'property')
    .maybeSingle()

  if (!property) {
    return { success: false, error: 'Property not found' }
  }

  const media = (property.media as any[]) || []
  const propertyImageUrl = media.find((m: any) => m.is_primary)?.url || media[0]?.url || null

  if (!(await scheduleGateReady(ctx))) {
    return {
      success: false,
      gated: true,
      response: 'I just sent you a quick step to complete — reply here once it is done and I will finish this.',
    }
  }

  // Book now — the old Confirm button did exactly this insert.
  const { ok, bookingNumber, error } = await createBooking({
    db,
    accountId: ctx.accountId,
    contactId: ctx.contactId,
    start: preferredDate,
    offeringId: propertyId,
    guests: 1,
    total: budget || 0,
    currency: property.currency || 'KES',
    notes,
    fallbackPrefix: 'INQ',
    metadata: {
      type: 'property_inquiry',
      inquiry_type: inquiryType,
      property_name: property.name,
      offering_name: property.name,
      customer_name: customerName,
      customer_phone: ctx.contactPhone,
      preferred_date: preferredDate,
      preferred_time: preferredTime,
      budget,
    },
  })

  if (!ok || !bookingNumber) {
    return { success: false, error: error || 'Failed to create inquiry' }
  }

  const typeLabel = inquiryType === 'viewing' ? '\u{1F3E1} Viewing scheduled' :
    inquiryType === 'offer' ? '\u{1F4B0} Offer submitted' : '\u{1F4CB} Inquiry submitted'

  return {
    success: true,
    booking_number: bookingNumber,
    response:
      `${typeLabel}!\n\n` +
      `*Property:* ${property.name}\n` +
      `*Reference:* ${bookingNumber}\n` +
      (preferredDate ? `*Date:* ${preferredDate}` : '') +
      (preferredTime ? ` at ${preferredTime}` : '') +
      (preferredDate ? '\n' : '') +
      (budget && inquiryType === 'offer' ? `*Offer:* ${property.currency || 'KES'} ${budget}\n` : '') +
      (inquiryType === 'viewing'
        ? `\nReply with a new date any time to change it.`
        : `\nOur team will contact you shortly.`),
    image_url: propertyImageUrl,
  }
}

const getCustomerPropertyInquiriesHandler: ToolHandler = async (args, ctx) => {
  const { db } = ctx
  const status = args.status as string
  const limit = (args.limit as number) || 5

  let query = db
    .from('bookings')
    .select('id, booking_number, status, total, currency, start_date, notes, metadata, created_at')
    .eq('account_id', ctx.accountId)
    .eq('contact_id', ctx.contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data: inquiries } = await query

  if (!inquiries || inquiries.length === 0) {
    return { inquiries: [], count: 0, message: 'No property inquiries found' }
  }

  return {
    inquiries: inquiries.map((b: any) => {
      const meta = (b.metadata || {}) as Record<string, unknown>
      return {
        inquiry_number: b.booking_number,
        status: b.status,
        property: meta.property_name || meta.offering_name || null,
        type: meta.inquiry_type || 'inquiry',
        date: b.start_date,
        created_at: b.created_at,
      }
    }),
    count: inquiries.length,
  }
}

// ============================================================
// Export Handlers
// ============================================================

export const propertyToolHandlers: Partial<Record<string, ToolHandler>> = {
  search_properties: searchPropertiesHandler,
  get_property: getPropertyHandler,
  preview_property_inquiry: previewPropertyInquiryHandler,
  get_customer_property_inquiries: getCustomerPropertyInquiriesHandler,
}
