// ============================================================
// Staff gating for the support console (/support/admin).
//
// Tijwa staff are simply app users whose email appears in the
// SUPPORT_STAFF_EMAILS env var (comma-separated, case-insensitive).
// Chosen over an is_staff DB column: zero migration, changeable via
// Vercel env without a redeploy of schema, and the allowlist lives
// where the rest of the deployment config lives.
//
// Staff access is enforced ONLY in API routes (src/app/api/support/**):
// after this check passes, routes use the service-role client to read
// every account's tickets — RLS itself knows nothing about staff.
// ============================================================

import type { AccountContext } from '@/lib/auth/account';

/**
 * Resolve the caller's email and check it against the allowlist.
 * Uses the service role to read profiles (the session client is
 * RLS-scoped and may not expose the row depending on policies).
 */
export async function isSupportStaff(ctx: AccountContext): Promise<boolean> {
  const allowlist = (process.env.SUPPORT_STAFF_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) return false;

  const { data: profile } = await ctx.serviceClient
    .from('profiles')
    .select('email')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  const email = profile?.email?.toLowerCase();
  return Boolean(email && allowlist.includes(email));
}
