// ============================================================
// GET/POST /api/subscription/seats
//
// GET: Returns current seat usage (included + extra).
// POST: Add or remove extra seats.
//   - add: charges prorated amount, increments extra_seats
//   - remove: decrements extra_seats (no refund, next renewal)
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

const SEAT_PRICE_KES = 750;
const BILLING_DAYS = 30;

export async function GET() {
  try {
    const { serviceClient, accountId } = await requireRole('viewer');

    // Get plan limits
    const { data: settings } = await serviceClient
      .from("tenant_settings")
      .select("plan")
      .eq("account_id", accountId)
      .maybeSingle();

    const plan = settings?.plan ?? "starter";
    const { data: planData } = await serviceClient.rpc("get_plan_features", {
      p_plan: plan,
    });
    const features = typeof planData === 'string' ? JSON.parse(planData) : planData;
    const includedSeats = features?.max_team_members ?? 1;

    // Get current extra seats
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("extra_seats, seat_price_kes, current_period_end")
      .eq("account_id", accountId)
      .maybeSingle();

    const extraSeats = sub?.extra_seats ?? 0;
    const seatPrice = Number(sub?.seat_price_kes ?? SEAT_PRICE_KES);

    // Count current members
    const { count: memberCount } = await serviceClient
      .from("account_memberships")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    return NextResponse.json({
      included_seats: includedSeats,
      extra_seats: extraSeats,
      total_seats: includedSeats + extraSeats,
      seat_price_kes: seatPrice,
      current_members: memberCount ?? 0,
      plan,
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

    if (action !== "add" && action !== "remove") {
      return NextResponse.json(
        { error: "action must be 'add' or 'remove'" },
        { status: 400 },
      );
    }

    // Get current subscription
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("id, extra_seats, seat_price_kes, current_period_end")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!sub) {
      return NextResponse.json(
        { error: "No active subscription found" },
        { status: 404 },
      );
    }

    // Get plan limits
    const { data: settings } = await serviceClient
      .from("tenant_settings")
      .select("plan")
      .eq("account_id", accountId)
      .maybeSingle();

    const plan = settings?.plan ?? "starter";
    const { data: planData } = await serviceClient.rpc("get_plan_features", {
      p_plan: plan,
    });
    const features = typeof planData === 'string' ? JSON.parse(planData) : planData;
    const includedSeats = features?.max_team_members ?? 1;

    // Count current members
    const { count: memberCount } = await serviceClient
      .from("account_memberships")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId);

    const currentMembers = memberCount ?? 0;
    const currentExtra = sub.extra_seats ?? 0;
    const seatPrice = Number(sub.seat_price_kes ?? SEAT_PRICE_KES);

    if (action === "add") {
      // Calculate prorated charge
      const periodEnd = new Date(sub.current_period_end);
      const now = new Date();
      const totalDays = BILLING_DAYS;
      const daysRemaining = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const proratedCharge = Math.round(seatPrice * (daysRemaining / totalDays));

      // Increment extra seats
      await serviceClient
        .from("subscriptions")
        .update({
          extra_seats: currentExtra + 1,
          updated_at: now.toISOString(),
        })
        .eq("id", sub.id);

      // Log billing history
      await serviceClient.from("billing_history").insert({
        account_id: accountId,
        event_type: 'seat_added',
        description: `Added 1 extra team member seat (KES ${proratedCharge} prorated)`,
        amount_kes: proratedCharge,
        metadata: {
          seats_added: 1,
          prorated: true,
          days_remaining: daysRemaining,
          seat_price_monthly: seatPrice,
        },
      });

      return NextResponse.json({
        ok: true,
        action: "add",
        seats_added: 1,
        charge_kes: proratedCharge,
        prorated: true,
        days_remaining: daysRemaining,
        new_extra_seats: currentExtra + 1,
        new_total_seats: includedSeats + currentExtra + 1,
        monthly_cost_kes: seatPrice * (currentExtra + 1),
      });
    }

    // action === "remove"
    if (currentExtra <= 0) {
      return NextResponse.json(
        { error: "No extra seats to remove" },
        { status: 400 },
      );
    }

    // Check if removal would leave members over the new limit
    const newTotal = includedSeats + currentExtra - 1;
    if (currentMembers > newTotal) {
      return NextResponse.json(
        { error: `Cannot remove seat: ${currentMembers} members exceed the ${newTotal}-seat limit. Remove a team member first.` },
        { status: 400 },
      );
    }

    // Decrement extra seats
    await serviceClient
      .from("subscriptions")
      .update({
        extra_seats: currentExtra - 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    // Log billing history
    await serviceClient.from("billing_history").insert({
      account_id: accountId,
      event_type: 'seat_removed',
      description: `Removed 1 extra team member seat (effective next renewal)`,
      metadata: { seats_removed: 1 },
    });

    return NextResponse.json({
      ok: true,
      action: "remove",
      seats_removed: 1,
      new_extra_seats: currentExtra - 1,
      new_total_seats: includedSeats + currentExtra - 1,
      monthly_cost_kes: seatPrice * (currentExtra - 1),
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
