// ============================================================
// /support/* — authed support section with its own chrome (like
// /help and the legal section). Auth is enforced by the proxy
// (protectedPaths); pages are client components because they need
// auth-adjacent state and interactivity.
// ============================================================

import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { HelpChrome } from '@/components/help/help-chrome'

export const metadata: Metadata = {
  title: 'Support · Tijwa',
  robots: { index: false, follow: false },
}

export default function SupportLayout({ children }: { children: ReactNode }) {
  return <HelpChrome mode="support">{children}</HelpChrome>
}
