import { describe, it, expect } from 'vitest'
import { restaurantToolHandlers } from './restaurant'
import type { ToolContext, ToolHandler } from './types'

interface CatalogueRow {
  id: string
  name: string
  price: number | null
  type?: string
}

function makeDb(catalogue: CatalogueRow[] = []) {
  const state: { pending: Record<string, unknown> | null } = { pending: null }

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
        const wanted = likeName.replace(/\\([\\%_])/g, '$1').toLowerCase()
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
      if (table === 'pending_food_orders') {
        return {
          insert: (payload: Record<string, unknown>) => {
            state.pending = payload
            return {
              select: () => ({
                single: async () => ({ data: { id: 'fp-1' }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table: ${table}`)
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
    businessType: 'restaurant',
    userId: 'user-1',
  }
}

const previewFoodOrder = restaurantToolHandlers.preview_food_order as ToolHandler

describe('preview_food_order pricing', () => {
  it('reprices items from the menu before computing the total', async () => {
    const { db, state } = makeDb([
      { id: 'm1', name: 'Pilau', price: 450, type: 'menu_item' },
      { id: 'm2', name: 'Soda', price: 60, type: 'product' },
    ])
    const result = (await previewFoodOrder(
      {
        items: [
          { name: 'Pilau', quantity: 2, unit_price: 900, special_instructions: 'extra hot' },
          { name: 'Soda', quantity: 3, unit_price: 100 },
        ],
        order_type: 'takeaway',
      },
      makeCtx(db),
    )) as { success: boolean; price: number; response: string }

    expect(result.success).toBe(true)
    expect(result.price).toBe(2 * 450 + 3 * 60) // 1080, not the echoed 2100
    expect(result.response).toContain('KES 1080')
    expect(state.pending?.price).toBe(1080)
    const items = state.pending?.items as Array<{ unit_price: number; special_instructions: string | null }>
    expect(items[0].unit_price).toBe(450)
    expect(items[0].special_instructions).toBe('extra hot')
    expect(items[1].unit_price).toBe(60)
  })

  it('keeps the provided price for non-catalogue items', async () => {
    const { db, state } = makeDb()
    const result = (await previewFoodOrder(
      { items: [{ name: "Chef's special", quantity: 1, unit_price: 700 }] },
      makeCtx(db),
    )) as { success: boolean; price: number }

    expect(result.success).toBe(true)
    expect(result.price).toBe(700)
    expect(state.pending?.price).toBe(700)
  })

  it('rejects an empty items list', async () => {
    const { db } = makeDb()
    const result = (await previewFoodOrder({ items: [] }, makeCtx(db))) as {
      success: boolean
      error: string
    }
    expect(result.success).toBe(false)
    expect(result.error).toContain('No items')
  })
})
