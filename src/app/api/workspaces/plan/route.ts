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

    // Add plan allocation credits (don't wipe purchased credits).
    // The monthly allocation is additive — purchased credits are preserved.
    // A monthly cron resets credits_remaining to plan allocation on the 1st.
    // Credits = 20% of plan price (floor). Starter is exempt (0 credits).
    const PLAN_PRICES: Record<string, number> = {
      starter: 2500,
      business: 5000,
      growth: 10000,
      enterprise: 25000,
    };
    const price = PLAN_PRICES[plan] ?? 0;
    const creditsToGrant = plan === 'starter' ? 0 : Math.floor(price * 0.20);

    if (creditsToGrant > 0) {
      await serviceClient.rpc("add_ai_credits", {
        p_account_id: accountId,
        p_credits: creditsToGrant,
      });
    }

    // Auto-remove extra seats if new plan covers all members
    const { data: planFeatures } = await serviceClient.rpc("get_plan_features", {
      p_plan: plan,
    });
    const features = typeof planFeatures === 'string' ? JSON.parse(planFeatures) : planFeatures;
    const newPlanSeats = features?.max_team_members ?? 1;

    // Count current members
    const { count: memberCount } = await serviceClient
      .from("account_memberships")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    const currentMembers = memberCount ?? 0;

    // Get current extra seats
    const { data: currentSub } = await serviceClient
      .from("subscriptions")
      .select("id, extra_seats")
      .eq("account_id", accountId)
      .maybeSingle();

    const currentExtra = currentSub?.extra_seats ?? 0;

    // If new plan covers all members, remove extra seats
    if (currentExtra > 0 && newPlanSeats >= currentMembers) {
      await serviceClient
        .from("subscriptions")
        .update({ extra_seats: 0, updated_at: now.toISOString() })
        .eq("account_id", accountId);

      // Log billing history
      await serviceClient.from("billing_history").insert({
        account_id: accountId,
        event_type: 'seat_removed',
        description: `Extra seats removed — ${plan} plan covers ${newPlanSeats} seats`,
        metadata: { seats_removed: currentExtra, reason: 'plan_upgrade' },
      });
    }

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
        action: oldPlan ? 'renewed' : 'activated',
      }).catch((err) => console.error("[workspaces/plan] renewed email failed:", err));
    }

    // Log billing history
    const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
    const oldLabel = oldPlan ? oldPlan.charAt(0).toUpperCase() + oldPlan.slice(1) : null;
    await serviceClient.from("billing_history").insert({
      account_id: accountId,
      event_type: 'plan_changed',
      description: oldLabel
        ? `Plan changed from ${oldLabel} to ${planLabel}`
        : `Subscription started on ${planLabel}`,
      metadata: { old_plan: oldPlan, new_plan: plan },
    });

    return NextResponse.json({
      ok: true,
      plan,
      current_period_end: periodEnd.toISOString(),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
