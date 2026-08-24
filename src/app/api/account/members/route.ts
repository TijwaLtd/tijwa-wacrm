// ============================================================
// GET /api/account/members
//
// Lists every member of the caller's account. Any member can call
// it (the Members tab is shown to admins+, but agents/viewers see
// a read-only roster too).
//
// Uses account_memberships for tenancy (M:N model, post-047).
//
// Field visibility
//   Sensitive fields (email) are returned only when the caller is
//   admin+. Agents and viewers see name + avatar + role + joined
//   date only. This mirrors the design decision from the planning
//   phase: "agent/viewer sees names only".
// ============================================================

import { NextResponse } from "next/server";

import { getCurrentAccount, toErrorResponse } from "@/lib/auth/account";
import { canManageMembers, isAccountRole } from "@/lib/auth/roles";
import type { AccountMember } from "@/types";

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    // Use SSR client for join queries (service client lacks schema cache)
    // RLS on account_memberships naturally scopes to the user's account
    const { data, error } = await ctx.supabase
      .from("account_memberships")
      .select(`
        role,
        joined_at,
        user:user_id (
          id,
          full_name,
          email,
          avatar_url
        )
      `)
      .eq("account_id", ctx.accountId)
      .order("joined_at", { ascending: true });

    if (error) {
      console.error("[GET /api/account/members] fetch error:", error);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = (data ?? []).flatMap((row) => {
      const raw = row.user;
      const profile = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown> | undefined;
      if (!profile?.id) return [];
      if (!isAccountRole(row.role)) return [];
      return [
        {
          user_id: profile.id as string,
          full_name: (profile.full_name as string) ?? "",
          email: canSeeEmails ? ((profile.email as string) ?? null) : null,
          avatar_url: (profile.avatar_url as string) ?? null,
          role: row.role as AccountMember["role"],
          joined_at: row.joined_at,
        },
      ];
    });

    return NextResponse.json({ members });
  } catch (err) {
    return toErrorResponse(err);
  }
}
