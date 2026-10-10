// ============================================================
// /help/business-types — overview grid of every business type with
// its recommended capabilities, linking to each detail page.
// ============================================================

import Link from 'next/link'
import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { ChevronRight } from 'lucide-react'
import { BUSINESS_TYPES, getRecommendedCapabilityKeys } from '@/lib/business/capabilities'
import { loadBusinessTypesIntro } from '@/lib/help/docs'
import { HelpMarkdown } from '@/components/help/help-markdown'

export const metadata: Metadata = {
  title: 'Business types · Tijwa Help',
  description: 'What each business type unlocks in the Tijwa WhatsApp CRM',
  robots: { index: true, follow: true },
}

export default async function BusinessTypesIndexPage() {
  const locale = await getLocale()
  const intro = loadBusinessTypesIntro(locale)

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
        {intro?.frontmatter.title ?? 'Business types'}
      </h1>
      {intro?.frontmatter.description && (
        <p className="mt-2 text-sm text-muted-foreground">{intro.frontmatter.description}</p>
      )}
      {intro && (
        <div className="mt-4">
          <HelpMarkdown content={intro.content} />
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {BUSINESS_TYPES.map((type) => {
          const caps = getRecommendedCapabilityKeys(type.value)
          return (
            <Link
              key={type.value}
              href={`/help/business-types/${type.value}`}
              className="group flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{type.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{type.description}</p>
                <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-primary">
                  {caps.length} capabilities
                </p>
              </div>
              <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
