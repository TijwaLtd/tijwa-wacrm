// ============================================================
// Phone number masking utility.
// Single source of truth for all audit-related phone display.
//
// Format: +254712345678 → +2547****5678
// Preserves enough for recognition, hides middle digits.
// ============================================================

/**
 * Mask a phone number for display in audit/reporting interfaces.
 *
 * Rules:
 * - Preserve country code / first 3-4 digits
 * - Mask middle digits with asterisks
 * - Show last 4 digits
 * - Handle edge cases: short numbers, empty, null
 *
 * Examples:
 *   +254712345678 → +2547****5678
 *   254712345678  → 2547****5678
 *   0712345678    → 0712****5678
 *   +1234567      → +123****4567
 *   123           → 123
 *   ""            → ""
 */
export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';

  // Strip spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  if (cleaned.length <= 4) return cleaned;

  // Preserve leading + if present
  const hasPlus = cleaned.startsWith('+');
  const digits = hasPlus ? cleaned.slice(1) : cleaned;

  if (digits.length <= 4) return cleaned;

  // Show first 4 digits, mask middle, show last 4
  const first4 = digits.slice(0, 4);
  const last4 = digits.slice(-4);
  const masked = '*'.repeat(Math.min(4, digits.length - 8));

  const result = hasPlus
    ? `+${first4}${masked}${last4}`
    : `${first4}${masked}${last4}`;

  return result;
}
