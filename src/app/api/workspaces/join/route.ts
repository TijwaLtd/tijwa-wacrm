// ============================================================
// POST /api/workspaces/join - Join a workspace via invite
//
// Uses the existing invitation system. The invite code is a
// plaintext token that maps to account_invitations.token_hash.
// This endpoint calls the existing redeem_invitation RPC.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashInviteToken } from "@/lib/auth/invitations";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

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

  const { data: accountId, error } = await supabase.rpc("redeem_invitation", {
    p_token_hash: hashInviteToken(inviteCode),
  });

  if (error) {
    console.error("[workspaces/join] redeem error:", error);
    // Map RPC errors to appropriate HTTP responses
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

  return NextResponse.json({ ok: true, accountId });
}
