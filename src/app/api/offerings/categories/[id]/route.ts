// ============================================================
// /api/offerings/categories/[id] - Category CRUD
//
// GET    /api/offerings/categories/[id]  - Get category
// PATCH  /api/offerings/categories/[id]  - Update category
// DELETE /api/offerings/categories/[id]  - Delete category
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/business/offerings";

// GET /api/offerings/categories/[id]
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

  const { data: category, error } = await serviceClient
    .from("offering_categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  // Verify membership
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", category.account_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  return NextResponse.json({ category });
}

// PATCH /api/offerings/categories/[id]
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

  // Get existing category
  const { data: existing } = await serviceClient
    .from("offering_categories")
    .select("id, account_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  if (!existing.account_id) {
    return NextResponse.json({ error: "Cannot edit global categories" }, { status: 403 });
  }

  // Verify membership (admin+)
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", existing.account_id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build updates
  const updates: Record<string, unknown> = {};
  if (body?.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
    }
    updates.name = name;
    updates.slug = slugify(name);
  }
  if (body?.description !== undefined) updates.description = body.description?.trim() || null;
  if (body?.parent_id !== undefined) updates.parent_id = body.parent_id || null;
  if (body?.sort_order !== undefined) updates.sort_order = body.sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await serviceClient
    .from("offering_categories")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    console.error("[categories] update error:", updateError);
    if (updateError.code === "23505") {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }

  return NextResponse.json({ category: updated });
}

// DELETE /api/offerings/categories/[id]
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

  // Get existing category
  const { data: existing } = await serviceClient
    .from("offering_categories")
    .select("id, account_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  if (!existing.account_id) {
    return NextResponse.json({ error: "Cannot delete global categories" }, { status: 403 });
  }

  // Verify membership (admin+)
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", existing.account_id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Check if category has offerings
  const { count } = await serviceClient
    .from("offerings")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: `Cannot delete category with ${count} offering(s). Reassign them first.` },
      { status: 400 }
    );
  }

  // Check if category has children
  const { count: childCount } = await serviceClient
    .from("offering_categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);

  if (childCount && childCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete category with ${childCount} subcategory(ies). Delete them first.` },
      { status: 400 }
    );
  }

  const { error: deleteError } = await serviceClient
    .from("offering_categories")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[categories] delete error:", deleteError);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
