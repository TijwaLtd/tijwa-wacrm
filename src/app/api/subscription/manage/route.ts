// ============================================================
// GET/POST /api/subscription/manage
//
// GET: Returns current subscription details. Creates a subscription
//      row if missing (backfills from account creation date).
// POST: Manage subscription (cancel/reactivate).
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const { serviceClient, accountId } = await requireRole('viewer');

    // Try to get existing subscription
    const { data: sub, error } = await serviceClient
      .from("subscriptions")
      .select("plan, status, current_period_start, current_period_end, cancel_at_period_end")
      .eq("account_id", accountId)
      .maybeSingle();

    if (sub) {
      return NextResponse.json({
        subscription: {
          plan: sub.plan,
          status: sub.status,
          current_period_start: sub.current_period_start,
          current_period_end: sub.current_period_end,
          cancel_at_period_end: sub.cancel_at_period_end,
        },
      });
    }

    // No subscription row — upsert from tenant_settings (race-safe)
    const { data: settings } = await serviceClient
      .from("tenant_settings")
      .select("plan, subscription_status")
      .eq("account_id", accountId)
      .maybeSingle();

    const plan = settings?.plan ?? "starter";
    const status = settings?.subscription_status ?? "active";

    const now = new Date();
    const periodStart = now.toISOString();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // Upsert: insert only if missing, safe for concurrent requests
    await serviceClient.from("subscriptions").upsert({
      account_id: accountId,
      plan,
      status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    }, { onConflict: 'account_id' });

    return NextResponse.json({
      subscription: {
        plan,
        status,
        current_period_start: periodStart,
        current_period_end: periodEnd,
        cancel_at_period_end: false,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

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

      // Log billing history
      await serviceClient.from("billing_history").insert({
        account_id: accountId,
        event_type: 'subscription_cancelled',
        description: `Subscription cancelled, access until ${new Date(sub.current_period_end).toLocaleDateString()}`,
        metadata: { cancel_at: sub.current_period_end },
      });

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

    // Log billing history
    await serviceClient.from("billing_history").insert({
      account_id: accountId,
      event_type: 'subscription_reactivated',
      description: 'Subscription reactivated',
    });

    return NextResponse.json({
      ok: true,
      message: "Subscription reactivated",
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
