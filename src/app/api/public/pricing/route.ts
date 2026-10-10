// ============================================================
// GET /api/public/pricing — public plan pricing.
//
// No auth required. Returns the same shape as /api/plans
// (features nested object from get_plan_features RPC) so the
// pricing page uses identical types and rendering to billing.
// Response cached for 5 minutes.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PLAN_IDS = ["business", "growth", "enterprise"] as const;

const PLAN_META: Record<string, { name: string; description: string; cta: string; recommended?: boolean }> = {
  business: {
    name: "Business",
    description: "For businesses actively selling and supporting customers.",
    cta: "Get Started",
  },
  growth: {
    name: "Growth",
    description: "For teams with higher conversation volume.",
    cta: "Upgrade",
    recommended: true,
  },
  enterprise: {
    name: "Enterprise",
    description: "Custom solutions for hotels, clinics, schools, and multi-branch businesses.",
    cta: "Contact Sales",
  },
};

export const revalidate = 300;

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const results = await Promise.all(
      PLAN_IDS.map(async (planId) => {
        const { data, error } = await supabase.rpc("get_plan_features", {
          p_plan: planId,
        });
        if (error || !data) return null;
        return {
          id: planId,
          ...PLAN_META[planId],
          features: data,
          price_kes: data.price_kes ?? 0,
          price_usd: data.price_usd ?? 0,
        };
      }),
    );

    const plans = results.filter(Boolean);
    if (plans.length === 0) {
      return NextResponse.json({ error: "No plans available" }, { status: 503 });
    }

    return NextResponse.json(
      { plans },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load pricing" }, { status: 500 });
  }
}
