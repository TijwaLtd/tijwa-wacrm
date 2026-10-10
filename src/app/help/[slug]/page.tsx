// ============================================================
// /help/[slug] — generic markdown-backed doc page (getting-started,
// quick-replies, faq, billing-and-plans). business-types has its
// own route and takes precedence over this dynamic segment.
// ============================================================

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { loadHelpDoc, HELP_DOC_SLUGS } from '@/lib/help/docs'

// business-types is handled by its own static route.
const DOC_SLUGS = HELP_DOC_SLUGS.filter((s) => s !== 'business-types')

export function generateStaticParams() {
  return DOC_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const locale = await getLocale()
  const doc = loadHelpDoc(slug, locale)
  if (!doc) return {}
  return {
    title: `${doc.frontmatter.title} · Tijwa Help`,
    description: doc.frontmatter.description,
    robots: { index: true, follow: true },
  }
}

export default async function HelpDocPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const locale = await getLocale()
  const doc = loadHelpDoc(slug, locale)
  if (!doc) notFound()

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{doc.frontmatter.title}</h1>
      {doc.frontmatter.description && (
        <p className="mt-2 text-sm text-muted-foreground">{doc.frontmatter.description}</p>
      )}
      <HelpMarkdown content={doc.content} />
    </div>
  )
}
