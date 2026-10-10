'use client'

import Link from 'next/link'
import { BarChart3, Radio, Zap } from 'lucide-react'
import type { ComponentType } from 'react'

import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/use-auth'

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

// The campaign actions worth surfacing here. "New Contact" was
// cut — contacts mostly arrive via inbound WhatsApp, and manual
// adds live on the Contacts page. "Business report" is gated on
// the reports capability at render time (see below).
const ACTIONS: Action[] = [
  { labelKey: 'newBroadcast', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-400' },
  { labelKey: 'newAutomation', href: '/automations/new', icon: Zap, tint: 'text-primary' },
  { labelKey: 'viewReport', href: '/reports', icon: BarChart3, tint: 'text-emerald-400' },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')
  const { enabledCapabilities } = useAuth()

  const actions = ACTIONS.filter(
    (a) => a.href !== '/reports' || enabledCapabilities.includes('reports'),
  )

  return (
    // 2-up on phones (the reports card spans the full row there),
    // 3-up from sm so three cards still fit one line.
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:max-w-3xl">
      {actions.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className={
              a.href === '/reports'
                ? 'group col-span-2 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/60 sm:col-span-1 sm:gap-2.5 sm:px-4'
                : 'group flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/60 sm:gap-2.5 sm:px-4'
            }
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
