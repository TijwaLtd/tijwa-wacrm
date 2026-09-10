// ============================================================
// /api/orders - Orders CRUD
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { OrderStatus } from "@/lib/business/orders";
import { hasMinRole, type AccountRole } from "@/lib/auth/roles";
import { autoAssignConversation } from "@/lib/assignments/auto-assign";
import { supabaseAdmin } from "@/lib/ai/admin-client";

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

  const userRole = membership.role as AccountRole;

  let query = serviceClient
    .from("orders")
    .select(`*, items:order_items(*), rider:profiles!orders_assigned_team_member_id_fkey(id, full_name, user_id)`, { count: "exact" })
    .eq("account_id", accountId);

  // Non-manager users only see orders assigned to them
  if (!hasMinRole(userRole, "manager")) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      query = query.eq("assigned_team_member_id", profile.id);
    } else {
      // No profile = no orders to show
      return NextResponse.json({ orders: [], total: 0, page, limit });
    }
  }

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

  // Validate order schema if offering_id is provided
  if (items && items.length > 0 && items[0]?.offering_id) {
    const offeringId = items[0].offering_id;
    const { data: offering } = await serviceClient
      .from("offerings")
      .select("metadata")
      .eq("id", offeringId)
      .eq("account_id", accountId)
      .maybeSingle();

    if (offering) {
      const offeringMetadata = offering.metadata as Record<string, unknown> | null;
      const orderSchema = offeringMetadata?.order_schema as Record<string, unknown> | null;

      if (orderSchema) {
        const requiredFields = orderSchema.required_fields as string[] || [];
        const fieldTypes = orderSchema.field_types as Record<string, string> || {};
        const fieldDescriptions = orderSchema.field_descriptions as Record<string, string> || {};

        // Validate required fields in metadata
        const missingFields = requiredFields.filter((field) => !(field in metadata));
        if (missingFields.length > 0) {
          return NextResponse.json({
            error: "Missing required fields",
            missing_fields: missingFields,
            field_descriptions: missingFields.map((f) => ({ field: f, description: fieldDescriptions[f] })),
          }, { status: 400 });
        }

        // Validate field types
        const typeErrors: string[] = [];
        for (const [field, expectedType] of Object.entries(fieldTypes)) {
          if (field in metadata) {
            const value = metadata[field];
            let isValid = false;

            switch (expectedType) {
              case "string":
                isValid = typeof value === "string";
                break;
              case "number":
                isValid = typeof value === "number" && !isNaN(value);
                break;
              case "boolean":
                isValid = typeof value === "boolean";
                break;
              case "array":
                isValid = Array.isArray(value);
                break;
            }

            if (!isValid) {
              typeErrors.push(`${field} must be ${expectedType}, got ${typeof value}`);
            }
          }
        }

        if (typeErrors.length > 0) {
          return NextResponse.json({
            error: "Invalid field types",
            type_errors: typeErrors,
          }, { status: 400 });
        }
      }
    }
  }

  // Generate order number
  const { data: orderNum } = await serviceClient.rpc("next_order_number", { p_account_id: accountId });
  if (!orderNum) {
    return NextResponse.json({ error: "Failed to generate order number" }, { status: 500 });
  }

  // Get account currency and business type
  const { data: account } = await serviceClient
    .from("accounts")
    .select("default_currency, business_type")
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

  // Auto-assign order to team member for logistics businesses (fire-and-forget)
  if (account?.business_type) {
    void autoAssignConversation(supabaseAdmin(), accountId, "", order.id).catch((err) => {
      console.error("[orders] auto-assign failed:", err);
    });
  }

  return NextResponse.json({ order }, { status: 201 });
}
