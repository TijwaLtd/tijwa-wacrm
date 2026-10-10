// ============================================================
// Pricing page (/pricing) — public, DB-driven plan comparison.
// Renders identically to the billing page's plan section:
// same PlanFeatures shape, same FEATURE_ROWS, same annual toggle.
// ============================================================

import type { Metadata } from "next";
import Link from "next/link";
import { Check, Star, Lock } from "lucide-react";
import {
  fetchPublicPlans,
  formatPrice,
  formatLimit,
  type PublicPlan,
  type PlanFeatures,
} from "@/lib/marketing/pricing";
import { cn } from "@/lib/utils";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing — Tijwa WhatsApp CRM Kenya",
  description:
    "Transparent pricing in Kenyan Shillings. Plans from KES 5,000/month. Pay with M-Pesa or card. Annual billing saves 18%. Meta WhatsApp charges billed separately.",
  keywords: [
    "WhatsApp CRM pricing Kenya",
    "CRM cost Nairobi",
    "M-Pesa billing CRM",
    "WhatsApp Business API pricing Kenya",
  ],
  openGraph: {
    title: "Pricing — Tijwa WhatsApp CRM Kenya",
    description:
      "Plans from KES 5,000/month. Pay with M-Pesa. Annual billing saves 18%.",
    type: "website",
    locale: "en_KE",
    siteName: "Tijwa",
  },
  robots: { index: true, follow: true },
};

const FEATURE_ROWS = [
  {
    key: "team",
    label: "Team members",
    getValue: (f: PlanFeatures) => formatLimit(f.max_team_members),
  },
  {
    key: "contacts",
    label: "Contacts",
    getValue: (f: PlanFeatures) => formatLimit(f.max_contacts),
  },
  {
    key: "whatsapp",
    label: "WhatsApp numbers",
    getValue: (f: PlanFeatures) => formatLimit(f.max_whatsapp_numbers),
  },
  {
    key: "broadcasts",
    label: "Broadcasts/mo",
    getValue: (f: PlanFeatures) => formatLimit(f.max_broadcasts_per_month),
  },
  {
    key: "automations",
    label: "Automations",
    getValue: (f: PlanFeatures) => formatLimit(f.max_automations),
  },
  {
    key: "flows",
    label: "Conversational flows",
    getValue: (f: PlanFeatures) => formatLimit(f.max_flows),
  },
  {
    key: "pipelines",
    label: "Deal pipelines",
    getValue: (f: PlanFeatures) => formatLimit(f.max_pipelines),
  },
  {
    key: "deals",
    label: "Deals/pipeline",
    getValue: (f: PlanFeatures) => formatLimit(f.max_deals_per_pipeline),
  },
  {
    key: "ai_credits",
    label: "AI credits/mo",
    getValue: (f: PlanFeatures) => formatLimit(f.ai_credits_per_month),
  },
  {
    key: "ai_conversations",
    label: "AI conversations/mo",
    getValue: (f: PlanFeatures) => formatLimit(f.ai_conversations_per_month),
  },
  {
    key: "ai_assistant",
    label: "AI assistant",
    getValue: (f: PlanFeatures) => f.has_ai_assistant,
  },
  {
    key: "knowledge",
    label: "Knowledge base",
    getValue: (f: PlanFeatures) => f.has_knowledge_base,
  },
  {
    key: "analytics",
    label: "Analytics",
    getValue: (f: PlanFeatures) => f.has_analytics,
  },
  {
    key: "priority_support",
    label: "Priority support",
    getValue: (f: PlanFeatures) => f.has_priority_support,
  },
  {
    key: "integrations",
    label: "Custom integrations",
    getValue: (f: PlanFeatures) => f.has_custom_integrations,
  },
];

