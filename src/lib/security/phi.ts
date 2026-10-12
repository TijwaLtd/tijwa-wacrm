import crypto from 'crypto'

/**
 * PHI encryption (HIPAA carve-out).
 *
 * Health content — "reason for visit", symptoms a customer typed on the
 * secure web form, clinic notes — is the ONLY thing we encrypt at rest.
 * name/email/phone are directory data, not PHI on their own, and are
 * read by ~60 touchpoints (SQL RPCs, ILIKE search, joins) so encrypting
 * them would break search and is the wrong target.
 *
 * Format is identical to the WhatsApp token scheme (AES-256-GCM):
 *   `<iv-hex>:<ciphertext-hex>:<authTag-hex>`
 *
 * We deliberately reuse the same primitives as
 * `src/lib/whatsapp/encryption.ts` rather than importing it — that
 * module is named for tokens and carries legacy-CBC decrypt paths PHI
 * should never touch. This one is GCM-only, so any tampering or key
 * mismatch fails hard (no silent garbled plaintext).
 *
 * Key: the same ENCRYPTION_KEY env var (hex, 32 bytes). Server-side
 * only — never shipped to the client, never sent over WhatsApp.
 */

const PHI_KEY = process.env.ENCRYPTION_KEY!
const GCM_IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

/** Encrypt a health note. Returns `iv:ct:authTag` hex, or null for empty input. */
export function encryptPhi(text: string | null | undefined): string | null {
  const value = (text ?? '').trim()
  if (!value) return null
  const iv = crypto.randomBytes(GCM_IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(PHI_KEY, 'hex'), iv)
  let ct = cipher.update(value, 'utf8', 'hex')
  ct += cipher.final('hex')
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${ct}:${tag.toString('hex')}`
}

/**
 * Decrypt a health note. Throws on tampering / wrong key — callers
 * should treat a throw as "unreadable", never fall back to raw text.
 */
export function decryptPhi(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  const parts = encrypted.split(':')
  if (parts.length !== 3) {
    throw new Error('PHI ciphertext has unrecognised format (expected iv:ct:authTag)')
  }
  const [ivHex, ctHex, tagHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  if (iv.length !== GCM_IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('PHI ciphertext has unexpected IV or auth-tag length')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(PHI_KEY, 'hex'), iv)
  decipher.setAuthTag(tag)
  let pt = decipher.update(ctHex, 'hex', 'utf8')
  pt += decipher.final('utf8')
  return pt
}

/** True when the value looks like our GCM ciphertext (3 colon-separated hex parts). */
export function isPhiCiphertext(value: string | null | undefined): boolean {
  if (!value) return false
  const parts = value.split(':')
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p))
}
