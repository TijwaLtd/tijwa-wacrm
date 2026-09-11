// ============================================================
// /api/food-orders - Restaurant Food Orders
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { hasMinRole, type AccountRole } from "@/lib/auth/roles";

type FoodOrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const status = searchParams.get("status") as FoodOrderStatus | null;
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
    .select(`*, items:order_items(*)`, { count: "exact" })
    .eq("account_id", accountId)
    .eq("metadata->>order_type", "dine_in") // or filter by metadata->>'order_type' IN ('dine_in', 'takeaway', 'room_service')
    .or("metadata->>order_type.eq.dine_in,metadata->>order_type.eq.takeaway,metadata->>order_type.eq.room_service");

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
      return NextResponse.json({ orders: [], total: 0, page, limit });
    }
  }

  if (status) query = query.eq("status", status);

  const { data: orders, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.error("[food-orders] list error:", error);
    return NextResponse.json({ error: "Failed to load food orders" }, { status: 500 });
  }

  return NextResponse.json({
    orders: orders ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}
