// ============================================================
// Landing page (/) — public marketing page.
// Server component for SEO.
// ============================================================

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MessageSquareText,
  Users,
  Megaphone,
  Zap,
  BarChart3,
  Sparkles,
  Shield,
} from 'lucide-react';

import {
  fetchPublicPlans,
  formatPrice,
  formatLimit,
  type PublicPlan,
} from '@/lib/marketing/pricing';

export const metadata: Metadata = {
  title: 'WhatsApp CRM for Kenyan Businesses — Tijwa',
  description:
    'Turn WhatsApp into your sales team. Shared inbox, AI replies, broadcasts & order tracking for Kenyan businesses. Pay with M-Pesa. From KES 5,000/month.',
  keywords: [
    'WhatsApp CRM Kenya',
    'WhatsApp Business API Kenya',
    'WhatsApp sales tool Nairobi',
    'M-Pesa CRM',
    'WhatsApp customer support Kenya',
    'CRM for small business Kenya',
  ],
  openGraph: {
    title: 'WhatsApp CRM for Kenyan Businesses — Tijwa',
    description:
      'Turn WhatsApp into your sales team. Shared inbox, AI replies, broadcasts, orders & bookings — built for Kenyan businesses.',
    type: 'website',
    locale: 'en_KE',
    siteName: 'Tijwa',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'WhatsApp CRM for Kenyan Businesses — Tijwa',
    description:
      'Turn WhatsApp into your sales team. Shared inbox, AI replies, broadcasts, orders & bookings — built for Kenyan businesses.',
  },
  robots: { index: true, follow: true },
};

const FAQS = [
  {
    q: 'Do I need a separate WhatsApp number?',
    a: 'You can use your existing WhatsApp Business number or register a new one. Tijwa connects through the official WhatsApp Business API — your customers see the same number they already have saved.',
  },
  {
    q: 'Are Meta WhatsApp charges included?',
    a: "No. Meta charges conversation fees directly to your Meta billing account. Tijwa's subscription covers the CRM platform only. You set up Meta billing yourself — we guide you through it.",
  },
  {
    q: 'Can I pay with M-Pesa?',
    a: 'Yes. M-Pesa payment is supported for all plans. You can also pay by card through our payment processor.',
  },
  {
    q: 'Can I change plans later?',
    a: 'Yes. Upgrade or downgrade anytime from your workspace settings. Upgrades take effect immediately; downgrades take effect at your next billing cycle.',
  },
  {
    q: 'How is my customer data protected?',
    a: "Your data is stored securely. We're compliant with Kenya's Data Protection Act 2019. You own your data — export it anytime.",
  },
  {
    q: 'Can my whole team use it?',
    a: 'Yes. Business includes 10 seats, Growth includes 20. Extra seats are KES 750/month each. Everyone shares one inbox with assignments and notes.',
  },
] as const;

