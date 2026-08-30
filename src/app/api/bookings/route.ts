// ============================================================
// /api/bookings - Bookings CRUD
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { BookingStatus } from "@/lib/business/orders";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const status = searchParams.get("status") as BookingStatus | null;
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "25");

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this account" }, { status: 403 });
  }

  let query = serviceClient
    .from("bookings")
    .select(`*, offering:offerings(id, name, type)`, { count: "exact" })
    .eq("account_id", accountId);

  if (status) query = query.eq("status", status);

  const { data: bookings, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.error("[bookings] list error:", error);
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 });
  }

  return NextResponse.json({
    bookings: bookings ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const accountId = body?.account_id;
  const contactId = body?.contact_id || null;
  const offeringId = body?.offering_id || null;
  const startDate = body?.start_date || null;
  const endDate = body?.end_date || null;
  const guests = parseInt(String(body?.guests)) || 1;
  const total = parseFloat(String(body?.total)) || 0;
  const notes = typeof body?.notes === "string" ? body.notes.trim() : null;
  const metadata = body?.metadata || {};

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership || !["owner", "admin", "agent"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generate booking number
  const { data: bookingNum } = await serviceClient.rpc("next_booking_number", { p_account_id: accountId });
  if (!bookingNum) {
    return NextResponse.json({ error: "Failed to generate booking number" }, { status: 500 });
  }

  // Get account currency
  const { data: account } = await serviceClient
    .from("accounts")
    .select("default_currency")
    .eq("id", accountId)
    .single();
  const currency = account?.default_currency || "USD";

  const { data: booking, error: createError } = await serviceClient
    .from("bookings")
    .insert({
      account_id: accountId,
      booking_number: bookingNum,
      contact_id: contactId,
      offering_id: offeringId,
      status: "pending",
      start_date: startDate,
      end_date: endDate,
      guests,
      currency,
      total,
      notes,
      metadata,
    })
    .select()
    .single();

  if (createError) {
    console.error("[bookings] create error:", createError);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }

  return NextResponse.json({ booking }, { status: 201 });
}
