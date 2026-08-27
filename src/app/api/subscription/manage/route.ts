// ============================================================
// POST /api/subscription/manage
//
// Manage subscription: cancel or reactivate.
// No Stripe — updates the DB directly (dev/testing, Mpesa later).
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function POST(request: Request) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');

    const body = await request.json().catch(() => null);
    const action = body?.action as string;

    if (action !== "cancel" && action !== "reactivate") {
      return NextResponse.json(
        { error: "action must be 'cancel' or 'reactivate'" },
        { status: 400 },
      );
    }

    // Load current subscription
    const { data: sub, error: subErr } = await serviceClient
      .from("subscriptions")
      .select("id, plan, status, current_period_end, cancel_at_period_end")
      .eq("account_id", accountId)
      .maybeSingle();

    if (subErr || !sub) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    if (action === "cancel") {
      const { error } = await serviceClient
        .from("subscriptions")
        .update({
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      if (error) {
        return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        message: "Subscription will cancel at the end of the billing period",
        cancel_at: sub.current_period_end,
      });
    }

    // action === "reactivate"
    if (!sub.cancel_at_period_end) {
      return NextResponse.json({
        ok: true,
        message: "Subscription is already active",
      });
    }

    const { error } = await serviceClient
      .from("subscriptions")
      .update({
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    if (error) {
      return NextResponse.json({ error: "Failed to reactivate" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      message: "Subscription reactivated",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
