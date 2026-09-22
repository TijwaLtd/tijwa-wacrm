import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { saveContactMetaIdentity } from './contact-meta-identity';

function makeDb(opts: {
  row?: { wa_id: string | null; bsuid: string | null } | null;
  updateError?: { code?: string; message?: string } | null;
}) {
  const updates: Record<string, unknown>[] = [];
  const db = {
    from(table: string) {
      if (table !== 'contacts') throw new Error(`unexpected table: ${table}`);
      const state = {
        filters: [] as [string, unknown][],
        mode: 'select' as 'select' | 'update',
        patch: null as Record<string, unknown> | null,
      };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          state.filters.push([col, val]);
          return builder;
        },
        update: (patch: Record<string, unknown>) => {
          state.mode = 'update';
          state.patch = patch;
          return builder;
        },
        maybeSingle: async () => ({
          data: opts.row === undefined ? { wa_id: null, bsuid: null } : opts.row,
          error: null,
        }),
        then: (
          resolve: (v: { data: null; error: unknown }) => void
        ) => {
          if (state.mode === 'update' && state.patch) {
            updates.push(state.patch);
          }
          resolve({ data: null, error: opts.updateError ?? null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  return { db, updates };
}

describe('saveContactMetaIdentity', () => {
  it('no-ops without a contact id or meta id', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, updates } = makeDb({});
    await saveContactMetaIdentity(db, '', '123');
    await saveContactMetaIdentity(db, 'c1', '');
    await saveContactMetaIdentity(db, 'c1', null);
    await saveContactMetaIdentity(db, 'c1', undefined);
    expect(updates).toHaveLength(0);
    warn.mockRestore();
  });

  it('backfills both wa_id and bsuid when they are null', async () => {
    const { db, updates } = makeDb({ row: { wa_id: null, bsuid: null } });
    await saveContactMetaIdentity(db, 'c1', '14155550123', 'acc-1');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      wa_id: '14155550123',
      bsuid: '14155550123',
    });
    expect(updates[0].updated_at).toBeTruthy();
  });

  it('only fills the missing field when wa_id already exists', async () => {
    const { db, updates } = makeDb({
      row: { wa_id: '14155550123', bsuid: null },
    });
    await saveContactMetaIdentity(db, 'c1', '14155550123');
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty('wa_id');
    expect(updates[0]).toMatchObject({ bsuid: '14155550123' });
  });

  it('skips when both fields are already populated', async () => {
    const { db, updates } = makeDb({
      row: { wa_id: '14155550123', bsuid: 'user-9' },
    });
    await saveContactMetaIdentity(db, 'c1', '14155550999');
    expect(updates).toHaveLength(0);
  });

  it('never throws on unique violations (another contact owns the id)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = makeDb({
      row: { wa_id: null, bsuid: null },
      updateError: { code: '23505', message: 'duplicate key' },
    });
    await expect(
      saveContactMetaIdentity(db, 'c1', '14155550123')
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('never throws when the contact row is missing', async () => {
    const { db, updates } = makeDb({ row: null });
    await expect(
      saveContactMetaIdentity(db, 'c-missing', '14155550123')
    ).resolves.toBeUndefined();
    expect(updates).toHaveLength(0);
  });
});
