// ============================================================
// /api/offerings/media/[id] - Media management
//
// PATCH  /api/offerings/media/[id]  - Update media (set primary, reorder)
// DELETE /api/offerings/media/[id]  - Delete media record + storage
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// PATCH /api/offerings/media/[id] - Set primary or reorder
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

  // Get existing media
  const { data: existing } = await serviceClient
    .from("offering_media")
    .select("id, account_id, offering_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
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

  const updates: Record<string, unknown> = {};

  // Set as primary
  if (body?.is_primary === true) {
    // Clear other primary flags for this offering
    await serviceClient
      .from("offering_media")
      .update({ is_primary: false })
      .eq("offering_id", existing.offering_id)
      .neq("id", id);

    updates.is_primary = true;
  }

  // Update sort order
  if (body?.sort_order !== undefined) {
    updates.sort_order = body.sort_order;
  }

  // Update alt text
  if (body?.alt_text !== undefined) {
    updates.alt_text = body.alt_text;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error } = await serviceClient
    .from("offering_media")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[media] update error:", error);
    return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  }

  return NextResponse.json({ media: updated });
}

// DELETE /api/offerings/media/[id] - Delete media record + storage file
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

  // Get existing media
  const { data: existing } = await serviceClient
    .from("offering_media")
    .select("id, account_id, offering_id, url")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
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

  // Delete from storage (best effort)
  try {
    const urlParts = existing.url.split("/offerings/");
    if (urlParts.length > 1) {
      const storagePath = urlParts[1];
      await supabase.storage.from("offerings").remove([storagePath]);
    }
  } catch (err) {
    console.error("[media] storage delete error (continuing):", err);
  }

  // Delete media record
  const { error: deleteError } = await serviceClient
    .from("offering_media")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[media] delete error:", deleteError);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }

  // If this was the primary image, promote the next one
  const { count } = await serviceClient
    .from("offering_media")
    .select("id", { count: "exact", head: true })
    .eq("offering_id", existing.offering_id)
    .eq("is_primary", true);

  if (!count || count === 0) {
    // No primary left — promote the first by sort_order
    const { data: nextMedia } = await serviceClient
      .from("offering_media")
      .select("id")
      .eq("offering_id", existing.offering_id)
      .order("sort_order")
      .limit(1)
      .maybeSingle();

    if (nextMedia) {
      await serviceClient
        .from("offering_media")
        .update({ is_primary: true })
        .eq("id", nextMedia.id);
    }
  }

  return NextResponse.json({ ok: true });
}
