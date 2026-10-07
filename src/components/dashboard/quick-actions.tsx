"use client"

import Link from 'next/link'
import { UserPlus, Radio, Zap } from 'lucide-react'
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

const ACTIONS: Action[] = [
  { labelKey: 'newContact', href: '/contacts', icon: UserPlus, tint: 'text-primary' },
  // { labelKey: 'newDeal', href: '/pipelines', icon: Briefcase, tint: 'text-blue-400' }, // TODO: enable when pipelines are supported
  { labelKey: 'newBroadcast', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-400' },
  { labelKey: 'newAutomation', href: '/automations/new', icon: Zap, tint: 'text-primary' },
]

export function QuickActions() {
  const t = useTranslations('Dashboard.quickActions')
  
  return (
    // 3-up from sm so the three actions fill one row without leaving
    // a dangling 4th slot (the old grid-cols-4 did); on phones the
    // labels get leading-tight so two lines don't blow up card height.
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:border-border hover:bg-muted/60 sm:gap-3 sm:px-4"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${a.tint}`}>
              <Icon className="h-4 w-4" />
            </div>
            <span className="min-w-0 flex-1 text-[13px] leading-tight font-medium text-foreground sm:text-sm">
              {t(a.labelKey as string)}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
