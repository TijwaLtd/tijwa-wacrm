import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getRecommendedCapabilityKeys,
  isValidBusinessType,
  type BusinessType,
} from '@/lib/business/capabilities';

export type SetBusinessTypeResult =
  | { ok: true; businessType: BusinessType }
  | { ok: false; error: string };

export async function setAccountBusinessType(
  db: SupabaseClient,
  accountId: string,
  businessType: string,
): Promise<SetBusinessTypeResult> {
  if (!isValidBusinessType(businessType)) {
    return { ok: false, error: 'Invalid business type' };
  }

  const { error } = await db
    .from('accounts')
    .update({ business_type: businessType, updated_at: new Date().toISOString() })
    .eq('id', accountId);

  if (error) {
    console.error('[set-account-business-type] update error:', error);
    return { ok: false, error: 'Failed to update business type' };
  }

  const recommended = getRecommendedCapabilityKeys(businessType);
  const { data: allCaps, error: capsError } = await db
    .from('business_capabilities')
    .select('key');

  if (capsError) {
    console.error('[set-account-business-type] capabilities error:', capsError);
    return { ok: true, businessType };
  }

  if (allCaps && allCaps.length > 0) {
    const upserts = allCaps.map((cap) => ({
      account_id: accountId,
      capability_key: cap.key,
      is_enabled: recommended.includes(cap.key),
    }));

    const { error: upsertError } = await db
      .from('account_capabilities')
      .upsert(upserts, { onConflict: 'account_id,capability_key' });

    if (upsertError) {
      console.error('[set-account-business-type] upsert error:', upsertError);
    }
  }

  return { ok: true, businessType };
}
