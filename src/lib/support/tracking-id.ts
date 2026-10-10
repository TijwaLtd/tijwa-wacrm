// ============================================================
// Human-friendly support tracking ids: TCK-XXXXXX.
//
// Six Crockford-base32 characters (no I/L/O/U) from the crypto
// RNG — ~30 bits of entropy, unguessable, and unlike the sequential
// ORD-/BK- product numbers they don't leak global volume. Collision
// odds are negligible, but create() retries a few times so a
// UNIQUE clash can never surface to the user as an error.
// ============================================================

// Crockford base32 alphabet (excludes I, L, O, U to avoid
// transcription mistakes when users read the id aloud or retype it).
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ID_LENGTH = 6;

export const TRACKING_ID_PREFIX = 'TCK-';

/** Format: TCK-XXXXXX where X is a Crockford base32 character. */
const TRACKING_ID_RE = /^TCK-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{6}$/;

export function isValidTrackingId(value: string): boolean {
  return TRACKING_ID_RE.test(value.trim().toUpperCase());
}

/** Generate a single random tracking id (no DB check). */
export function generateTrackingId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    // Modulo bias over a 32-char alphabet from 0-255 is negligible
    // for a 6-char id; mask to 5 bits for a uniform draw anyway.
    out += ALPHABET[bytes[i] & 0x1f];
  }
  return `${TRACKING_ID_PREFIX}${out}`;
}
