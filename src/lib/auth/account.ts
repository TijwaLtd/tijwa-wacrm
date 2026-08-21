// ============================================================
// Server-side account context — for API routes and server
// components. Reads the caller's membership + account in one round
// trip and verifies role on demand.
//
// IMPORTANT: this module is server-only. It imports the Supabase
// SSR client (`@/lib/supabase/server`), which reads `next/headers`
// cookies. Importing it from a client component will fail at
// build time with the standard Next.js "You're importing a
// component that needs `next/headers`" error — that's the
// boundary check; we don't need the `server-only` package.
//
// M:N TENANCY MODEL:
//   - profiles table is NOT used for tenancy (post-047 migration)
//   - account_memberships is the SOLE source of truth for:
//     - which accounts a user belongs to
//     - what role they have in each account
//   - wacrm_active_account cookie determines active account
//
// Calling convention
// ------------------
// API routes don't need to redo `supabase.auth.getUser()` — they
// receive a fully-loaded context from `requireRole`:
//
//   try {
//     const ctx = await requireRole("admin");
//     // ctx.supabase — the SSR client (RLS scoped to this user)
//     // ctx.userId  — auth.uid()
//     // ctx.accountId / ctx.role / ctx.account
//   } catch (err) {
//     return errorResponse(err); // see toErrorResponse() below
//   }
// ============================================================

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { hasMinRole, isAccountRole, type AccountRole } from "./roles";

const ACTIVE_ACCOUNT_COOKIE = "wacrm_active_account";

// ------------------------------------------------------------
// Errors
//
// Custom classes so API routes can map a single `catch` to the
// right HTTP status without sprinkling 401/403 strings everywhere.
// ------------------------------------------------------------

export class UnauthorizedError extends Error {
  readonly status = 401 as const;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403 as const;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/**
 * Convert one of the typed errors above (or anything else) into a
 * `NextResponse`. Routes can do:
 *
 *   } catch (err) {
 *     return toErrorResponse(err);
 *   }
 *
 * Unknown errors collapse to 500 with the generic message — we
 * never leak `err.message` for non-classified errors to keep
 * server internals out of the wire.
 */
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError || err instanceof ForbiddenError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  console.error("[toErrorResponse] uncategorized error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// ------------------------------------------------------------
// Account context
// ------------------------------------------------------------

export interface AccountContext {
  /** Supabase SSR client, RLS scoped to the calling user. */
  supabase: SupabaseClient;
  /** Service role client, bypasses RLS. Use for membership queries. */
  serviceClient: SupabaseClient;
  /** `auth.uid()` for the caller. Always defined when this resolves. */
  userId: string;
  /** Caller's account_id from account_memberships + cookie. */
  accountId: string;
  /** Caller's role within their account (from account_memberships). */
  role: AccountRole;
  /** Lightweight account meta — id + name. */
  account: { id: string; name: string };
}

/**
 * Resolve the caller's user + account + role from account_memberships.
 *
 * Flow:
 *   1. Get authenticated user
 *   2. Read wacrm_active_account cookie for active account
 *   3. Query account_memberships for user's role in that account
 *   4. Fall back to first membership if no cookie set
 *   5. Load account details
 *
 * Throws `UnauthorizedError` if there's no Supabase session.
 * Throws `ForbiddenError` if the user has no memberships
 * (shouldn't happen for users who completed onboarding).
 *
 * Use `requireRole(min)` instead when the route also needs a
 * minimum-role check — it's a thin wrapper over this.
 */
export async function getCurrentAccount(): Promise<AccountContext> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    throw new UnauthorizedError();
  }

  // Get active account from cookie
  const cookieStore = await cookies();
  const activeAccountCookie = cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;

  // Use service role client to bypass RLS on account_memberships
  // (direct queries cause infinite recursion in PostgreSQL RLS policies)
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get user's memberships
  const { data: memberships, error: membershipErr } = await serviceClient
    .from("account_memberships")
    .select("account_id, role")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });

  if (membershipErr) {
    console.error("[getCurrentAccount] membership fetch error:", membershipErr);
    throw new ForbiddenError("Could not load account context");
  }

  if (!memberships || memberships.length === 0) {
    // User has no workspace memberships — they need to complete onboarding
    throw new ForbiddenError("User has no workspace membership");
  }

  // Determine which account to use
  let accountId: string;
  let role: AccountRole;

  if (activeAccountCookie && memberships.some(m => m.account_id === activeAccountCookie)) {
    // Cookie points to a valid membership
    accountId = activeAccountCookie;
    const membership = memberships.find(m => m.account_id === accountId)!;
    role = membership.role;
  } else {
    // Fall back to first membership (oldest = likely their primary)
    accountId = memberships[0].account_id;
    role = memberships[0].role;
  }

  if (!isAccountRole(role)) {
    throw new ForbiddenError(`Unknown account role: ${role}`);
  }

  // Load account details
  const { data: account, error: accountErr } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("id", accountId)
    .maybeSingle();

  if (accountErr) {
    console.error("[getCurrentAccount] account fetch error:", accountErr);
    throw new ForbiddenError("Could not load account context");
  }

  if (!account) {
    throw new ForbiddenError("Account not found");
  }

  return {
    supabase,
    serviceClient,
    userId: user.id,
    accountId,
    role,
    account: { id: account.id, name: account.name },
  };
}

/**
 * Resolve the caller's account context and enforce a minimum role.
 *
 * Throws `UnauthorizedError` / `ForbiddenError` as documented on
 * `getCurrentAccount`, plus `ForbiddenError("Insufficient role")`
 * when the caller is below `min`.
 */
export async function requireRole(min: AccountRole): Promise<AccountContext> {
  const ctx = await getCurrentAccount();
  if (!hasMinRole(ctx.role, min)) {
    throw new ForbiddenError(
      `This action requires the '${min}' role or higher`,
    );
  }
  return ctx;
}
