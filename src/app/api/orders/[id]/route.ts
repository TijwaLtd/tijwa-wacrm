// ============================================================
// /api/orders/[id] - Single order
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: order, error } = await serviceClient
    .from("orders")
    .select(`*, items:order_items(*)`)
    .eq("id", id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", order.account_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this account" }, { status: 403 });
  }

  return NextResponse.json({ order });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing } = await serviceClient
    .from("orders")
    .select("id, account_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", existing.account_id)
    .single();

  if (!membership || !["owner", "admin", "agent"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (body?.status !== undefined) updates.status = body.status;
  if (body?.notes !== undefined) updates.notes = body.notes?.trim() || null;
  if (body?.metadata !== undefined) updates.metadata = body.metadata;
  if (body?.contact_id !== undefined) updates.contact_id = body.contact_id || null;
  if (body?.tax_amount !== undefined) updates.tax_amount = parseFloat(body.tax_amount) || 0;
  if (body?.discount_amount !== undefined) updates.discount_amount = parseFloat(body.discount_amount) || 0;

  // Recalculate total if tax or discount changed
  if (updates.tax_amount !== undefined || updates.discount_amount !== undefined) {
    const { data: current } = await serviceClient
      .from("orders")
      .select("subtotal, tax_amount, discount_amount")
      .eq("id", id)
      .single();
    if (current) {
      const tax = updates.tax_amount !== undefined ? updates.tax_amount as number : current.tax_amount;
      const discount = updates.discount_amount !== undefined ? updates.discount_amount as number : current.discount_amount;
      updates.total = current.subtotal + tax - discount;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("orders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("[orders] update error:", updateError);
    return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
  }

  return NextResponse.json({ order: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: existing } = await serviceClient
    .from("orders")
    .select("id, account_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", existing.account_id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: deleteError } = await serviceClient
    .from("orders")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[orders] delete error:", deleteError);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
