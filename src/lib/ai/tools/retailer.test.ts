import { describe, it, expect } from 'vitest'
import { retailerToolHandlers, retailerTools, resolveCataloguePrices } from './retailer'
import type { ToolContext, ToolHandler } from './types'

interface CatalogueRow {
  id: string
  name: string
  price: number | null
  type?: string
}

function unescapeLike(pattern: string): string {
  return pattern.replace(/\\([\\%_])/g, '$1')
}

function makeDb(initialCart: unknown[] = [], catalogue: CatalogueRow[] = []) {
  const state: { cart: unknown[]; pending: Record<string, unknown> | null } = {
    cart: initialCart,
    pending: null,
  }

  const offeringsTable = () => {
    let likeName: string | null = null
    let typeWanted: string[] | null = null
    const q: {
      select: () => typeof q
      eq: () => typeof q
      in: (col: string, vals: string[]) => Promise<{ data: CatalogueRow[]; error: null }> | typeof q
      ilike: (_col: string, pattern: string) => typeof q
      limit: () => typeof q
      maybeSingle: () => Promise<{ data: CatalogueRow | null; error: null }>
    } = {
      select: () => q,
      eq: () => q,
      in: (col, vals) => {
        if (col === 'id') {
          return Promise.resolve({ data: catalogue.filter((r) => vals.includes(r.id)), error: null })
        }
        typeWanted = vals
        return q
      },
      ilike: (_col, pattern) => {
        likeName = pattern
        return q
      },
      limit: () => q,
      maybeSingle: async () => {
        if (likeName === null) return { data: null, error: null }
        const wanted = unescapeLike(likeName).toLowerCase()
        const found =
          catalogue.find(
            (r) =>
              r.name.toLowerCase() === wanted &&
              (!typeWanted || typeWanted.includes(r.type || 'product')),
          ) || null
        return { data: found, error: null }
      },
    }
    return q
  }

  const db = {
    from: (table: string) => {
      if (table === 'offerings') return offeringsTable()
      if (table === 'pending_product_orders') {
        return {
          insert: (payload: Record<string, unknown>) => {
            state.pending = payload
            return {
              select: () => ({
                single: async () => ({ data: { id: 'pend-1' }, error: null }),
              }),
            }
          },
        }
      }
      if (table !== 'conversations') {
        throw new Error(`unexpected table: ${table}`)
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { metadata: { cart: state.cart } },
            }),
          }),
        }),
        update: (payload: { metadata?: Record<string, unknown> }) => ({
          eq: async () => {
            if (payload.metadata) {
              state.cart = (payload.metadata.cart as unknown[]) || []
            }
            return { error: null }
          },
        }),
      }
    },
  }
  return { db, state }
}

function makeCtx(db: unknown): ToolContext {
  return {
    db,
    accountId: 'acct-1',
    conversationId: 'conv-1',
    contactId: 'contact-1',
    contactPhone: null,
    contactName: null,
    businessType: 'retailer',
    userId: 'user-1',
  }
}

const manageCart = retailerToolHandlers.manage_cart as ToolHandler

