// ============================================================
// POST /api/workspaces/join - Join a workspace via invite
//
// Uses the existing invitation system. The invite code is a
// plaintext token that maps to account_invitations.token_hash.
// This endpoint calls the existing redeem_invitation RPC.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashInviteToken } from "@/lib/auth/invitations";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { sendSeatLimitExceededEmail } from "@/lib/email/send";

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`join:${ip}`, RATE_LIMITS.invitationRedeem);
  if (!limit.success) return rateLimitResponse(limit);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const inviteCode = typeof body?.inviteCode === "string" ? body.inviteCode.trim() : "";

  if (!inviteCode) {
    return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
  }

  const { data: rpcResult, error } = await supabase.rpc("redeem_invitation", {
    p_token_hash: hashInviteToken(inviteCode),
  });

  if (error) {
    console.error("[workspaces/join] redeem error:", error);

    // Seat limit error (P0001 with DETAIL containing seat info)
    if (error.code === "P0001" && error.details) {
      try {
        const seatInfo = JSON.parse(error.details);
        if (seatInfo.seat_limit_reached) {
          notifyAdminSeatLimit(seatInfo, user.id).catch(console.error);
          return NextResponse.json({
            error: error.message,
            seat_limit_reached: true,
            seat_info: seatInfo,
          }, { status: 403 });
        }
      } catch { /* fall through */ }
    }

    if (error.code === "42501") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error.code === "22023") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error.code === "23505") {
      return NextResponse.json(
        { error: error.message || "Cannot join workspace with this account" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to join workspace" }, { status: 500 });
  }

  if (typeof rpcResult === 'object' && rpcResult !== null) {
    return NextResponse.json({ ok: true, accountId: rpcResult.account_id, role: rpcResult.role });
  }

  return NextResponse.json({ ok: true, accountId: rpcResult });
}

async function notifyAdminSeatLimit(
  seatInfo: { account_id: string; plan: string; total_seats: number; current_members: number },
  attempterUserId: string,
) {
  const adminClient = createAdminClient();
  const { data: account } = await adminClient
    .from("accounts")
    .select("name, owner_user_id")
    .eq("id", seatInfo.account_id)
    .single();

  if (!account?.owner_user_id) return;

  const [{ data: ownerProfile }, { data: attempterProfile }] = await Promise.all([
    adminClient.from("profiles").select("full_name, email").eq("user_id", account.owner_user_id).single(),
    adminClient.from("profiles").select("full_name, email").eq("user_id", attempterUserId).single(),
  ]);

  if (!ownerProfile?.email) return;

  await sendSeatLimitExceededEmail(ownerProfile.email, {
    adminName: ownerProfile.full_name || "Admin",
    attempterName: attempterProfile?.full_name || attempterProfile?.email || "A user",
    workspaceName: account.name || "your workspace",
    plan: seatInfo.plan || "starter",
    totalSeats: String(seatInfo.total_seats || 1),
    currentMembers: String(seatInfo.current_members || 0),
  });
}
