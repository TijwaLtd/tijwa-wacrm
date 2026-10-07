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
   * doesn't have a sensible comparison (e.g. total pipeline value).
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
    // p-4 on phones: cards sit 2-up in a half-width column there, so
    // every px of inner width matters.
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-medium leading-tight text-muted-foreground">
          {title}
        </p>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {/* 22px on phones so currency values ("KES 125,400") fit a
          half-width card; truncate + title keeps the exact value
          reachable if it still doesn't. */}
      <p
        className="mt-3 truncate text-[22px] leading-none font-bold tabular-nums text-foreground sm:text-[28px]"
        title={value}
      >
        {value}
      </p>
      {delta ? <DeltaRow sign={delta.sign} label={delta.label} /> : subtitle ? (
        <p className="mt-2 truncate text-sm text-muted-foreground" title={subtitle}>
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
    <div className={cn('mt-2 flex min-w-0 items-center gap-1 text-xs sm:text-sm', tone)}>
      <Arrow className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate tabular-nums">{label}</span>
    </div>
  )
}
