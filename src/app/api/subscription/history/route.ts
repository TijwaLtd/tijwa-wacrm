// ============================================================
// GET /api/subscription/history
//
// Returns billing history for the current account.
// ============================================================

import { NextResponse } from "next/server";
import { requireRole, toErrorResponse } from "@/lib/auth/account";

export async function GET() {
  try {
    const { serviceClient, accountId } = await requireRole('viewer');

    const { data, error } = await serviceClient
      .from("billing_history")
      .select("id, event_type, description, amount_kes, credits_delta, metadata, created_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ history: [] });
    }

    return NextResponse.json({ history: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
