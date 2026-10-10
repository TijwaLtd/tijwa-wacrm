import { describe, it, expect } from 'vitest'
import {
  generateTrackingId,
  isValidTrackingId,
  TRACKING_ID_PREFIX,
} from './tracking-id'

describe('support tracking id', () => {
  it('generates ids in the TCK-XXXXXX format', () => {
    const id = generateTrackingId()
    expect(id.startsWith(TRACKING_ID_PREFIX)).toBe(true)
    expect(id).toMatch(/^TCK-[0-9A-HJKMNP-TV-Z]{6}$/)
    expect(isValidTrackingId(id)).toBe(true)
  })

  it('never emits the ambiguous Crockford characters I, L, O, U', () => {
    for (let i = 0; i < 200; i++) {
      const body = generateTrackingId().slice(TRACKING_ID_PREFIX.length)
      expect(body).not.toMatch(/[ILOU]/)
    }
  })

  it('accepts valid ids case-insensitively with surrounding space', () => {
    expect(isValidTrackingId('tck-abcd23')).toBe(true)
    expect(isValidTrackingId('TCK-abc234')).toBe(true)
    expect(isValidTrackingId('  TCK-ABCD23  ')).toBe(true)
  })

  it('rejects malformed ids', () => {
    expect(isValidTrackingId('')).toBe(false)
    expect(isValidTrackingId('TCK-')).toBe(false)
    expect(isValidTrackingId('TCK-ABCDE')).toBe(false) // too short
    expect(isValidTrackingId('TCK-ABCDEFG')).toBe(false) // too long
    expect(isValidTrackingId('ORD-ABCDE')).toBe(false) // wrong prefix
    expect(isValidTrackingId('TCK-ABC-I23')).toBe(false) // invalid char I
    expect(isValidTrackingId('TCK-ABC2U')).toBe(false) // invalid char U
  })

  it('produces distinct ids across many draws', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) seen.add(generateTrackingId())
    expect(seen.size).toBe(500)
  })
})
