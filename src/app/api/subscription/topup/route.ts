// ============================================================
// POST /api/subscription/topup
//
// Top up AI credits. No Stripe — adds credits directly (dev/testing).
// In production, this would be gated by Mpesa payment.
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function POST(request: Request) {
  try {
    const { supabase, serviceClient, accountId } = await requireRole('admin');

    const body = await request.json().catch(() => null);
    const amount = Number(body?.amount);

    if (!amount || amount <= 0 || amount > 1000) {
      return NextResponse.json(
        { error: "amount must be between 1 and 1000" },
        { status: 400 },
      );
    }

    // Add credits via RPC (service role required for ai_credits writes)
    const { error } = await serviceClient.rpc("add_ai_credits", {
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
  } catch (err) {
    return toErrorResponse(err);
  }
}
