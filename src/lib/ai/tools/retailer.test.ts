import { describe, it, expect } from 'vitest'
import { retailerToolHandlers, retailerTools } from './retailer'
import type { ToolContext, ToolHandler } from './types'

function makeDb(initialCart: unknown[] = []) {
  const state: { cart: unknown[] } = { cart: initialCart }
  const db = {
    from: (table: string) => {
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
