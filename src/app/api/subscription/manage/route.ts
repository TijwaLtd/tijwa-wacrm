// ============================================================
// POST /api/subscription/manage
//
// Manage subscription: cancel or reactivate.
// No Stripe — updates the DB directly (dev/testing, Mpesa later).
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const action = body?.action as string;

  if (action !== "cancel" && action !== "reactivate") {
    return NextResponse.json(
      { error: "action must be 'cancel' or 'reactivate'" },
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

  // Load current subscription
  const { data: sub, error: subErr } = await supabase
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
    // Mark for cancellation at period end (user keeps access until then)
    const { error } = await supabase
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

  const { error } = await supabase
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
}
