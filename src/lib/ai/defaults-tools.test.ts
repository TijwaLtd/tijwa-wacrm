import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './defaults'

describe('buildSystemPrompt — capability-gated tool sections', () => {
  it('includes property tool section when property_listings capability is enabled', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      businessType: null,
      capabilities: ['property_listings', 'inquiries'],
    })
    expect(prompt).toContain('TOOL CALLING — PROPERTY / REAL ESTATE')
    expect(prompt).toContain('search_properties')
    expect(prompt).toContain('preview_property_inquiry')
  })

  it('includes property section for property business type when capabilities unknown', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      businessType: 'property_real_estate',
    })
    expect(prompt).toContain('TOOL CALLING — PROPERTY / REAL ESTATE')
  })

  it('excludes property section when capability is disabled (configured account)', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      businessType: 'property_real_estate',
      capabilities: ['inquiries'],
    })
    expect(prompt).not.toContain('TOOL CALLING — PROPERTY / REAL ESTATE')
    expect(prompt).toContain('TOOL CALLING:')
  })

  it('null business type + unknown capabilities → generic section, no domain sections', () => {
    const prompt = buildSystemPrompt({ userPrompt: null, mode: 'auto_reply' })
    expect(prompt).toContain('TOOL CALLING:')
    expect(prompt).not.toContain('TOOL CALLING — DELIVERY BUSINESS')
    expect(prompt).not.toContain('TOOL CALLING — PROPERTY / REAL ESTATE')
    expect(prompt).not.toContain('TOOL CALLING — RESTAURANT')
  })

  it('empty capability list → generic section only', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      businessType: 'restaurant',
      capabilities: [],
    })
    expect(prompt).not.toContain('TOOL CALLING — RESTAURANT')
    expect(prompt).toContain('search_offerings')
  })

  it('restaurant section gated on menu capability', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      businessType: null,
      capabilities: ['menu', 'food_orders'],
    })
    expect(prompt).toContain('TOOL CALLING — RESTAURANT')
  })
})