describe('manage_cart tool', () => {
  it('is registered in the retailer tool definitions', () => {
    const def = retailerTools.find((t) => t.function.name === 'manage_cart')
    expect(def).toBeDefined()
    expect(def!.function.parameters.required).toEqual(['action'])
  })

  it('adds an item and returns the summary', async () => {
    const { db, state } = makeDb()
    const result = (await manageCart(
      { action: 'add', item: { name: 'Laptop', quantity: 2, unit_price: 45000, product_id: 'p1' } },
      makeCtx(db),
    )) as { success: boolean; cart: unknown[]; summary: string }

    expect(result.success).toBe(true)
    expect(state.cart).toHaveLength(1)
    expect(result.summary).toContain('Laptop')
    expect(result.summary).toContain('90000')
  })

  it('reads the current cart', async () => {
    const { db } = makeDb([{ name: 'Shoes', quantity: 1, unit_price: 2000, product_id: null }])
    const result = (await manageCart({ action: 'get' }, makeCtx(db))) as {
      success: boolean
      cart: Array<{ name: string }>
      summary: string
    }
    expect(result.success).toBe(true)
    expect(result.cart).toHaveLength(1)
    expect(result.cart[0].name).toBe('Shoes')
    expect(result.summary).toContain('Shoes')
  })

  it('removes an item by name', async () => {
    const { db, state } = makeDb([
      { name: 'Laptop', quantity: 1, unit_price: 45000, product_id: 'p1' },
      { name: 'Mouse', quantity: 2, unit_price: 1500, product_id: 'p2' },
    ])
    const result = (await manageCart({ action: 'remove', name: 'laptop' }, makeCtx(db))) as {
      success: boolean
      cart: Array<{ name: string }>
    }
    expect(result.success).toBe(true)
    expect(state.cart).toHaveLength(1)
    expect(result.cart[0].name).toBe('Mouse')
  })

  it('clears the cart', async () => {
    const { db, state } = makeDb([{ name: 'Laptop', quantity: 1, unit_price: 45000, product_id: 'p1' }])
    const result = (await manageCart({ action: 'clear' }, makeCtx(db))) as {
      success: boolean
      cart: unknown[]
      summary: string
    }
    expect(result.success).toBe(true)
    expect(state.cart).toHaveLength(0)
    expect(result.summary).toContain('empty')
  })

  it('rejects add without item.name', async () => {
    const { db } = makeDb()
    const result = (await manageCart({ action: 'add', item: {} }, makeCtx(db))) as {
      success: boolean
      error: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toContain('item.name')
  })

  it('rejects remove without name', async () => {
    const { db } = makeDb()
    const result = (await manageCart({ action: 'remove' }, makeCtx(db))) as {
      success: boolean
      error: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toContain('name')
  })
})

const previewOrder = retailerToolHandlers.preview_product_order as ToolHandler

describe('resolveCataloguePrices', () => {
  it('overwrites the price by product_id with the catalogue price', async () => {
    const { db } = makeDb([], [{ id: 'p1', name: 'Laptop', price: 50000 }])
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'Lappy', quantity: 1, unit_price: 45000, product_id: 'p1' },
    ])
    expect(item.unit_price).toBe(50000)
    expect(item.name).toBe('Laptop') // canonical catalogue name wins
  })

  it('a catalogue price of 0 wins over the provided price', async () => {
    const { db } = makeDb([], [{ id: 'p1', name: 'Free Sample', price: 0 }])
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'Free Sample', quantity: 1, unit_price: 999, product_id: 'p1' },
    ])
    expect(item.unit_price).toBe(0)
  })

  it('falls back to an exact case-insensitive name match', async () => {
    const { db } = makeDb([], [{ id: 'p9', name: 'Laptop', price: 50000 }])
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'laptop', quantity: 1, unit_price: 1, product_id: null },
    ])
    expect(item.unit_price).toBe(50000)
    expect(item.product_id).toBe('p9') // backfilled from the catalogue
  })

  it('keeps the provided price for items not in the catalogue', async () => {
    const { db } = makeDb()
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'Custom engraving', quantity: 1, unit_price: 500, product_id: null },
    ])
    expect(item.unit_price).toBe(500)
  })

  it('keeps the provided price when the catalogue price is null (contact-for-price)', async () => {
    const { db } = makeDb([], [{ id: 'p1', name: 'Bulk Steel', price: null }])
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'Bulk Steel', quantity: 1, unit_price: 750, product_id: 'p1' },
    ])
    expect(item.unit_price).toBe(750)
  })

  it('escapes LIKE wildcards in names before matching', async () => {
    const { db } = makeDb([], [{ id: 'p5', name: '50% Cotton', price: 1200 }])
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: '50% Cotton', quantity: 1, unit_price: 1, product_id: null },
    ])
    expect(item.unit_price).toBe(1200)
    expect(item.product_id).toBe('p5')
  })

  it('only name-matches within the requested offering types', async () => {
    const { db } = makeDb([], [{ id: 'm1', name: 'Pilau', price: 450, type: 'menu_item' }])
    const [productScope] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'Pilau', quantity: 1, unit_price: 1, product_id: null },
    ])
    expect(productScope.unit_price).toBe(1) // default types = ['product'] → no match

    const [menuScope] = await resolveCataloguePrices(
      db,
      'acct-1',
      [{ name: 'Pilau', quantity: 1, unit_price: 1, product_id: null }],
      ['menu_item'],
    )
    expect(menuScope.unit_price).toBe(450)
  })

  it('reprices by id regardless of offering type', async () => {
    const { db } = makeDb([], [{ id: 'm1', name: 'Pilau', price: 450, type: 'menu_item' }])
    const [item] = await resolveCataloguePrices(db, 'acct-1', [
      { name: 'Wrong', quantity: 1, unit_price: 1, product_id: 'm1' },
    ])
    expect(item.unit_price).toBe(450)
    expect(item.name).toBe('Pilau')
  })
})

describe('preview_product_order pricing', () => {
  it('reprices every item from the catalogue before computing the total', async () => {
    const { db, state } = makeDb([], [
      { id: 'p1', name: 'Laptop', price: 50000 },
      { id: 'p2', name: 'Mouse', price: 1500 },
    ])
    const result = (await previewOrder(
      {
        items: [
          { name: 'Laptop', quantity: 2, unit_price: 45000, product_id: 'p1' },
          { name: 'Mouse', quantity: 1, unit_price: 9999, product_id: 'p2' },
        ],
      },
      makeCtx(db),
    )) as { success: boolean; price: number; response: string }

    expect(result.success).toBe(true)
    expect(result.price).toBe(2 * 50000 + 1500)
    expect(result.response).toContain(`KES ${2 * 50000 + 1500}`)
    expect(state.pending?.price).toBe(101500)
    const items = state.pending?.items as Array<{ unit_price: number }>
    expect(items[0].unit_price).toBe(50000)
    expect(items[1].unit_price).toBe(1500)
  })

  it('keeps the provided price for non-catalogue items', async () => {
    const { db, state } = makeDb()
    const result = (await previewOrder(
      { items: [{ name: 'Custom engraving', quantity: 1, unit_price: 500 }] },
      makeCtx(db),
    )) as { success: boolean; price: number }

    expect(result.success).toBe(true)
    expect(result.price).toBe(500)
    expect(state.pending?.price).toBe(500)
  })

  it('rejects an empty items list', async () => {
    const { db } = makeDb()
    const result = (await previewOrder({ items: [] }, makeCtx(db))) as {
      success: boolean
      error: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toContain('No items')
  })
})

describe('manage_cart add pricing', () => {
  it('stores the catalogue price, not the price passed through the model', async () => {
    const { db, state } = makeDb([], [{ id: 'p1', name: 'Laptop', price: 50000 }])
    const result = (await manageCart(
      { action: 'add', item: { name: 'Lappy', quantity: 1, unit_price: 1, product_id: 'p1' } },
      makeCtx(db),
    )) as { success: boolean; summary: string }

    expect(result.success).toBe(true)
    expect(state.cart).toHaveLength(1)
    const cart = state.cart as Array<{ name: string; unit_price: number }>
    expect(cart[0].unit_price).toBe(50000)
    expect(cart[0].name).toBe('Laptop')
    expect(result.summary).toContain('50000')
  })
})
