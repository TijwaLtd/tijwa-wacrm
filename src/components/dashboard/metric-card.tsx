import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import type { ComponentType } from 'react'
import { cn } from '@/lib/utils'

interface MetricCardProps {
  title: string
  /** Pre-formatted value for display (e.g. "42" or "$1,250"). */
  value: string
  icon: ComponentType<{ className?: string }>
  /**
   * Delta-mode secondary row: arrow + delta text. Omit when the metric
   * doesn't have a sensible comparison.
   */
  delta?: {
    /** Positive / negative / zero drives arrow + color. */
    sign: number
    /** Pre-formatted delta, e.g. "+3 vs yesterday". */
    label: string
  }
  /** Used instead of `delta` when the metric has a static subtitle. */
  subtitle?: string
}

export function MetricCard({ title, value, icon: Icon, delta, subtitle }: MetricCardProps) {
  return (
    // Cards sit 3-up on every breakpoint, so phones get ~110px per
    // card — p-3, an 11px label and no icon there (the icon returns
    // at sm when there's room for it beside the title).
    <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between gap-1.5">
        <p className="min-w-0 text-[11px] leading-tight font-medium text-muted-foreground sm:text-sm">
          {title}
        </p>
        <div className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:flex sm:h-8 sm:w-8">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p
        className="mt-1.5 truncate text-[17px] leading-none font-bold tabular-nums text-foreground sm:mt-3 sm:text-2xl"
        title={value}
      >
        {value}
      </p>
      {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
        <p className="mt-1 truncate text-[11px] text-muted-foreground sm:mt-2 sm:text-sm" title={subtitle}>
          {subtitle}
        </p>
      ) : null}
    </div>
  )
}

function DeltaRow({ sign, label }: { sign: number; label: string }) {
  const tone =
    sign > 0
      ? 'text-primary'
      : sign < 0
      ? 'text-red-400'
      : 'text-muted-foreground'
  const Arrow = sign > 0 ? ArrowUp : sign < 0 ? ArrowDown : Minus
  return (
    <div className={cn('mt-1.5 flex min-w-0 items-center gap-1 text-[10px] sm:mt-2 sm:text-xs', tone)}>
      <Arrow className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden />
      <span className="truncate tabular-nums">{label}</span>
    </div>
  )
}
