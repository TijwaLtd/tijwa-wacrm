// ============================================================
// POST /api/subscription/topup
//
// Top up AI credits. No Stripe — adds credits directly (dev/testing).
// In production, this would be gated by Mpesa payment.
// Sends a receipt email on successful purchase.
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { sendCreditPurchaseReceiptEmail } from "@/lib/email/send";

const KES_PER_CREDIT = 10;

export async function POST(request: Request) {
  try {
    const { supabase, serviceClient, accountId, userId } = await requireRole('admin');

    const body = await request.json().catch(() => null);
    const amount = Number(body?.amount);

    if (!amount || amount <= 0 || amount > 10000) {
      return NextResponse.json(
        { error: "amount must be between 1 and 10,000 credits" },
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

    // Fetch new balance (use serviceClient to bypass ai_credits RLS recursion)
    const { data: credits } = await serviceClient
      .from("ai_credits")
      .select("credits_remaining")
      .eq("account_id", accountId)
      .maybeSingle();

    const newBalance = Number(credits?.credits_remaining ?? 0);
    const amountKes = amount * KES_PER_CREDIT;

    // Send receipt email (fire-and-forget)
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: account } = await supabase
        .from("accounts")
        .select("name")
        .eq("id", accountId)
        .maybeSingle();

      const userEmail = (await supabase.auth.getUser()).data.user?.email ?? '';

      if (userEmail) {
        sendCreditPurchaseReceiptEmail(userEmail, {
          name: profile?.full_name || 'there',
          workspaceName: account?.name || 'your workspace',
          credits: amount.toLocaleString(),
          amount_kes: amountKes.toLocaleString(),
          new_balance: newBalance.toLocaleString(),
          date: new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }).catch((err) => console.error("[topup] receipt email failed:", err));
      }
    } catch (emailErr) {
      console.error("[topup] receipt email skipped:", emailErr);
    }

    return NextResponse.json({
      ok: true,
      credits_added: amount,
      credits_remaining: newBalance,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
