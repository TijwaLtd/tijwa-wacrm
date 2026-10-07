"use client"

import Link from 'next/link'
import { Radio, Zap } from 'lucide-react'
import type { ComponentType } from 'react'

import { useTranslations } from 'next-intl'

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  labelKey: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
}

// The two campaign actions worth surfacing here. "New Contact" was
// cut — contacts mostly arrive via inbound WhatsApp, and manual
// adds live on the Contacts page.
const ACTIONS: Action[] = [
  { labelKey: 'newBroadcast', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-400' },
  { labelKey: 'newAutomation', href: '/automations/new', icon: Zap, tint: 'text-primary' },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')

  return (
    // Two actions → a symmetric 2-up row on phones, capped on wide
    // screens so two cards don't stretch across the whole page.
    <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:max-w-2xl">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/60 sm:gap-2.5 sm:px-4"
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted sm:h-8 sm:w-8 ${a.tint}`}>
              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </div>
            <span className="min-w-0 flex-1 truncate text-[13px] leading-tight font-medium text-foreground sm:text-sm">
              {t(a.labelKey as string)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
