// ============================================================
// LegalShell — shared chrome for /<slug>/legal/terms and
// /<slug>/legal/privacy (server-rendered, no auth).
//
// Renders the tenant's brand (logo + name) so the customer can
// see WHO the terms belong to, the version + effective date that
// consent records reference, and cross-links between the two
// documents.
// ============================================================

import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { resolveAccountBySlug } from '@/lib/public/customer'
import { CONSENT_VERSION } from '@/lib/public/customer'

export const LEGAL_EFFECTIVE_DATE = '7 October 2026'

interface LegalShellProps {
  slug: string
  title: string
  active: 'terms' | 'privacy'
  children: ReactNode
}

export async function LegalShell({ slug, title, active, children }: LegalShellProps) {
  const account = await resolveAccountBySlug(slug)
  if (!account) notFound()

  const businessName = account.display_name || account.name

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-14">
        <header className="mb-8 flex items-center gap-3">
          {account.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={account.logo_url} alt="" className="size-10 rounded-lg object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">{businessName}</p>
            <p className="text-xs text-muted-foreground">via Tijwa WhatsApp Assistant</p>
          </div>
        </header>

        <article className="rounded-xl border border-border bg-card p-5 sm:p-8">
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Effective {LEGAL_EFFECTIVE_DATE} · Version <code className="rounded bg-muted px-1">{CONSENT_VERSION}</code>
          </p>

          <nav className="mt-5 flex gap-4 border-b border-border pb-4 text-sm">
            <Link
              href={`/${slug}/legal/terms`}
              className={`font-medium ${active === 'terms' ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Terms of Service
            </Link>
            <Link
              href={`/${slug}/legal/privacy`}
              className={`font-medium ${active === 'privacy' ? 'text-primary underline underline-offset-4' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Privacy Policy
            </Link>
          </nav>

          <div className="mt-6 space-y-5 text-[15px] leading-relaxed text-foreground/85 [&>h2]:mt-8 [&>h2]:text-lg [&>h2]:font-semibold [&>h2]:text-foreground [&>h3]:mt-6 [&>h3]:font-semibold [&>h3]:text-foreground [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5 [&_a]:text-primary [&_a]:underline">
            {children}
          </div>
        </article>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {businessName} · Powered by Tijwa
        </p>
      </div>
    </div>
  )
}
