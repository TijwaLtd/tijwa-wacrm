// ============================================================
// /api/orders - Orders CRUD
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/business/orders";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const status = searchParams.get("status") as OrderStatus | null;
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
    .from("orders")
    .select(`*, items:order_items(*)`, { count: "exact" })
    .eq("account_id", accountId);

  if (status) query = query.eq("status", status);

  const { data: orders, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.error("[orders] list error:", error);
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }

  return NextResponse.json({
    orders: orders ?? [],
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
  const items = body?.items as Array<{ offering_id?: string; name: string; quantity: number; unit_price: number }> | undefined;
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

  // Generate order number
  const { data: orderNum } = await serviceClient.rpc("next_order_number", { p_account_id: accountId });
  if (!orderNum) {
    return NextResponse.json({ error: "Failed to generate order number" }, { status: 500 });
  }

  // Get account currency
  const { data: account } = await serviceClient
    .from("accounts")
    .select("default_currency")
    .eq("id", accountId)
    .single();
  const currency = account?.default_currency || "USD";

  // Calculate totals
  let subtotal = 0;
  const orderItems = (items || []).map((item) => {
    const qty = Math.max(1, parseInt(String(item.quantity)) || 1);
    const price = parseFloat(String(item.unit_price)) || 0;
    const total = qty * price;
    subtotal += total;
    return {
      offering_id: item.offering_id || null,
      name: item.name,
      quantity: qty,
      unit_price: price,
      total_price: total,
    };
  });

  // Create order
  const { data: order, error: createError } = await serviceClient
    .from("orders")
    .insert({
      account_id: accountId,
      order_number: orderNum,
      contact_id: contactId,
      status: "pending",
      currency,
      subtotal,
      tax_amount: 0,
      discount_amount: 0,
      total: subtotal,
      notes,
      metadata,
    })
    .select()
    .single();

  if (createError) {
    console.error("[orders] create error:", createError);
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  // Insert order items
  if (orderItems.length > 0) {
    const itemsWithOrder = orderItems.map((item) => ({ ...item, order_id: order.id }));
    const { error: itemsError } = await serviceClient
      .from("order_items")
      .insert(itemsWithOrder);

    if (itemsError) {
      console.error("[orders] items insert error:", itemsError);
    }
  }

  return NextResponse.json({ order }, { status: 201 });
}