const FAQS = [
  {
    q: "Are Meta WhatsApp charges included in the price?",
    a: "No. Meta charges conversation fees directly to your Meta billing account. These are separate from Tijwa's subscription. You set up your own Meta billing — we provide step-by-step guidance during onboarding.",
  },
  {
    q: "How do I pay?",
    a: "Pay with M-Pesa or card. M-Pesa is the most popular option for Kenyan businesses. Payment is processed securely — we never store your card details or M-Pesa PIN.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes. Upgrade or downgrade anytime from your workspace settings. Upgrades take effect immediately; downgrades take effect at your next billing cycle. No penalties, no lock-in.",
  },
  {
    q: "What are extra seats?",
    a: "Each plan includes a set number of team members (seats). If you need more, additional seats cost KES 750/month each. You can add or remove seats anytime.",
  },
  {
    q: "What are AI credits?",
    a: "AI credits power the AI assistant — drafting replies, answering customer questions from your knowledge base, and handling first-contact enquiries. 1 credit = KES 10. You can top up anytime.",
  },
  {
    q: "Is there a discount for annual billing?",
    a: "Yes. Annual billing saves 18% compared to paying monthly. You pay for 12 months upfront and get 14 months' access.",
  },
  {
    q: "Is Tijwa compliant with Kenya's Data Protection Act?",
    a: "Yes. Tijwa is designed around the Kenya Data Protection Act 2019. Your data is stored securely, you own your customer data, and you can export it at any time.",
  },
  {
    q: "What happens if I don't choose a plan?",
    a: "Your workspace is created with all your data intact, but sending and team features stay paused until you pick a plan. Nothing is deleted.",
  },
] as const;

