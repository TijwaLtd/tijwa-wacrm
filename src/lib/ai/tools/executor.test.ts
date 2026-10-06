import { describe, it, expect } from 'vitest'
import { getToolsForBusinessType } from './executor'

function toolNames(businessType: string | null, capabilities?: string[] | null): string[] {
  return getToolsForBusinessType(businessType, capabilities).map(
    (t) => t.definition.function.name,
  )
}

describe('getToolsForBusinessType — capability-driven gating', () => {
  it('loads property tools for property_real_estate (business-type fallback)', () => {
    const names = toolNames('property_real_estate')
    expect(names).toContain('search_properties')
    expect(names).toContain('preview_property_inquiry')
    expect(names).toContain('get_property')
    expect(names).toContain('get_customer_property_inquiries')
  })

  it('loads property tools when property_listings capability is enabled (even with no business type)', () => {
    const names = toolNames(null, ['property_listings', 'inquiries'])
    expect(names).toContain('search_properties')
    expect(names).toContain('preview_property_inquiry')
  })

  it('does NOT load property tools when property_listings is disabled (configured account)', () => {
    const names = toolNames('property_real_estate', ['inquiries'])
    expect(names).not.toContain('search_properties')
    expect(names).not.toContain('preview_property_inquiry')
  })

  it('null business type + unknown capabilities → only the generic search tool', () => {
    const names = toolNames(null)
    expect(names).toEqual(['search_offerings'])
  })

  it('empty capability list (all disabled) → only the generic search tool', () => {
    const names = toolNames('restaurant', [])
    expect(names).toEqual(['search_offerings'])
  })

  it('restaurant tools gated on menu capability', () => {
    expect(toolNames(null, ['menu'])).toContain('search_menu_items')
    expect(toolNames('restaurant', ['food_orders'])).toContain('search_menu_items')
    expect(toolNames('restaurant', ['inquiries'])).not.toContain('search_menu_items')
  })

  it('logistics tools gated on delivery capability', () => {
    expect(toolNames(null, ['delivery'])).toContain('calculate_delivery_price')
    expect(toolNames('courier', ['product_catalog'])).not.toContain(
      'calculate_delivery_price',
    )
  })

  it('always includes search_offerings regardless of gating', () => {
    expect(toolNames(null)).toContain('search_offerings')
    expect(toolNames('property_real_estate', [])).toContain('search_offerings')
    expect(toolNames(null, ['property_listings'])).toContain('search_offerings')
  })

  it('is deterministic across repeated calls (registry cache)', () => {
    const first = toolNames('property_real_estate')
    const second = toolNames('property_real_estate')
    expect(first).toEqual(second)
  })

  it('retailer tools (incl. manage_cart) load via business-type fallback', () => {
    const names = toolNames('retailer')
    expect(names).toContain('search_products')
    expect(names).toContain('get_product')
    expect(names).toContain('preview_product_order')
    expect(names).toContain('manage_cart')
  })

  it('retailer tools gated on products capability', () => {
    expect(toolNames(null, ['products', 'orders'])).toContain('manage_cart')
    expect(toolNames('retailer', ['products'])).toContain('manage_cart')
    expect(toolNames('retailer', ['inquiries'])).not.toContain('manage_cart')
    expect(toolNames(null, ['inquiries'])).not.toContain('search_products')
  })
})
