// ============================================================
// /help — help center home. Cards for each doc plus a shortcut to
// the business-type browser. Content comes from the markdown
// front-matter, so ordering/titles live in the files themselves.
// ============================================================

import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { Rocket, MessageSquareText, CircleHelp, CreditCard, LayoutGrid, ChevronRight, BookOpenText } from 'lucide-react'
import { listHelpDocs } from '@/lib/help/docs'

const DOC_ICONS: Record<string, typeof Rocket> = {
  'getting-started': Rocket,
  'business-types': BookOpenText,
  'quick-replies': MessageSquareText,
  faq: CircleHelp,
  'billing-and-plans': CreditCard,
}

export default async function HelpHomePage() {
  const locale = await getLocale()
  const docs = listHelpDocs(locale)
  const [hero, ...rest] = docs

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Help center</p>
      <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
        {hero?.frontmatter.title ?? 'How can we help?'}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-foreground/80">
        {hero?.frontmatter.description ??
          'Guides, business-type documentation, and answers for the Tijwa WhatsApp CRM.'}
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {docs.map((doc) => {
          const Icon = DOC_ICONS[doc.slug] ?? LayoutGrid
          return (
            <Link
              key={doc.slug}
              href={doc.slug === 'business-types' ? '/help/business-types' : `/help/${doc.slug}`}
              className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
                  {doc.frontmatter.title}
                  <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {doc.frontmatter.description}
                </p>
              </div>
            </Link>
          )
        })}
      </div>

      <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <p className="text-sm font-semibold text-foreground">
          {rest.length > 0 ? 'Something still unclear?' : 'Need a human?'}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Every workspace member can raise a support ticket — you&apos;ll get a tracking ID
          like <code className="rounded bg-muted px-1 py-0.5 font-mono">TCK-7F3K2A</code> and
          see replies right inside Tijwa.
        </p>
        <Link
          href="/support/new"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          Contact support <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