export default async function PricingPage() {
  let plans: PublicPlan[] = [];
  try {
    plans = await fetchPublicPlans();
  } catch {
    // renders empty state below
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Tijwa Pricing",
    description:
      "Transparent WhatsApp CRM pricing in Kenyan Shillings. Plans from KES 5,000/month.",
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: `${plan.name} plan`,
      price: plan.price_kes,
      priceCurrency: "KES",
      category: "subscription",
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="py-16 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="max-w-2xl">
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
              Simple pricing in Kenyan Shillings.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Upgrade when you&apos;re ready. Annual billing saves 18%. Meta WhatsApp
              charges are billed separately by Meta.
            </p>
          </div>

          {plans.length > 0 ? (
            <>
              {/* Plan cards — same layout as billing page */}
              <div className="relative isolate mt-14 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} plan={plan} />
                ))}
              </div>

              {/* Seat note */}
              <div className="mt-6 rounded-lg border border-border bg-muted/50 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Need more seats? Additional team members are KES 750/mo each. Each plan
                  includes its own seat allowance.
                </p>
              </div>

              {/* Comparison table — same rows as billing page */}
              <div className="mt-20">
                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                  Compare plans in detail.
                </h2>
                <div className="mt-8 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-3 pr-4 text-left font-medium text-muted-foreground">
                          Feature
                        </th>
                        {plans.map((plan) => (
                          <th
                            key={plan.id}
                            className="py-3 px-4 text-center font-semibold text-foreground"
                          >
                            {plan.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {FEATURE_ROWS.map((row) => (
                        <tr key={row.key} className="border-b border-border/50">
                          <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
                          {plans.map((plan) => {
                            const value = row.getValue(plan.features);
                            return (
                              <td key={plan.id} className="py-3 px-4 text-center">
                                {typeof value === "boolean" ? (
                                  value ? (
                                    <Check className="mx-auto size-4 text-primary" />
                                  ) : (
                                    <Lock className="mx-auto size-3.5 text-muted-foreground/30" />
                                  )
                                ) : (
                                  <span className="font-medium text-foreground">{value}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-16 rounded-2xl border border-border bg-card p-12 text-center">
              <p className="text-lg font-medium text-foreground">
                Pricing is temporarily unavailable.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Please check back in a few minutes or{" "}
                <a
                  href="mailto:sales@tijwa.com"
                  className="text-primary underline underline-offset-2"
                >
                  contact sales
                </a>{" "}
                for current pricing.
              </p>
            </div>
          )}

          {/* FAQ */}
          <div className="mt-24 border-t border-border/60 pt-16">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Pricing questions, answered.
            </h2>
            <div className="mt-10 grid gap-x-12 gap-y-10 lg:grid-cols-2">
              {FAQS.map((faq) => (
                <div key={faq.q}>
                  <h3 className="text-base font-semibold text-foreground">{faq.q}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="mt-20 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center sm:p-12">
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Ready to get started?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
              Create your workspace, pick a plan, and start managing WhatsApp like a real
              business system.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex h-11 items-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Get started
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function PlanCard({ plan }: { plan: PublicPlan }) {
  const isEnterprise = plan.id === "enterprise";
  const f = plan.features;

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6",
        plan.recommended
          ? "border-primary/40 bg-primary/5 shadow-lg shadow-primary/5"
          : "border-border bg-card",
      )}
    >
      {plan.recommended && (
        <div className="absolute -top-2.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-0.5 text-xs font-semibold text-primary-foreground shadow-md">
          <Star className="size-3" /> Recommended
        </div>
      )}

      <div className="text-center">
        <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
        <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
          {isEnterprise ? "Custom" : formatPrice(plan)}
        </p>
        {f.ai_credits_per_month > 0 && (
          <div className="mt-2 flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold text-primary">
              {f.ai_credits_per_month.toLocaleString()} credits/mo
            </span>
            <span className="text-xs text-muted-foreground">
              ~{f.ai_conversations_per_month.toLocaleString()} AI replies
            </span>
          </div>
        )}
        {f.ai_credit_check_exempt && plan.id === "starter" && (
          <div className="mt-2 flex flex-col items-center gap-0.5">
            <span className="text-sm font-semibold text-primary">No AI credit check</span>
            <span className="text-xs text-muted-foreground">First package</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-sm leading-relaxed text-muted-foreground">
        {plan.description}
      </p>

      <ul className="mt-6 flex-1 space-y-2.5">
        <PlanFeature>{formatLimit(f.max_team_members)} seats</PlanFeature>
        <PlanFeature>{formatLimit(f.max_contacts)} contacts</PlanFeature>
        <PlanFeature>{formatLimit(f.max_automations)} automations</PlanFeature>
        <PlanFeature>{formatLimit(f.max_flows)} flows</PlanFeature>
        <PlanFeature>
          {formatLimit(f.max_pipelines)} pipeline{f.max_pipelines !== 1 ? "s" : ""}
        </PlanFeature>
        <PlanFeatureBool enabled={f.has_ai_assistant}>AI assistant</PlanFeatureBool>
        <PlanFeatureBool enabled={f.has_knowledge_base}>Knowledge base</PlanFeatureBool>
        <PlanFeatureBool enabled={f.has_analytics}>Analytics</PlanFeatureBool>
        <PlanFeatureBool enabled={f.has_priority_support}>Priority support</PlanFeatureBool>
      </ul>

      <div className="mt-6">
        {isEnterprise ? (
          <a
            href="mailto:sales@tijwa.com"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            {plan.cta}
          </a>
        ) : (
          <Link
            href="/signup"
            className={cn(
              "inline-flex h-10 w-full items-center justify-center rounded-lg text-sm font-semibold transition-colors",
              plan.recommended
                ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                : "border border-border text-foreground hover:bg-muted",
            )}
          >
            {plan.cta}
          </Link>
        )}
      </div>
    </div>
  );
}

function PlanFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-muted-foreground">
      <Check className="size-4 shrink-0 text-primary" />
      {children}
    </li>
  );
}

function PlanFeatureBool({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {enabled ? (
        <Check className="size-4 shrink-0 text-primary" />
      ) : (
        <Lock className="size-3.5 shrink-0 text-muted-foreground/30" />
      )}
      <span className={enabled ? "text-muted-foreground" : "text-muted-foreground/50"}>
        {children}
      </span>
    </li>
  );
}
