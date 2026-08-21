// ============================================================
// GET /api/workspaces/with-counts
//
// Returns user's workspaces with notification counts for each.
// Used by the workspace switcher in the header.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Use RPC to bypass RLS infinite recursion on account_memberships
  const { data: accounts, error } = await supabase.rpc("get_user_accounts", {
    p_user_id: user.id,
  });

  if (error) {
    console.error("[workspaces/with-counts] error:", error);
    return NextResponse.json({ error: "Failed to load workspaces" }, { status: 500 });
  }

  // Get unread notification counts for each workspace
  const workspacesWithCounts = await Promise.all(
    (accounts ?? []).map(async (account: any) => {
      const accountId = account.account_id;

      // Count unread notifications for this workspace
      const { count: unreadCount } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("account_id", accountId)
        .eq("read", false);

      return {
        account_id: accountId,
        account_name: account.account_name ?? "Unknown",
        role: account.role,
        subdomain: account.subdomain,
        unread_notifications: unreadCount ?? 0,
      };
    })
  );

  return NextResponse.json({ workspaces: workspacesWithCounts });
}
