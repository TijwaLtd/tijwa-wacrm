import { describe, it, expect, beforeAll } from 'vitest'

// The PHI helper reads ENCRYPTION_KEY at import time. Provide a valid
// 32-byte hex key before importing so decrypt round-trips work.
beforeAll(() => {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64)
})

const { encryptPhi, decryptPhi, isPhiCiphertext } = await import('./phi')

describe('PHI encryption (AES-256-GCM)', () => {
  it('round-trips a health note', () => {
    const note = 'Patient reports persistent chest pain for 3 days.'
    const enc = encryptPhi(note)
    expect(enc).toBeTruthy()
    expect(isPhiCiphertext(enc)).toBe(true)
    expect(decryptPhi(enc)).toBe(note)
  })

  it('produces different ciphertext each time (fresh IV)', () => {
    const note = 'Same note, different ciphertext.'
    expect(encryptPhi(note)).not.toBe(encryptPhi(note))
  })

  it('returns null for empty / null / whitespace input', () => {
    expect(encryptPhi('')).toBeNull()
    expect(encryptPhi(null)).toBeNull()
    expect(encryptPhi(undefined)).toBeNull()
    expect(encryptPhi('   ')).toBeNull()
  })

  it('never leaks the plaintext into the ciphertext', () => {
    const note = 'symptom: nausea and dizziness'
    const enc = encryptPhi(note)!
    expect(enc).not.toContain('nausea')
    expect(enc).not.toContain('symptom')
  })

  it('throws when ciphertext is tampered with', () => {
    const enc = encryptPhi('sensitive clinical note')!
    const [iv, ct, tag] = enc.split(':')
    // Flip a hex digit in the ciphertext body
    const flipped = (ct[0] === 'a' ? 'b' : 'a') + ct.slice(1)
    const tampered = `${iv}:${flipped}:${tag}`
    expect(() => decryptPhi(tampered)).toThrow()
  })

  it('rejects malformed ciphertext format', () => {
    expect(() => decryptPhi('not-encrypted')).toThrow()
    expect(() => decryptPhi('aa:bb')).toThrow()
  })

  it('detects ciphertext shape', () => {
    expect(isPhiCiphertext(encryptPhi('x'))).toBe(true)
    expect(isPhiCiphertext('plain text')).toBe(false)
    expect(isPhiCiphertext('')).toBe(false)
    expect(isPhiCiphertext(null)).toBe(false)
  })
})
