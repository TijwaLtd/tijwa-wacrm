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

    // Fetch memberships first, then profiles separately — there's no
    // direct FK from account_memberships to profiles (both reference
    // auth.users), so PostgREST can't do an inline join.
    const { data: memberships, error: memErr } = await ctx.supabase
      .from("account_memberships")
      .select("user_id, role, joined_at")
      .eq("account_id", ctx.accountId)
      .order("joined_at", { ascending: true });

    if (memErr) {
      console.error("[GET /api/account/members] memberships query error:", memErr);
      return NextResponse.json(
        { error: "Failed to load members" },
        { status: 500 },
      );
    }

    if (!memberships || memberships.length === 0) {
      return NextResponse.json({ members: [] });
    }

    // Collect user IDs to fetch profiles in one batch
    const userIds = memberships.map((m) => m.user_id);

    const { data: profiles, error: profErr } = await ctx.supabase
      .from("profiles")
      .select("user_id, full_name, email, avatar_url")
      .in("user_id", userIds);

    if (profErr) {
      console.error("[GET /api/account/members] profiles query error:", profErr);
      // Memberships exist but profiles failed — return memberships
      // with empty profile data rather than blocking the entire tab.
    }

    // Index profiles by user_id for O(1) lookups
    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, p]),
    );

    const canSeeEmails = canManageMembers(ctx.role);

    const members: AccountMember[] = memberships
      .flatMap((row) => {
        if (!isAccountRole(row.role)) return [];
        const profile = profileMap.get(row.user_id);
        return [
          {
            user_id: row.user_id,
            full_name: profile?.full_name ?? "",
            email: canSeeEmails ? (profile?.email ?? null) : null,
            avatar_url: profile?.avatar_url ?? null,
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
