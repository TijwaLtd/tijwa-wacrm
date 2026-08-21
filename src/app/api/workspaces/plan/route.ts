// ============================================================
// POST /api/workspaces/plan - Update workspace plan
//
// Updates the workspace plan. No Stripe integration -
// just updates the plan and sends email notification.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_PLANS = ['starter', 'pro', 'enterprise'] as const;
type Plan = typeof VALID_PLANS[number];

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const plan = typeof body?.plan === "string" ? body.plan : null;

  if (!plan || !VALID_PLANS.includes(plan as Plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Get active account from cookie
  const accountId = getActiveAccountId(request);

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

  // Update tenant_settings with new plan
  const { error: updateError } = await supabase
    .from("tenant_settings")
    .update({
      plan,
      updated_at: new Date().toISOString(),
    })
    .eq("account_id", accountId);

  if (updateError) {
    console.error("[workspaces/plan] update error:", updateError);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }

  // TODO: Send email notification about plan change
  // This would integrate with your email service (Resend, SendGrid, etc.)
  // await sendPlanChangeEmail(user.email, accountName, plan);

  return NextResponse.json({ ok: true, plan });
}

function getActiveAccountId(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/wacrm_active_account=([^;]+)/);
  return match ? match[1] : null;
}
