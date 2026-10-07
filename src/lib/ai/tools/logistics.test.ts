import { describe, it, expect } from 'vitest'
import { logisticsToolHandlers, logisticsTools } from './logistics'
import type { ToolContext, ToolHandler } from './types'
import { LIST_ROW_TITLE_MAX, LIST_ROW_DESC_MAX } from './list-format'

type AnyRow = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

function makeDb(rows: AnyRow[]) {
  const convMeta: { metadata: Record<string, unknown> } = { metadata: {} }
  const offeringsBuilder: AnyRow = {
    select: () => offeringsBuilder,
    eq: () => offeringsBuilder,
    ilike: () => offeringsBuilder,
    order: () => offeringsBuilder,
    range: async () => ({ data: rows, error: null }),
  }
  const db = {
    from: (table: string) => {
      if (table === 'offerings') return offeringsBuilder
      if (table === 'conversations') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { ...convMeta } }) }) }),
          update: (payload: { metadata?: Record<string, unknown> }) => ({
            eq: async () => {
              if (payload.metadata) convMeta.metadata = payload.metadata
              return { error: null }
            },
          }),
        }
      }
      throw new Error(`unexpected table: ${table}`)
    },
  }
  return { db, convMeta }
}

function makeCtx(db: unknown): ToolContext {
  return {
    db,
    accountId: 'acct-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    contactPhone: null,
    contactName: null,
    businessType: 'education',
    userId: 'user-1',
  }
}

const searchOfferings = logisticsToolHandlers.search_offerings as ToolHandler

function row(overrides: AnyRow): AnyRow {
  return {
    id: `off-${Math.random().toString(36).slice(2)}`,
    name: 'Item',
    type: 'product',
    price: 1000,
    currency: 'KES',
    short_description: 'A short description',
    media: null,
    ...overrides,
  }
}

describe('search_offerings tool', () => {
  it('is registered in the logistics tool definitions (always-on tool)', () => {
    const def = logisticsTools.find((t) => t.function.name === 'search_offerings')
    expect(def).toBeDefined()
    expect(def!.function.parameters.required).toEqual(['query'])
  })

  it('returns a tappable list_section with Meta-compliant rows', async () => {
    const { db } = makeDb([row({ name: 'Classic Cotton T-Shirt With Extra Long Brand Name', price: 800 })])
    const result = (await searchOfferings({ query: 'shirt' }, makeCtx(db))) as AnyRow

    expect(result.list_section).toBeDefined()
    const rows = result.list_section.rows as Array<{ id: string; title: string; description?: string }>
    expect(rows).toHaveLength(1)
    expect(rows[0].title.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX)
    if (rows[0].description) expect(rows[0].description.length).toBeLessThanOrEqual(LIST_ROW_DESC_MAX)
    expect(rows[0].id).toMatch(/^product_add_off-.*_800$/)
  })

  it('routes null-price items to price_enquire_ (never transact at 0)', async () => {
    const { db } = makeDb([row({ name: 'Billionaire 500 WP', price: null })])
    const result = (await searchOfferings({ query: 'billionaire' }, makeCtx(db))) as AnyRow
    expect(result.list_section.rows[0].id).toMatch(/^price_enquire_/)
    expect(result.list_section.rows[0].description).toContain('Price on request')
    expect(result.list_section.rows[0].description).not.toContain('null')
  })

  it('routes typed offerings to their domain tap handlers', async () => {
    const cases: Array<[string, RegExp]> = [
      ['service', /^service_select_/],
      ['room', /^room_select_/],
      ['menu_item', /^menu_add_/],
      ['property', /^property_select_/],
      ['course', /^offering_select_/],
    ]
    for (const [type, pattern] of cases) {
      const { db } = makeDb([row({ type, id: `id-${type}` })])
      const result = (await searchOfferings({ query: 'x' }, makeCtx(db))) as AnyRow
      expect(result.list_section.rows[0].id).toMatch(pattern)
    }
  })

  it('caps rows at 10 and adds an offering_more_ button when more exist', async () => {
    const rows = Array.from({ length: 11 }, (_, i) => row({ id: `o${i}`, name: `Item ${i}` }))
    const { db, convMeta } = makeDb(rows)
    const result = (await searchOfferings({ query: 'item' }, makeCtx(db))) as AnyRow

    expect(result.list_section.rows).toHaveLength(10)
    expect(result.has_more).toBe(true)
    expect(result.buttons).toEqual([{ id: 'offering_more_10', title: 'See More →' }])
    // Search params persisted for the See More handler
    expect(convMeta.metadata.offering_search_params).toEqual({ query: 'item', type: undefined })
  })

  it('stores single-result image_url for the reply', async () => {
    const { db } = makeDb([row({ id: 'only', media: [{ url: 'https://x/img.jpg', is_primary: true }] })])
    const result = (await searchOfferings({ query: 'only' }, makeCtx(db))) as AnyRow
    expect(result.image_url).toBe('https://x/img.jpg')
  })
})
