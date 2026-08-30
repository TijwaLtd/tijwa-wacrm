// ============================================================
// /api/offerings/categories - Category CRUD
//
// GET  /api/offerings/categories - List categories
// POST /api/offerings/categories - Create category
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/business/offerings";

// GET /api/offerings/categories - List categories for account
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  // Verify membership
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

  // Get global + org-specific categories
  const { data: categories, error } = await serviceClient
    .from("offering_categories")
    .select("*")
    .or(`account_id.is.null,account_id.eq.${accountId}`)
    .order("sort_order");

  if (error) {
    console.error("[categories] list error:", error);
    return NextResponse.json({ error: "Failed to load categories" }, { status: 500 });
  }

  return NextResponse.json({ categories: categories ?? [] });
}

// POST /api/offerings/categories - Create category
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const accountId = body?.account_id;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const parentId = body?.parent_id || null;

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
  }

  // Verify membership (admin+ required)
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

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Generate slug
  let categorySlug = slugify(name);
  let attempt = 0;
  let slugAvailable = false;
  while (!slugAvailable && attempt < 10) {
    const checkSlug = attempt === 0 ? categorySlug : `${categorySlug}-${attempt}`;
    const { data: existing } = await serviceClient
      .from("offering_categories")
      .select("id")
      .eq("account_id", accountId)
      .eq("slug", checkSlug)
      .maybeSingle();
    
    if (!existing) {
      categorySlug = checkSlug;
      slugAvailable = true;
    }
    attempt++;
  }

  if (!slugAvailable) {
    categorySlug = `${categorySlug}-${Date.now().toString(36).slice(-6)}`;
  }

  // Create category
  const { data: category, error: createError } = await serviceClient
    .from("offering_categories")
    .insert({
      account_id: accountId,
      name,
      slug: categorySlug,
      description,
      parent_id: parentId,
    })
    .select()
    .single();

  if (createError) {
    console.error("[categories] create error:", createError);
    if (createError.code === "23505") {
      return NextResponse.json({ error: "A category with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }

  return NextResponse.json({ category }, { status: 201 });
}
