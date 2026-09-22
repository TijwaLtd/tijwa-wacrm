// ============================================================
// Phone number masking utility.
// Single source of truth for all phone display.
//
// Display format: 2547****5861 (no + prefix)
// Call/copy format: +254712345678 (with + prefix)
// ============================================================

/**
 * True when the stored phone is not a real number — empty or the
 * `bsuid_<id>` placeholder the webhook writes when Meta sends a
 * username-only user (no phone/wa_id).
 */
export function isPlaceholderPhone(phone: string | null | undefined): boolean {
  return !phone || phone.startsWith('bsuid_');
}

/**
 * Friendly label for a contact with no real phone number.
 * Used as display name / phone cell fallback so the raw
 * `bsuid_…` placeholder never appears in the UI.
 */
export const NO_PHONE_LABEL = 'WhatsApp user';

/**
 * Display a contact phone for the UI. Placeholders never render
 * as a phone number; real numbers are masked unless revealed.
 */
export function displayContactPhone(
  phone: string | null | undefined,
  revealed = false
): string {
  if (isPlaceholderPhone(phone)) return NO_PHONE_LABEL;
  return revealed ? (phone as string) : maskPhoneNumber(phone);
}

/**
 * Display a contact name, falling back sensibly when the webhook
 * stored the `bsuid_…` placeholder as the name too.
 */
export function displayContactName(
  name: string | null | undefined,
  phone: string | null | undefined,
  fallback = 'Unnamed'
): string {
  if (name && !name.startsWith('bsuid_')) return name;
  if (!isPlaceholderPhone(phone)) return maskPhoneNumber(phone);
  return fallback;
}

/**
 * Mask a phone number for UI display.
 * Always strips the + prefix. Shows first 4 + last 4 digits.
 *
 * Examples:
 *   +254712345678 → 2547****5678
 *   254712345678  → 2547****5678
 *   0712345678    → 0712****5678
 *   +1234567      → 123****4567
 *   123           → 123
 *   ""            → ""
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  if (phone.startsWith('bsuid_')) return NO_PHONE_LABEL;

  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.length <= 4) return cleaned;

  // Strip leading + for display
  const digits = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

  if (digits.length <= 4) return digits;

  const first4 = digits.slice(0, 4);
  const last4 = digits.slice(-4);
  const masked = '*'.repeat(Math.min(4, digits.length - 8));

  return `${first4}${masked}${last4}`;
}

/**
 * Get full phone number with + prefix for call and copy actions.
 * Ensures the number starts with + for tel: links and clipboard.
 *
 * Examples:
 *   +254712345678 → +254712345678
 *   254712345678  → +254712345678
 *   0712345678    → +0712345678
 */
export function getFullPhone(phone: string | null | undefined): string {
  if (!phone) return '';

  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.startsWith('+')) return cleaned;

  return `+${cleaned}`;
}

/**
 * Get phone digits only (no +, no spaces) for WhatsApp links.
 */
export function getPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}
