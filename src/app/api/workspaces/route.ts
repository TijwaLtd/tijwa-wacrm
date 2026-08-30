// ============================================================
// /api/workspaces - Workspace CRUD
//
// GET  /api/workspaces     - List user's workspaces
// POST /api/workspaces     - Create a new workspace
// PATCH /api/workspaces    - Update a workspace
// DELETE /api/workspaces   - Delete/leave a workspace
//
// Subdomain is auto-generated from name using slugify().
// i18n maintained via next-intl.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isValidBusinessType, type BusinessType } from "@/lib/business/capabilities";

// GET /api/workspaces - List all workspaces for current user
// Uses serviceClient to bypass RLS (avoids infinite recursion on account_memberships)
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: memberships, error } = await serviceClient
    .from("account_memberships")
    .select(`
      role,
      joined_at,
      account:accounts!inner(
        id,
        name,
        subdomain,
        created_at,
        tenant_settings!inner(
          display_name,
          logo_url,
          plan,
          subscription_status
        )
      )
    `)
    .eq("user_id", user.id)
    .order("joined_at", { ascending: false });

  if (error) {
    console.error("[workspaces] list error:", error);
    return NextResponse.json({ error: "Failed to load workspaces" }, { status: 500 });
  }

  return NextResponse.json({ workspaces: memberships ?? [] });
}

