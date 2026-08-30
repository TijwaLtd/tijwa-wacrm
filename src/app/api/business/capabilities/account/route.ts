// ============================================================
// /api/business/capabilities/account - Get account capabilities
//
// GET /api/business/capabilities/account?account_id=xxx
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const supabase = await createClient();
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  // Verify caller is a member of this account
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this account" }, { status: 403 });
  }

  // Get account business type
  const { data: account } = await serviceClient
    .from("accounts")
    .select("business_type")
    .eq("id", accountId)
    .single();

  // Get account capabilities using RPC
  const { data: capabilities, error } = await serviceClient
    .rpc("get_account_capabilities", { p_account_id: accountId });

  if (error) {
    console.error("[capabilities] get error:", error);
    return NextResponse.json({ error: "Failed to load capabilities" }, { status: 500 });
  }

  // Get enabled capability keys using RPC
  const { data: enabledKeys } = await serviceClient
    .rpc("get_enabled_capability_keys", { p_account_id: accountId });

  return NextResponse.json({
    business_type: account?.business_type ?? null,
    capabilities: capabilities ?? [],
    enabled_keys: enabledKeys ?? [],
  });
}
