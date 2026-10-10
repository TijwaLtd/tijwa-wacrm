// ============================================================
// /help/* — public help center (no auth). Own chrome, mirroring
// the legal section's layout pattern. robots: index (unlike the
// global noindex default) — these pages are meant to be found.
// ============================================================

import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import type { ReactNode } from 'react'
import { HelpChrome } from '@/components/help/help-chrome'

export const metadata: Metadata = {
  title: 'Help center · Tijwa',
  description: 'Guides, business-type documentation, and answers for Tijwa WhatsApp CRM',
  robots: { index: true, follow: true },
}

export default async function HelpLayout({ children }: { children: ReactNode }) {
  // Resolve the locale here so every page in the section can stay a
  // plain server component reading content via the same locale.
  await getLocale()
  return <HelpChrome mode="docs">{children}</HelpChrome>
}
