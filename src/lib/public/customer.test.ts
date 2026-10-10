import { describe, it, expect } from 'vitest'
import {
  SLUG_RE,
  UUID_RE,
  appOrigin,
  contactFormUrl,
  legalUrls,
  isValidEmail,
  CONSENT_VERSION,
} from './customer'

describe('public customer helpers', () => {
  it('validates slugs strictly (lowercase, short)', () => {
    expect(SLUG_RE.test('tijwah')).toBe(true)
    expect(SLUG_RE.test('acme-resto')).toBe(true)
    expect(SLUG_RE.test('Tijwah')).toBe(false) // uppercase
    expect(SLUG_RE.test('a')).toBe(false) // too short
    expect(SLUG_RE.test('a'.repeat(65))).toBe(false) // too long
    expect(SLUG_RE.test('evil/../etc')).toBe(false) // path traversal
    expect(SLUG_RE.test('')).toBe(false)
  })

  it('validates contact ids as UUIDs', () => {
    expect(UUID_RE.test('31b2c17c-2e19-4d94-8150-eae2f3401358')).toBe(true)
    expect(UUID_RE.test('31b2c17c-2e19-4d94-8150-eae2f3401358x')).toBe(false)
    expect(UUID_RE.test('not-a-uuid')).toBe(false)
    expect(UUID_RE.test('')).toBe(false)
  })

  it('builds tenant-scoped URLs without opaque tokens', () => {
    const origin = appOrigin().replace(/\/+$/, '')
    expect(contactFormUrl('tijwah', '31b2c17c-2e19-4d94-8150-eae2f3401358')).toBe(
      `${origin}/tijwah/c/31b2c17c-2e19-4d94-8150-eae2f3401358`,
    )
    expect(legalUrls('tijwah')).toEqual({
      terms: `${origin}/tijwah/legal/terms`,
      privacy: `${origin}/tijwah/legal/privacy`,
      platform: `${origin}/tijwah/legal/platform`,
    })
  })

  it('strips trailing slashes from the app origin', () => {
    expect(appOrigin().endsWith('/')).toBe(false)
  })

  it('validates emails', () => {
    expect(isValidEmail('jane@example.com')).toBe(true)
    expect(isValidEmail('jane+tag@sub.example.co.ke')).toBe(true)
    expect(isValidEmail('jane@example')).toBe(false)
    expect(isValidEmail('jane @example.com')).toBe(false)
    expect(isValidEmail('')).toBe(false)
  })

  it('pins the consent version recorded on Accept', () => {
    expect(CONSENT_VERSION).toBe('ke-eu-v1')
  })
})
