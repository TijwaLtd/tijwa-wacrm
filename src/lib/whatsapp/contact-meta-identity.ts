// ============================================================
// Persist Meta recipient identity onto contacts.
//
// Every Meta /messages success body includes
// `contacts: [{ input, wa_id }]`. Status webhooks carry the same id as
// `recipient_id`. Meta is moving identity away from raw phone numbers,
// so contacts must store that id:
//   - `wa_id`  — Meta's business-scoped user id (migration 050)
//   - `bsuid`  — send-target fallback when phone fails (migration 090)
//
// This helper only fills gaps (never overwrites an existing value) and
// never throws — identity backfill must not fail a message send.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Backfill `contacts.wa_id` / `contacts.bsuid` from a Meta recipient id
 * (`wa_id` on send responses, `recipient_id` on status webhooks).
 *
 * @param db      Supabase client (admin or RLS-scoped — caller's choice)
 * @param contactId  Contact row to update
 * @param metaId  Meta recipient id (wa_id / recipient_id); ignored if empty
 * @param accountId Optional tenancy guard — when set, the update is scoped
 */
export async function saveContactMetaIdentity(
  db: SupabaseClient,
  contactId: string,
  metaId: string | null | undefined,
  accountId?: string
): Promise<void> {
  const id = (metaId || '').trim();
  if (!contactId || !id) return;

  try {
    let select = db
      .from('contacts')
      .select('wa_id, bsuid')
      .eq('id', contactId);
    if (accountId) select = select.eq('account_id', accountId);
    const { data, error } = await select.maybeSingle();
    if (error || !data) return;

    const patch: Record<string, unknown> = {};
    if (!data.wa_id) patch.wa_id = id;
    if (!data.bsuid) patch.bsuid = id;
    if (Object.keys(patch).length === 0) return;

    patch.updated_at = new Date().toISOString();

    const { error: updateErr } = await db
      .from('contacts')
      .update(patch)
      .eq('id', contactId);

    if (updateErr) {
      // 23505 = another contact already owns this wa_id/bsuid — fine to skip.
      if (updateErr.code !== '23505') {
        console.warn(
          '[contact-meta-identity] update failed:',
          updateErr.message
        );
      }
    }
  } catch (err) {
    console.warn(
      '[contact-meta-identity] skipped:',
      err instanceof Error ? err.message : err
    );
  }
}
