// ============================================================
// POST /api/workspaces/plan - Update workspace plan
//
// Updates the workspace plan, syncs the subscriptions table,
// and sends email notifications. No Stripe integration yet —
// plan changes are instant (for dev/testing and Mpesa later).
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { sendPlanChangeEmail, sendSubscriptionRenewedEmail } from "@/lib/email/send";

const VALID_PLANS = ['starter', 'business', 'growth', 'enterprise'] as const;
type Plan = typeof VALID_PLANS[number];

export async function POST(request: Request) {
  try {
    const { supabase, serviceClient, userId, accountId } = await requireRole('admin');

    const body = await request.json().catch(() => null);
    const plan = typeof body?.plan === "string" ? body.plan : null;

    if (!plan || !VALID_PLANS.includes(plan as Plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get current plan before updating
    const { data: currentSettings } = await serviceClient
      .from("tenant_settings")
      .select("plan, subscription_status")
      .eq("account_id", accountId)
      .single();

    const oldPlan = currentSettings?.plan;
    const wasExpired = currentSettings?.subscription_status &&
      !['active', 'trial'].includes(currentSettings.subscription_status);

    // Calculate billing period (30 days from now)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + 30);

    // Update tenant_settings with new plan + activate subscription
    const { error: updateError } = await serviceClient
      .from("tenant_settings")
      .update({
        plan,
        subscription_status: 'active',
        updated_at: now.toISOString(),
      })
      .eq("account_id", accountId);

    if (updateError) {
      console.error("[workspaces/plan] update error:", updateError);
      return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
    }

    // Upsert the subscriptions row (create or update)
    const { data: existingSub } = await serviceClient
      .from("subscriptions")
      .select("id")
      .eq("account_id", accountId)
      .maybeSingle();

    if (existingSub) {
      await serviceClient
        .from("subscriptions")
        .update({
          plan,
          status: 'active',
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          cancel_at_period_end: false,
          updated_at: now.toISOString(),
        })
        .eq("id", existingSub.id);
    } else {
      await serviceClient.from("subscriptions").insert({
        account_id: accountId,
        plan,
        status: 'active',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
      });
    }

    // Reset AI credits to plan allocation
    const PLAN_CREDITS: Record<string, number> = {
      starter: 100,
      business: 400,
      growth: 1000,
      enterprise: 999999,
    };
    const creditsToGrant = PLAN_CREDITS[plan] ?? 100;

    await serviceClient.rpc("reset_ai_credits", {
      p_account_id: accountId,
      p_new_credits: creditsToGrant,
    });

    // Send email notification (fire-and-forget, don't block the response)
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", userId)
      .single();

    const { data: account } = await supabase
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .single();

    const userEmail = (await supabase.auth.getUser()).data.user?.email ?? '';

    sendPlanChangeEmail(userEmail, {
      name: profile?.full_name || 'there',
      workspaceName: account?.name || 'your workspace',
      plan,
      oldPlan: oldPlan || undefined,
      action: oldPlan ? 'updated' : 'started',
    }).catch((err) => console.error("[workspaces/plan] email failed:", err));

    // If upgrading from starter or renewing expired, send subscription-renewed email
    if (!oldPlan || oldPlan === 'starter' || wasExpired) {
      sendSubscriptionRenewedEmail(userEmail, {
        name: profile?.full_name || 'there',
        workspaceName: account?.name || 'your workspace',
        plan,
      }).catch((err) => console.error("[workspaces/plan] renewed email failed:", err));
    }

    return NextResponse.json({
      ok: true,
      plan,
      current_period_end: periodEnd.toISOString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
