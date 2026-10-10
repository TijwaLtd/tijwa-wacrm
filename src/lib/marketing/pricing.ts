// ============================================================
// Shared pricing types + fetch helper for the public pricing
// endpoint. Mirrors the Plan/PlanFeatures shape used by the
// billing page so both surfaces render identically.
// ============================================================

export interface PlanFeatures {
  max_contacts: number;
  max_team_members: number;
  max_broadcasts_per_month: number;
  max_automations: number;
  max_flows: number;
  max_pipelines: number;
  max_deals_per_pipeline: number;
  ai_replies_per_month: number;
  ai_credits_per_month: number;
  ai_credit_check_exempt: boolean;
  ai_conversations_per_month: number;
  max_whatsapp_numbers: number;
  has_ai_assistant: boolean;
  has_knowledge_base: boolean;
  has_analytics: boolean;
  has_priority_support: boolean;
  has_custom_integrations: boolean;
  price_kes: number;
  price_usd: number;
}

export interface PublicPlan {
  id: string;
  name: string;
  description: string;
  cta: string;
  recommended?: boolean;
  price_kes: number;
  price_usd: number;
  features: PlanFeatures;
}

export const ANNUAL_DISCOUNT = 0.18;

export function formatPrice(
  plan: PublicPlan,
  period: "monthly" | "annual" = "monthly",
): string {
  if (plan.price_kes === 0) return "Custom";
  if (period === "annual") {
    const annual = Math.round(plan.price_kes * 12 * (1 - ANNUAL_DISCOUNT));
    return `KES ${annual.toLocaleString()}/yr`;
  }
  return `KES ${plan.price_kes.toLocaleString()}/mo`;
}

export function formatLimit(val: number | undefined | null): string {
  if (val == null || val >= 999999) return "Unlimited";
  return val.toLocaleString();
}

export async function fetchPublicPlans(): Promise<PublicPlan[]> {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  const res = await fetch(`${base}/api/public/pricing`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error("Failed to load pricing");
  const data = await res.json();
  return data.plans as PublicPlan[];
}
