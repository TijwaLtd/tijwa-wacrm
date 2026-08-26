// ============================================================
// GET /api/workspaces/[id]
// PATCH /api/workspaces/[id]
//
// Get or update a single workspace by ID.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get workspace details
  const { data: workspace, error } = await supabase
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
    .eq("id", id)
    .single();

  if (error) {
    console.error("[workspaces/[id]] get error:", error);
    return NextResponse.json({ error: "Failed to load workspace" }, { status: 500 });
  }

  return NextResponse.json({ workspace });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify membership and admin role
  const { data: membership } = await supabase
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", id)
    .single();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const updates: Record<string, unknown> = {};

  // Update account
  if (typeof body?.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from("accounts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (updateError) {
      console.error("[workspaces/[id]] update error:", updateError);
      return NextResponse.json({ error: "Failed to update workspace" }, { status: 500 });
    }

    // Update subdomain if name changed and user is owner
    if (typeof updates.name === "string" && membership.role === "owner") {
      const newSubdomain = updates.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: available } = await supabase.rpc("is_subdomain_available", {
        p_subdomain: newSubdomain,
      });

      if (available) {
        await supabase
          .from("accounts")
          .update({ subdomain: newSubdomain })
          .eq("id", id);
      }
    }
  }

  // Update tenant_settings
  const settingsUpdates: Record<string, unknown> = {};
  if (typeof body?.logo_url === "string") {
    settingsUpdates.logo_url = body.logo_url.trim() || null;
  }
  if (typeof body?.accent_color === "string") {
    settingsUpdates.accent_color = body.accent_color.trim() || null;
  }
  if (typeof body?.auto_assign_mode === "string" && ["manual", "round_robin", "load_balanced"].includes(body.auto_assign_mode)) {
    settingsUpdates.auto_assign_mode = body.auto_assign_mode;
  }

  if (Object.keys(settingsUpdates).length > 0) {
    const { error: settingsError } = await supabase
      .from("tenant_settings")
      .update({ ...settingsUpdates, updated_at: new Date().toISOString() })
      .eq("account_id", id);

    if (settingsError) {
      console.error("[workspaces/[id]] update settings error:", settingsError);
      return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
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
    .eq("id", id)
    .single();

  return NextResponse.json({ ok: true, workspace });
}