export default async function LandingPage() {
  let plans: PublicPlan[] = [];
  try {
    plans = await fetchPublicPlans();
  } catch {
    // pricing section degrades gracefully
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: 'Tijwa',
        url: 'https://tijwa.com',
        logo: 'https://tijwa.com/icons/icon-512.png',
        description: 'WhatsApp CRM platform for Kenyan businesses.',
        address: {
          '@type': 'PostalAddress',
          addressCountry: 'KE',
        },
      },
      {
        '@type': 'SoftwareApplication',
        name: 'Tijwa',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description:
          'WhatsApp CRM with shared inbox, AI replies, broadcasts, orders, and bookings for Kenyan businesses.',
        offers: plans.map((plan) => ({
          '@type': 'Offer',
          name: `${plan.name} plan`,
          price: plan.price_kes,
          priceCurrency: 'KES',
          category: 'subscription',
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Hero ── */}
      <section>
        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-16 sm:px-6 lg:px-8 lg:pt-20 lg:pb-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="max-w-lg">
              <h1 className="text-foreground text-8xl leading-[1.02] font-bold tracking-[-0.03em] sm:text-5xl lg:text-7xl">
                Turn WhatsApp into
                <br />
                your sales team.
              </h1>
              <p className="text-muted-foreground mt-6 max-w-lg text-lg leading-relaxed sm:text-xl">
                Shared inbox, AI-drafted replies, broadcasts, and order tracking
                — everything your team needs to sell on WhatsApp. From
                KES&nbsp;5,000/month.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/signup"
                  className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-12 items-center rounded-lg px-6 text-base font-semibold transition-colors"
                >
                  Get started
                </Link>
                <Link
                  href="/pricing"
                  className="border-border text-foreground hover:bg-muted inline-flex h-12 items-center rounded-lg border px-6 text-base font-medium transition-colors"
                >
                  See pricing
                </Link>
              </div>
              <p className="text-muted-foreground mt-4 text-sm">
                Pay with M-Pesa or card. No lock-in.
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <img
                src="/hero-chat.gif"
                alt="Tijwa WhatsApp CRM — live conversation demo"
                width={360}
                height={380}
                loading="eager"
                className="w-full max-w-[360px] rounded-2xl shadow-2xl ring-1 shadow-black/25 ring-black/10"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust strip ── */}
      <section className="border-border/60 bg-card/50 border-y">
        <div className="mx-auto mt-12 w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: 'Official', label: 'WhatsApp Business API' },
              { value: 'M-Pesa', label: 'local payments' },
              { value: 'DPA 2019', label: 'Kenya compliant' },
              { value: 'KES 5,000', label: 'from / month' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl">
                  {stat.value}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="py-20 lg:py-28">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="text-primary my-8 text-sm font-medium">
            Everything in one place
          </p>
          <h2 className="text-foreground mb-10 max-w-2xl text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Built for how Kenyan businesses actually sell on WhatsApp.
          </h2>

          <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Shared inbox — wide */}
            <div className="border-border bg-card rounded-2xl border p-6 sm:col-span-2 sm:row-span-2">
              <MessageSquareText className="text-primary size-5" />
              <h3 className="text-foreground mt-4 text-lg font-semibold">
                One inbox, whole team
              </h3>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-relaxed">
                Your entire team works from one WhatsApp number. Assign chats,
                leave internal notes, see who replied last — no more forwarding
                screenshots.
              </p>
              <div className="text-muted-foreground mt-6 flex gap-2 text-xs">
                <span className="bg-muted rounded-md px-2 py-1">Assign</span>
                <span className="bg-muted rounded-md px-2 py-1">Notes</span>
                <span className="bg-muted rounded-md px-2 py-1">Tags</span>
                <span className="bg-muted rounded-md px-2 py-1">Search</span>
              </div>
            </div>

            {/* AI — tall */}
            <div className="border-border bg-card rounded-2xl border p-6 sm:col-span-2">
              <Sparkles className="text-primary size-5" />
              <h3 className="text-foreground mt-4 text-base font-semibold">
                AI drafts in your voice
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Trained on your catalogue and FAQs. One click to approve, or let
                AI handle first responses while you sleep.
              </p>
            </div>

            {/* Broadcasts */}
            <div className="border-border bg-card rounded-2xl border p-6">
              <Megaphone className="text-primary size-5" />
              <h3 className="text-foreground mt-4 text-base font-semibold">
                Broadcasts
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Meta-approved template messages to thousands. Track delivery and
                reads.
              </p>
            </div>

            {/* Automations */}
            <div className="border-border bg-card rounded-2xl border p-6">
              <Zap className="text-primary size-5" />
              <h3 className="text-foreground mt-4 text-base font-semibold">
                Automations
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Welcome contacts, route by keyword, send follow-ups. No code
                needed.
              </p>
            </div>

            {/* Analytics */}
            <div className="border-border bg-card rounded-2xl border p-6">
              <BarChart3 className="text-primary size-5" />
              <h3 className="text-foreground mt-4 text-base font-semibold">
                Analytics
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Response times, volume, order totals, pipeline value — at a
                glance.
              </p>
            </div>

            {/* Teams */}
            <div className="border-border bg-card rounded-2xl border p-6">
              <Users className="text-primary size-5" />
              <h3 className="text-foreground mt-4 text-base font-semibold">
                Roles & access
              </h3>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Owner, admin, agent, viewer. New hires see every past
                conversation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="border-border/60 bg-card/50 border-y py-20 lg:py-28">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <p className="text-primary text-sm font-medium">Setup</p>
          <h2 className="text-foreground mt-2 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Up and running in three steps.
          </h2>
          <div className="mt-14 grid gap-10 lg:grid-cols-3">
            {[
              {
                label: '01',
                title: 'Connect your WhatsApp number',
                description:
                  'Link your existing WhatsApp Business Account or register a new number. Takes about 10 minutes.',
              },
              {
                label: '02',
                title: 'Import your contacts',
                description:
                  'CSV upload or sync from your phone. Tags and custom fields keep everyone organised.',
              },
              {
                label: '03',
                title: 'Start selling',
                description:
                  'Reply faster with AI drafts, send broadcasts, automate follow-ups. Your customers never know the difference.',
              },
            ].map((step) => (
              <div key={step.label}>
                <p className="text-primary text-sm font-semibold tracking-wider">
                  {step.label}
                </p>
                <h3 className="text-foreground mt-3 text-base font-semibold">
                  {step.title}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      {plans.length > 0 && (
        <section className="border-border/60 border-t py-20 lg:py-28">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
            <p className="text-primary text-sm font-medium">Pricing</p>
            <h2 className="text-foreground mt-3 text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
              Simple pricing in Kenyan Shillings.
            </h2>
            <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed">
              Annual billing saves 18%. Meta WhatsApp charges are billed
              separately by Meta.
            </p>

            <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:max-w-5xl">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border p-7 ${
                    plan.recommended
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border bg-card'
                  }`}
                >
                  {plan.recommended && (
                    <span className="bg-primary text-primary-foreground absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-semibold shadow-sm">
                      Recommended
                    </span>
                  )}
                  <h3 className="text-foreground text-base font-semibold">
                    {plan.name}
                  </h3>
                  <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                    {plan.description}
                  </p>
                  <p className="text-foreground mt-6 text-4xl font-bold tracking-[-0.02em]">
                    {plan.id === 'enterprise' ? 'Custom' : formatPrice(plan)}
                  </p>
                  <div className="border-border/60 mt-6 border-t pt-6">
                    <ul className="space-y-3">
                      <FeatureLine>
                        {formatLimit(plan.features.max_team_members)} seats
                      </FeatureLine>
                      <FeatureLine>
                        {formatLimit(plan.features.max_contacts)} contacts
                      </FeatureLine>
                      <FeatureLine>
                        {formatLimit(plan.features.max_automations)} automations
                      </FeatureLine>
                      {plan.features.has_ai_assistant && (
                        <FeatureLine>
                          {plan.features.ai_credits_per_month.toLocaleString()}{' '}
                          AI credits/mo
                        </FeatureLine>
                      )}
                    </ul>
                  </div>
                  <div className="mt-auto pt-8">
                    {plan.id === 'enterprise' ? (
                      <a
                        href="mailto:sales@tijwa.com"
                        className="border-border text-foreground hover:bg-muted inline-flex h-11 w-full items-center justify-center rounded-lg border text-sm font-semibold transition-colors"
                      >
                        {plan.cta}
                      </a>
                    ) : (
                      <Link
                        href="/signup"
                        className={`inline-flex h-11 w-full items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                          plan.recommended
                            ? 'bg-primary text-primary-foreground hover:bg-primary-hover'
                            : 'border-border text-foreground hover:bg-muted border'
                        }`}
                      >
                        {plan.cta}
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10">
              <Link
                href="/pricing"
                className="text-primary hover:text-primary-hover text-sm font-medium underline underline-offset-4 transition-colors"
              >
                Compare all plans →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ── FAQ ── */}
      <section className="border-border/60 border-t py-20 lg:py-28">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-foreground text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Common questions.
          </h2>
          <div className="mt-12 grid gap-x-12 gap-y-10 lg:grid-cols-2">
            {FAQS.map((faq) => (
              <div key={faq.q}>
                <h3 className="text-foreground text-base font-semibold">
                  {faq.q}
                </h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="border-border/60 bg-primary/5 border-t py-20 lg:py-24">
        <div className="mx-auto w-full max-w-6xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-foreground text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Ready to take control of WhatsApp?
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg leading-relaxed">
            Join Kenyan businesses using Tijwa to sell, support, and grow on
            WhatsApp.
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-12 items-center rounded-lg px-8 text-base font-semibold transition-colors"
            >
              Get started
            </Link>
          </div>
          <p className="text-muted-foreground mt-4 flex items-center justify-center gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Shield className="size-3.5" /> Kenya DPA compliant
            </span>
            <span>Official WhatsApp Business API</span>
          </p>
        </div>
      </section>
    </>
  );
}

function FeatureLine({ children }: { children: React.ReactNode }) {
  return (
    <li className="text-muted-foreground mt-18 flex items-center gap-2.5 text-sm">
      <svg
        className="text-primary size-4 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      {children}
    </li>
  );
}
