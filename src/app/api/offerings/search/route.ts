// ============================================================
// /api/offerings/search - Search offerings
//
// GET /api/offerings/search?q=query&account_id=xxx
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

// GET /api/offerings/search - Search offerings by text
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const accountId = searchParams.get("account_id");
  const type = searchParams.get("type");
  const categoryId = searchParams.get("category_id");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  if (!query || query.trim().length === 0) {
    return NextResponse.json({ error: "Search query is required" }, { status: 400 });
  }

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

  // Search using RPC
  const { data: results, error } = await serviceClient
    .rpc("search_offerings", {
      p_account_id: accountId,
      p_query: query,
      p_type: type || null,
      p_category_id: categoryId || null,
      p_status: "active",
      p_limit: limit,
      p_offset: offset,
    });

  if (error) {
    console.error("[offerings] search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json({ results: results ?? [] });
}
