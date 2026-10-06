import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetch enabled capability keys for an account.
 *
 * Returns:
 *  - `string[]` when the account has capability rows configured
 *    (possibly empty = everything disabled → generic behaviour)
 *  - `undefined` when no rows exist at all (capability state unknown →
 *    callers fall back to business-type heuristics)
 *
 * Capability-driven architecture: AI toolsets and prompt sections are
 * gated on this, not on business_type directly.
 */
export async function getEnabledCapabilityKeys(
  db: SupabaseClient,
  accountId: string,
): Promise<string[] | undefined> {
  const { data, error } = await db
    .from('account_capabilities')
    .select('capability_key, is_enabled')
    .eq('account_id', accountId);

  if (error) {
    console.error('[get-enabled-capabilities] error:', error);
    return undefined;
  }

  if (!data || data.length === 0) return undefined;

  return data
    .filter((row) => row.is_enabled)
    .map((row) => row.capability_key as string);
}
