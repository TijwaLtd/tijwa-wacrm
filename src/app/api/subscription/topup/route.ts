// ============================================================
// POST /api/subscription/topup
//
// Top up AI credits. No Stripe — adds credits directly (dev/testing).
// In production, this would be gated by Mpesa payment.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TOPUP_OPTIONS = [
  { id: "50", credits: 50, label: "50 credits", price: "$50" },
  { id: "100", credits: 100, label: "100 credits", price: "$100" },
  { id: "250", credits: 250, label: "250 credits", price: "$250" },
  { id: "500", credits: 500, label: "500 credits", price: "$500" },
];

export { TOPUP_OPTIONS };

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);

  if (!amount || amount <= 0 || amount > 1000) {
    return NextResponse.json(
      { error: "amount must be between 1 and 1000" },
      { status: 400 },
    );
  }

  // Get active account from cookie
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/wacrm_active_account=([^;]+)/);
  const accountId = match?.[1];

  if (!accountId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 400 });
  }

  // Verify caller is owner/admin
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Add credits via RPC (service role required for ai_credits writes)
  const { error } = await supabase.rpc("add_ai_credits", {
    p_account_id: accountId,
    p_credits: amount,
  });

  if (error) {
    console.error("[topup] failed to add credits:", error);
    return NextResponse.json({ error: "Failed to add credits" }, { status: 500 });
  }

  // Fetch new balance
  const { data: credits } = await supabase
    .from("ai_credits")
    .select("credits_remaining")
    .eq("account_id", accountId)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    credits_added: amount,
    credits_remaining: credits?.credits_remaining ?? 0,
  });
}
