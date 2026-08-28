// ============================================================
// Phone number masking utility.
// Single source of truth for all phone display.
//
// Display format: 2547****5861 (no + prefix)
// Call/copy format: +254712345678 (with + prefix)
// ============================================================

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
