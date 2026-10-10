// ============================================================
// /help/business-types/[type] — one page per business type:
// optional markdown intro (content/help/{locale}/business-types/
// {type}.md, en fallback) + the auto-generated capabilities section
// from capabilities.ts and the business_capabilities table, so the
// documented feature list can never drift from the product.
// ============================================================

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { ChevronRight, ArrowLeft } from 'lucide-react'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { loadBusinessTypeDoc } from '@/lib/help/docs'
import {
  getBusinessTypeEntry,
  getCapabilityDocsForType,
  listBusinessTypeValues,
} from '@/lib/help/capability-docs'

export function generateStaticParams() {
  return listBusinessTypeValues().map((type) => ({ type }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ type: string }>
}): Promise<Metadata> {
  const { type } = await params
  const entry = getBusinessTypeEntry(type)
  if (!entry) return {}
  return {
    title: `${entry.label} · Tijwa Help`,
    description: `Capabilities and features for the ${entry.label} business type in Tijwa`,
    robots: { index: true, follow: true },
  }
}

export default async function BusinessTypeDocPage({
  params,
}: {
  params: Promise<{ type: string }>
}) {
  const { type } = await params
  const entry = getBusinessTypeEntry(type)
  if (!entry) notFound()

  const locale = await getLocale()
  const doc = loadBusinessTypeDoc(type, locale)
  const capabilities = await getCapabilityDocsForType(entry.value)

  return (
    <div>
      <Link
        href="/help/business-types"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> All business types
      </Link>

      <h1 className="mt-3 text-2xl font-bold text-foreground sm:text-3xl">{entry.label}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{entry.description}</p>

      {doc && (
        <div className="mt-6">
          <HelpMarkdown content={doc.content} />
        </div>
      )}

      <h2 className="mt-10 text-lg font-semibold text-foreground">
        Capabilities switched on for {entry.label}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        These features activate when you pick this business type. Manage them any time under
        Settings → Business.
      </p>

      <div className="mt-4 space-y-3">
        {capabilities.map((cap) => (
          <div key={cap.key} className="rounded-xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-foreground">{cap.name}</p>
              {cap.route && (
                <Link
                  href={cap.route}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Open <ChevronRight className="size-3" />
                </Link>
              )}
            </div>
            {cap.description && (
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{cap.description}</p>
            )}
            <p className="mt-2 font-mono text-[11px] text-muted-foreground/70">{cap.key}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