// POST /api/workspaces - Create a new workspace
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (!user) {
    console.error("[workspaces] auth error:", userError);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Also get session to verify auth context
  const { data: { session } } = await supabase.auth.getSession();
  console.log("[workspaces] user.id:", user.id);
  console.log("[workspaces] session?.user.id:", session?.user?.id);
  console.log("[workspaces] session?.user.email:", session?.user?.email);

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const businessType = typeof body?.business_type === "string" ? body.business_type : null;

  if (!name || name.length < 2) {
    return NextResponse.json({ error: "Workspace name must be at least 2 characters" }, { status: 400 });
  }

  if (name.length > 63) {
    return NextResponse.json({ error: "Workspace name must be less than 63 characters" }, { status: 400 });
  }

  // Validate business type if provided
  if (businessType && !isValidBusinessType(businessType)) {
    return NextResponse.json({ error: "Invalid business type" }, { status: 400 });
  }

  // Generate subdomain from name (workspace.tijwa-crm.com pattern)
  let subdomain = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // Auto-generate unique subdomain if the raw one is taken
  let attempt = 0;
  let subdomainAvailable = false;
  while (!subdomainAvailable && attempt < 10) {
    const checkSubdomain = attempt === 0 ? subdomain : `${subdomain}-${attempt}`;
    const { data } = await supabase.rpc("is_subdomain_available", {
      p_subdomain: checkSubdomain,
    });
    if (data) {
      subdomain = checkSubdomain;
      subdomainAvailable = true;
    }
    attempt++;
  }

  if (!subdomainAvailable) {
    // Last resort: append a random suffix
    subdomain = `${subdomain}-${Date.now().toString(36).slice(-6)}`;
  }

  // Use helper function to create workspace (bypasses RLS issues)
  const logoUrl = typeof body?.logo_url === 'string' ? body.logo_url : null;
  const { data: accountId, error: accountError } = await supabase.rpc("create_workspace", {
    p_name: name,
    p_subdomain: subdomain,
    p_owner_user_id: user.id,
    p_logo_url: logoUrl,
  });

  if (accountError) {
    console.error("[workspaces] create workspace error:", accountError);
    if (accountError.code === '23505') {
      return NextResponse.json({ error: "A workspace with this name already exists." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create workspace: " + accountError.message }, { status: 500 });
  }

  // Update business type if provided
  if (businessType && accountId) {
    await supabase
      .from("accounts")
      .update({ business_type: businessType })
      .eq("id", accountId);

    // Enable all capabilities by default
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: allCapabilities } = await serviceClient
      .from("business_capabilities")
      .select("key");

    if (allCapabilities) {
      const capabilityUpserts = allCapabilities.map((cap) => ({
        account_id: accountId,
        capability_key: cap.key,
        is_enabled: true,
      }));

      await serviceClient
        .from("account_capabilities")
        .upsert(capabilityUpserts, {
          onConflict: "account_id,capability_key",
        });
    }
  }

  // Fetch the created workspace with all details
  const { data: workspace } = await supabase
    .from("accounts")
    .select(`
      id,
      name,
      subdomain,
      created_at,
      tenant_settings!inner(
        display_name,
        logo_url,
        plan,
        subscription_status
      )
    `)
    .eq("id", accountId)
    .single();

  return NextResponse.json({ ok: true, workspace }, { status: 201 });
}

// PATCH /api/workspaces - Update workspace settings
export async function PATCH(request: Request) {
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
  const updates: Record<string, unknown> = {};

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  // Verify caller has admin+ role (use serviceClient to avoid RLS recursion)
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update account name
  if (typeof body?.name === "string" && body.name.trim()) {
    const newName = body.name.trim();
    if (newName.length < 2 || newName.length > 63) {
      return NextResponse.json({ error: "Name must be 2-63 characters" }, { status: 400 });
    }
    updates.name = newName;
  }

  // Update tenant_settings
  const settingsUpdates: Record<string, unknown> = {};
  if (typeof body?.display_name === "string") {
    settingsUpdates.display_name = body.display_name.trim() || null;
  }
  if (typeof body?.logo_url === "string") {
    settingsUpdates.logo_url = body.logo_url.trim() || null;
  }
  if (typeof body?.accent_color === "string") {
    settingsUpdates.accent_color = body.accent_color.trim() || null;
  }
  if (typeof body?.plan === "string" && ["starter", "business", "growth", "enterprise"].includes(body.plan)) {
    settingsUpdates.plan = body.plan;
  }

  // Update account if there are changes
  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from("accounts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", accountId);

    if (updateError) {
      console.error("[workspaces] update account error:", updateError);
      return NextResponse.json({ error: "Failed to update workspace" }, { status: 500 });
    }

    // If name changed, update subdomain if it was auto-generated
    if (typeof updates.name === "string" && membership.role === "owner") {
      const newSubdomain = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      // Auto-generate unique subdomain if the raw one is taken
      let attempt = 0;
      let subdomainUpdated = false;
      while (!subdomainUpdated && attempt < 10) {
        const checkSubdomain = attempt === 0 ? newSubdomain : `${newSubdomain}-${attempt}`;
        const { data: available } = await supabase.rpc("is_subdomain_available", {
          p_subdomain: checkSubdomain,
        });

        if (available) {
          await supabase
            .from("accounts")
            .update({ subdomain: checkSubdomain })
            .eq("id", accountId);
          subdomainUpdated = true;
        }
        attempt++;
      }

      // If all attempts failed, skip subdomain update (keep old one)
    }
  }

  // Update tenant_settings if there are changes
  if (Object.keys(settingsUpdates).length > 0) {
    const { error: settingsError } = await supabase
      .from("tenant_settings")
      .update({ ...settingsUpdates, updated_at: new Date().toISOString() })
      .eq("account_id", accountId);

    if (settingsError) {
      console.error("[workspaces] update settings error:", settingsError);
      return NextResponse.json({ error: "Failed to update workspace settings" }, { status: 500 });
    }
  }

  // Fetch updated workspace
  const { data: workspace } = await supabase
    .from("accounts")
    .select(`
      id,
      name,
      subdomain,
      created_at,
      tenant_settings!inner(
        display_name,
        logo_url,
        accent_color,
        plan,
        subscription_status
      )
    `)
    .eq("id", accountId)
    .single();

  return NextResponse.json({ ok: true, workspace });
}

// DELETE /api/workspaces - Leave or delete workspace
export async function DELETE(request: Request) {
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

  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  // Get membership (use serviceClient to avoid RLS recursion)
  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this workspace" }, { status: 404 });
  }

  // Owners can delete the workspace; others just leave
  if (membership.role === "owner") {
    // Check if there are other members
    const { data: otherMembers } = await serviceClient
      .from("account_memberships")
      .select("user_id")
      .eq("account_id", accountId)
      .neq("user_id", user.id)
      .limit(1);

    if (otherMembers && otherMembers.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete workspace with other members. Transfer ownership first." },
        { status: 400 }
      );
    }

    // Delete the workspace (cascades to tenant_settings, memberships, etc.)
    const { error: deleteError } = await supabase
      .from("accounts")
      .delete()
      .eq("id", accountId);

    if (deleteError) {
      console.error("[workspaces] delete error:", deleteError);
      return NextResponse.json({ error: "Failed to delete workspace" }, { status: 500 });
    }
  } else {
    // Just remove the membership (leave workspace)
    const { error: leaveError } = await supabase
      .from("account_memberships")
      .delete()
      .eq("user_id", user.id)
      .eq("account_id", accountId);

    if (leaveError) {
      console.error("[workspaces] leave error:", leaveError);
      return NextResponse.json({ error: "Failed to leave workspace" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
