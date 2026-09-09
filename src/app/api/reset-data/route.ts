// ============================================================
// POST /api/reset-data
//
// Deletes ALL data for the current account. Admin+ only.
// Does NOT delete the account itself or the auth user — just
// wipes the catalog, orders, bookings, conversations, flows,
// and everything else. Re-seed via POST /api/seed-data after.
//
// For a full nuclear reset (including account + auth user),
// use supabase/nuke_account_data.sql in the SQL Editor.
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";

// Tables to wipe, in dependency order (children first).
// Each entry: [table_name, filter_column]
const TABLES: [string, string][] = [
  // Conversations & messages
  ["messages", "conversation_id"],
  ["conversation_participants", "conversation_id"],
  ["conversations", "account_id"],

  // Contacts
  ["contacts", "account_id"],

  // Offerings & commerce
  ["offering_embeddings", "account_id"],
  ["offering_media", "account_id"],
  ["catalogue_availability", "account_id"],
  ["catalogue_sources", "account_id"],
  ["order_items", "order_id"], // deleted via orders below
  ["orders", "account_id"],
  ["bookings", "account_id"],
  ["offerings", "account_id"],
  ["offering_categories", "account_id"],

  // Capabilities & flows
  ["account_capabilities", "account_id"],
  ["flow_template_installs", "account_id"],
  ["flow_runs", "account_id"],
  ["flows", "account_id"],
  ["automations", "account_id"],

  // Broadcasts & knowledge
  ["broadcasts", "account_id"],
  ["knowledge_base", "account_id"],

  // Audit
  ["audit_log", "account_id"],

  // Pipelines & deals
  ["deal_activity", "account_id"],
  ["deals", "account_id"],
  ["deal_stages", "account_id"],
  ["pipelines", "account_id"],

  // Team
  ["agent_skills", "account_id"],
  ["member_presence", "account_id"],

  // Invitations
  ["account_invitations", "account_id"],

  // Billing
  ["seat_purchases", "account_id"],
  ["subscriptions", "account_id"],
  ["tenant_settings", "account_id"],

  // Memberships (last before account)
  ["account_memberships", "account_id"],
];

// Special handling: order_items needs to be deleted by order_id,
// not account_id. We delete them before orders.
const ORDER_ITEMS_DELETE = `
  DELETE FROM order_items
  WHERE order_id IN (SELECT id FROM orders WHERE account_id = $1)
`;

export async function POST() {
  try {
    const ctx = await requireRole("admin");

    const limit = checkRateLimit(
      `admin:resetData:${ctx.userId}`,
      RATE_LIMITS.adminAction,
    );
    if (!limit.success) return rateLimitResponse(limit);

    const accountId = ctx.accountId;
    const deleted: Record<string, number> = {};
    const errors: string[] = [];

    // Delete order_items first (special case — no account_id column)
    const { count: orderItemsCount } = await ctx.serviceClient
      .from("order_items")
      .delete({ count: "exact" })
      .in("order_id", 
        // Subquery: get order IDs for this account
        // Supabase doesn't support subqueries in .in(), so we fetch first
        (await ctx.serviceClient
          .from("orders")
          .select("id")
          .eq("account_id", accountId)
        ).data?.map((o: { id: string }) => o.id) ?? []
      );
    if (orderItemsCount !== null) deleted["order_items"] = orderItemsCount;

    // Delete from each table
    for (const [table, filterCol] of TABLES) {
      try {
        const { count, error } = await ctx.serviceClient
          .from(table)
          .delete({ count: "exact" })
          .eq(filterCol, accountId);

        if (error) {
          // Table might not exist — skip silently
          if (error.code === "42P01") continue;
          errors.push(`${table}: ${error.message}`);
        } else {
          deleted[table] = count ?? 0;
        }
      } catch {
        // Table doesn't exist or RLS blocks — skip
        continue;
      }
    }

    // Don't delete the account itself — just wipe its data.
    // The user stays logged in and can re-seed.

    return NextResponse.json({
      ok: true,
      deleted,
      total_tables_wiped: Object.keys(deleted).length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
