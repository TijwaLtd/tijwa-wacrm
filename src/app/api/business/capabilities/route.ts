// ============================================================
// /api/business/capabilities - Business capability management
//
// GET    /api/business/capabilities         - List all capabilities
// GET    /api/business/capabilities/account - Get account capabilities
// POST   /api/business/capabilities         - Update account capabilities
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isValidBusinessType, getRecommendedCapabilityKeys } from "@/lib/business/capabilities";

// GET /api/business/capabilities - List all system capabilities
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: capabilities, error } = await supabase
    .from("business_capabilities")
    .select("*")
    .order("category")
    .order("name");

  if (error) {
    console.error("[capabilities] list error:", error);
    return NextResponse.json({ error: "Failed to load capabilities" }, { status: 500 });
  }

  return NextResponse.json({ capabilities: capabilities ?? [] });
}

// POST /api/business/capabilities - Update account capabilities
export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const accountId = typeof body?.account_id === "string" ? body.account_id : null;
  const businessType = typeof body?.business_type === "string" ? body.business_type : null;
  const capabilities = Array.isArray(body?.capabilities) ? body.capabilities : null;

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  // Verify caller has admin+ role
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Validate and update business type if provided
  if (businessType !== null) {
    if (businessType !== "" && !isValidBusinessType(businessType)) {
      return NextResponse.json({ error: "Invalid business type" }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from("accounts")
      .update({
        business_type: businessType || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("[capabilities] update business type error:", updateError);
      return NextResponse.json({ error: "Failed to update business type" }, { status: 500 });
    }

    // If business type changed, setup recommended capabilities
    if (businessType && isValidBusinessType(businessType)) {
      const recommendedKeys = getRecommendedCapabilityKeys(businessType);

      // Get all capability keys
      const { data: allCapabilities } = await serviceClient
        .from("business_capabilities")
        .select("key");

      if (allCapabilities) {
        // Upsert capabilities - enable recommended ones, disable others
        const capabilityUpserts = allCapabilities.map((cap) => ({
          account_id: accountId,
          capability_key: cap.key,
          is_enabled: recommendedKeys.includes(cap.key),
        }));

        const { error: upsertError } = await serviceClient
          .from("account_capabilities")
          .upsert(capabilityUpserts, {
            onConflict: "account_id,capability_key",
          });

        if (upsertError) {
          console.error("[capabilities] upsert error:", upsertError);
          // Non-critical - continue
        }
      }
    }
  }

  // Update individual capabilities if provided
  if (capabilities && Array.isArray(capabilities)) {
    const upserts = capabilities.map((cap: { key: string; enabled: boolean; config?: Record<string, unknown> }) => ({
      account_id: accountId,
      capability_key: cap.key,
      is_enabled: cap.enabled,
      config: cap.config ?? {},
    }));

    const { error: upsertError } = await serviceClient
      .from("account_capabilities")
      .upsert(upserts, {
        onConflict: "account_id,capability_key",
      });

    if (upsertError) {
      console.error("[capabilities] upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to update capabilities" }, { status: 500 });
    }
  }

  // Fetch updated account capabilities
  const { data: account } = await serviceClient
    .from("accounts")
    .select("business_type")
    .eq("id", accountId)
    .single();

  const { data: updatedCapabilities } = await serviceClient
    .rpc("get_account_capabilities", { p_account_id: accountId });

  return NextResponse.json({
    ok: true,
    business_type: account?.business_type ?? null,
    capabilities: updatedCapabilities ?? [],
  });
}
