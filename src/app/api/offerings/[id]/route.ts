// ============================================================
// /api/offerings/[id] - Single offering CRUD
//
// GET    /api/offerings/[id]  - Get offering details
// PATCH  /api/offerings/[id]  - Update offering
// DELETE /api/offerings/[id]  - Archive offering
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// GET /api/offerings/[id] - Get offering details
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

  const { data: offering, error } = await serviceClient
    .from("offerings")
    .select(`
      *,
      category:offering_categories(*),
      media:offering_media(*)
    `)
    .eq("id", id)
    .single();

  if (error || !offering) {
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });
  }

  // Verify membership
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", offering.account_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this account" }, { status: 403 });
  }

  return NextResponse.json({ offering });
}

// PATCH /api/offerings/[id] - Update offering
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

  // Get existing offering
  const { data: existing } = await serviceClient
    .from("offerings")
    .select("id, account_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });
  }

  // Verify membership
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", existing.account_id)
    .single();

  if (!membership || !["owner", "admin", "agent"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build updates
  const updates: Record<string, unknown> = {};
  if (body?.name !== undefined) updates.name = body.name.trim();
  if (body?.short_description !== undefined) updates.short_description = body.short_description?.trim() || null;
  if (body?.description !== undefined) updates.description = body.description?.trim() || null;
  if (body?.status !== undefined) updates.status = body.status;
  if (body?.category_id !== undefined) updates.category_id = body.category_id || null;
  if (body?.price !== undefined) updates.price = body.price != null ? parseFloat(body.price) : null;
  if (body?.currency !== undefined) updates.currency = body.currency || null;
  if (body?.price_type !== undefined) updates.price_type = body.price_type;
  if (body?.reference_code !== undefined) updates.reference_code = body.reference_code?.trim() || null;
  if (body?.metadata !== undefined) updates.metadata = body.metadata;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("offerings")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("[offerings] update error:", updateError);
    return NextResponse.json({ error: "Failed to update offering" }, { status: 500 });
  }

  return NextResponse.json({ offering: updated });
}

// DELETE /api/offerings/[id] - Archive offering (soft delete)
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

  // Get existing offering
  const { data: existing } = await serviceClient
    .from("offerings")
    .select("id, account_id, status")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });
  }

  // Verify membership (admin+ required for archive)
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", existing.account_id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Archive instead of delete
  const { error: archiveError } = await serviceClient
    .from("offerings")
    .update({ status: "archived" })
    .eq("id", id);

  if (archiveError) {
    console.error("[offerings] archive error:", archiveError);
    return NextResponse.json({ error: "Failed to archive offering" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
