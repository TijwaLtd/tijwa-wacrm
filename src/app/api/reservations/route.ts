// ============================================================
// /api/reservations - Restaurant Table Reservations
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { hasMinRole, type AccountRole } from "@/lib/auth/roles";

type ReservationStatus = 'pending' | 'confirmed' | 'seated' | 'completed' | 'cancelled' | 'no_show';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const status = searchParams.get("status") as ReservationStatus | null;
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

  // Reservations are stored in bookings table with metadata.type = 'reservation'
  let query = serviceClient
    .from("bookings")
    .select(`*, offering:offerings(id, name, type)`, { count: "exact" })
    .eq("account_id", accountId)
    .eq("metadata->>type", "reservation");

  // Non-manager users only see their assigned reservations
  if (!hasMinRole(userRole, "manager")) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile) {
      query = query.eq("assigned_team_member_id", profile.id);
    } else {
      return NextResponse.json({ reservations: [], total: 0, page, limit });
    }
  }

  if (status) query = query.eq("status", status);

  const { data: reservations, error, count } = await query
    .order("start_date", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.error("[reservations] list error:", error);
    return NextResponse.json({ error: "Failed to load reservations" }, { status: 500 });
  }

  // Extract reservation-specific data from metadata
  const mapped = (reservations ?? []).map((r: any) => {
    const meta = (r.metadata || {}) as Record<string, unknown>;
    return {
      ...r,
      guest_name: meta.guest_name || 'Guest',
      party_size: meta.party_size || r.guests || 1,
      reservation_date: meta.reservation_date || r.start_date?.split('T')[0],
      reservation_time: meta.reservation_time || r.start_date?.split('T')[1]?.slice(0, 5),
      duration_minutes: meta.duration_minutes || 120,
      special_requests: meta.special_requests || r.notes,
    };
  });

  return NextResponse.json({
    reservations: mapped,
    total: count ?? 0,
    page,
    limit,
  });
}
