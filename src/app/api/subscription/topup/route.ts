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

// Simple in-memory rate limit: max 5 topups per hour per account
const topupRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(accountId: string): boolean {
  const now = Date.now();
  const existing = topupRateLimit.get(accountId);
  if (!existing || now > existing.resetAt) {
    topupRateLimit.set(accountId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (existing.count >= 5) return false;
  existing.count++;
  return true;
}

export async function POST(request: Request) {
  try {
    const { supabase, serviceClient, accountId, userId } = await requireRole('admin');

    // Rate limit: max 5 topups per hour per account
    if (!checkRateLimit(accountId)) {
      return NextResponse.json(
        { error: "Too many topup requests. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const credits = Number(body?.credits);

    if (!credits || credits <= 0 || credits > 10000) {
      return NextResponse.json(
        { error: "credits must be between 1 and 10,000" },
        { status: 400 },
      );
    }

    // Add credits via RPC (service role required for ai_credits writes)
    const { error } = await serviceClient.rpc("add_ai_credits", {
      p_account_id: accountId,
      p_credits: credits,
    });

    if (error) {
      console.error("[topup] failed to add credits:", error);
      return NextResponse.json({ error: "Failed to add credits" }, { status: 500 });
    }

    // Fetch new balance (use serviceClient to bypass ai_credits RLS recursion)
    const { data: creditsRow } = await serviceClient
      .from("ai_credits")
      .select("credits_remaining")
      .eq("account_id", accountId)
      .maybeSingle();

    const newBalance = Number(creditsRow?.credits_remaining ?? 0);
    const amountKes = credits * KES_PER_CREDIT;

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
          credits: credits.toLocaleString(),
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

    // Log billing history
    await serviceClient.from("billing_history").insert({
      account_id: accountId,
      event_type: 'credits_purchased',
      description: `Purchased ${credits.toLocaleString()} AI credits`,
      amount_kes: amountKes,
      credits_delta: credits,
      metadata: { credits_added: credits, new_balance: newBalance },
    });

    return NextResponse.json({
      ok: true,
      credits_added: credits,
      credits_remaining: newBalance,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
