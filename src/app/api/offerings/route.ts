// ============================================================
// /api/offerings - Offering CRUD
//
// GET  /api/offerings     - List offerings for account
// POST /api/offerings     - Create a new offering
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { slugify, type OfferingType, type OfferingStatus, type PriceType } from "@/lib/business/offerings";

// GET /api/offerings - List all offerings for current account
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const type = searchParams.get("type") as OfferingType | null;
  const status = searchParams.get("status") as OfferingStatus | null;
  const categoryId = searchParams.get("category_id");
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "25");

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

  // Query offerings
  let query = serviceClient
    .from("offerings")
    .select(`
      *,
      category:offering_categories(*),
      media:offering_media(*)
    `, { count: "exact" })
    .eq("account_id", accountId);

  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);
  if (categoryId) query = query.eq("category_id", categoryId);

  const { data: offerings, error, count } = await query
    .order("created_at", { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (error) {
    console.error("[offerings] list error:", error);
    return NextResponse.json({ error: "Failed to load offerings" }, { status: 500 });
  }

  return NextResponse.json({
    offerings: offerings ?? [],
    total: count ?? 0,
    page,
    limit,
  });
}

// POST /api/offerings - Create a new offering
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const accountId = body?.account_id;
  const type = body?.type as OfferingType | undefined;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const shortDescription = typeof body?.short_description === "string" ? body.short_description.trim() : null;
  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const categoryId = body?.category_id || null;
  const price = body?.price != null ? parseFloat(body.price) : null;
  const currency = typeof body?.currency === "string" ? body.currency : null;
  const priceType = (body?.price_type || "fixed") as PriceType;
  const referenceCode = typeof body?.reference_code === "string" ? body.reference_code.trim() : null;
  const metadata = body?.metadata || {};
  const status = (body?.status || "draft") as OfferingStatus;

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  if (!type) {
    return NextResponse.json({ error: "type is required" }, { status: 400 });
  }

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });
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

  if (!membership || !["owner", "admin", "agent"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify offering type is allowed by capabilities
  const { data: allowedTypes } = await serviceClient
    .rpc("get_allowed_offering_types", { p_account_id: accountId });

  if (allowedTypes && !allowedTypes.some((t: { offering_type: string }) => t.offering_type === type)) {
    return NextResponse.json({ error: "Offering type not allowed by enabled capabilities" }, { status: 400 });
  }

  // Get default currency from account
  const { data: account } = await serviceClient
    .from("accounts")
    .select("default_currency")
    .eq("id", accountId)
    .single();

  const finalCurrency = currency || account?.default_currency || "USD";

  // Generate slug
  let offeringSlug = slugify(name);
  let attempt = 0;
  let slugAvailable = false;
  while (!slugAvailable && attempt < 10) {
    const checkSlug = attempt === 0 ? offeringSlug : `${offeringSlug}-${attempt}`;
    const { data: existing } = await serviceClient
      .from("offerings")
      .select("id")
      .eq("account_id", accountId)
      .eq("slug", checkSlug)
      .maybeSingle();
    
    if (!existing) {
      offeringSlug = checkSlug;
      slugAvailable = true;
    }
    attempt++;
  }

  if (!slugAvailable) {
    offeringSlug = `${offeringSlug}-${Date.now().toString(36).slice(-6)}`;
  }

  // Create offering
  const { data: offering, error: createError } = await serviceClient
    .from("offerings")
    .insert({
      account_id: accountId,
      type,
      name,
      slug: offeringSlug,
      short_description: shortDescription,
      description,
      status,
      category_id: categoryId,
      price,
      currency: finalCurrency,
      price_type: priceType,
      reference_code: referenceCode,
      metadata,
    })
    .select()
    .single();

  if (createError) {
    console.error("[offerings] create error:", createError);
    if (createError.code === "23505") {
      return NextResponse.json({ error: "An offering with this name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create offering" }, { status: 500 });
  }

  return NextResponse.json({ offering }, { status: 201 });
}
