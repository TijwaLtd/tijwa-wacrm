// ============================================================
// POST /api/invitations/[token]/redeem
//
// Authenticated. Caller joins the inviter's account with the
// invite's role. Heavy lifting lives in the SECURITY DEFINER
// `redeem_invitation` RPC.
//
// M:N flow: user keeps existing workspaces AND gets access to
// the invited workspace. No data is lost, no accounts deleted.
//
// Refusal contract (from the RPC)
//   - SQLSTATE 42501 → 401 (caller not authenticated)
//   - SQLSTATE 22023 → 400 (invitation not_found / used / expired)
//   - SQLSTATE P0001 → 403 (seat limit reached)
//
// Rate limit (per IP) is the same shape as peek but tighter —
// a successful redeem changes data.
// ============================================================

import { NextResponse } from "next/server";
import type { PostgrestError } from "@supabase/supabase-js";

import { hashInviteToken } from "@/lib/auth/invitations";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSeatLimitExceededEmail } from "@/lib/email/send";

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === "42501") {
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
  if (err.code === "22023") {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  console.error("[redeem] unexpected RPC error:", err);
  return NextResponse.json(
    { error: "Failed to redeem invitation" },
    { status: 500 },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`redeem:${ip}`, RATE_LIMITS.invitationRedeem);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Missing invitation token" },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rpcResult, error } = await supabase.rpc("redeem_invitation", {
    p_token_hash: hashInviteToken(token),
  });

  if (error) {
    // Seat limit error
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
    return rpcErrorToResponse(error);
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
