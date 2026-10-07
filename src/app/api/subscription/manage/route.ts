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
      .select("plan, status, current_period_start, current_period_end, cancel_at_period_end, created_at")
      .eq("account_id", accountId)
      .maybeSingle();

    if (sub) {
      const { data: settings } = await serviceClient
        .from("tenant_settings")
        .select("plan, subscription_status")
        .eq("account_id", accountId)
        .maybeSingle();

      // Repair legacy rows: migrations 041/046/047/072/078 inserted
      // subscriptions with only (account_id, plan, status) — periods stayed
      // NULL — and pre-095 the plan CHECK made /api/workspaces/plan's
      // subscriptions update fail silently, so rows also kept a stale plan.
      // tenant_settings is the source of truth for the plan (no Stripe
      // webhooks in this deployment); the last plan_changed event anchors
      // the billing period so "Current period started" / "Next billing
      // date" are truthful instead of rendering "—".
      const stalePlan = !!(settings?.plan && sub.plan !== settings.plan);
      const missingPeriods = !sub.current_period_start || !sub.current_period_end;

      if (!missingPeriods && !stalePlan) {
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

      // Period anchor: the most recent plan change, else row creation.
      const { data: lastChange } = await serviceClient
        .from("billing_history")
        .select("created_at")
        .eq("account_id", accountId)
        .eq("event_type", "plan_changed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const start =
        sub.current_period_start ??
        lastChange?.created_at ??
        sub.created_at ??
        new Date().toISOString();
      const end =
        sub.current_period_end ??
        new Date(new Date(start).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: repaired, error: repairErr } = await serviceClient
        .from("subscriptions")
        .update({
          current_period_start: start,
          current_period_end: end,
          ...(settings?.plan && settings.plan !== sub.plan
            ? { plan: settings.plan }
            : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("account_id", accountId)
        .select("plan, status, current_period_start, current_period_end, cancel_at_period_end")
        .maybeSingle();

      if (repairErr) {
        // Never fail the billing page over the repair — serve the
        // computed values even if the write-back didn't land.
        console.error("[subscription/manage] legacy row repair failed:", repairErr);
      }

      const row = repaired ?? {
        plan: settings?.plan ?? sub.plan,
        status: sub.status,
        current_period_start: start,
        current_period_end: end,
        cancel_at_period_end: sub.cancel_at_period_end,
      };

      return NextResponse.json({ subscription: row });
    }

    // No subscription row — upsert from tenant_settings (race-safe)
    const { data: settings } = await serviceClient
      .from("tenant_settings")
      .select("plan, subscription_status")
      .eq("account_id", accountId)
      .maybeSingle();

    const plan = settings?.plan;
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
    const { serviceClient, accountId } = await requireRole('owner');

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
