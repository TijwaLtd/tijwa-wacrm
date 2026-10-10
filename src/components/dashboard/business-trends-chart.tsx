'use client'

import { useCallback, useEffect, useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import {
  loadBusinessTrends,
  type BusinessTrendSeries,
} from '@/lib/dashboard/business-trends'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { cn } from '@/lib/utils'

type RangeDays = 7 | 30 | 90

const VB_W = 760
const VB_H = 200
const PADDING = { top: 16, right: 16, bottom: 28, left: 40 }

const FIELD_LABEL_KEYS = {
  orders: 'metricOrders',
  bookings: 'metricBookings',
  inquiries: 'metricInquiries',
  applications: 'metricApplications',
} as const

export function BusinessTrendsChart() {
  const t = useTranslations('Dashboard.businessTrends')
  const { accountId, businessType } = useAuth()
  const [range, setRange] = useState<RangeDays>(30)
  const [series, setSeries] = useState<Record<RangeDays, BusinessTrendSeries | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [loading, setLoading] = useState(true)

  const fetchRange = useCallback(
    (r: RangeDays) => {
      if (!accountId) return
      setLoading(true)
      loadBusinessTrends(createClient(), accountId, businessType, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => {
          console.error('[business-trends] load failed:', err)
          setSeries((prev) => ({
            ...prev,
            [r]: { family: 'commerce', field: 'orders', points: [] },
          }))
        })
        .finally(() => setLoading(false))
    },
    [accountId, businessType],
  )

  // Initial load — loading starts true, so the effect only sets state
  // after the await (keeps react-hooks/set-state-in-effect quiet).
  useEffect(() => {
    if (!accountId) return
    let cancelled = false
    loadBusinessTrends(createClient(), accountId, businessType, 30)
      .then((s) => {
        if (!cancelled) setSeries((prev) => ({ ...prev, 30: s }))
      })
      .catch((err) => {
        console.error('[business-trends] load failed:', err)
        if (!cancelled) {
          setSeries((prev) => ({
            ...prev,
            30: { family: 'commerce', field: 'orders', points: [] },
          }))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [accountId, businessType])

  const current = series[range]
  const metricLabel = current
    ? t(FIELD_LABEL_KEYS[current.field])
    : ''

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {current ? t('descriptionMetric', { metric: metricLabel }) : t('description')}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
          {[7, 30, 90].map((r) => {
            const rd = r as RangeDays
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setRange(rd)
                  if (series[rd] === null) fetchRange(rd)
                }}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  range === rd
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('days', { count: r })}
              </button>
            )
          })}
        </div>
      </header>

      <div className="p-4">
        {loading || !current ? (
          <Skeleton className="h-[200px] w-full" />
        ) : current.points.every((p) => p.value === 0) ? (
          <EmptyState
            icon={BarChart3}
            title={t('noActivity')}
            hint={t('noActivityHint')}
          />
        ) : (
          <BarsSvg points={current.points} label={metricLabel} ariaLabel={t('ariaLabel', { metric: metricLabel })} />
        )}
      </div>

      <footer className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          {metricLabel}
        </span>
        {current && (
          <span className="ml-auto">
            {t('periodTotal', {
              metric: metricLabel,
              count: current.points.reduce((s, p) => s + p.value, 0).toLocaleString(),
            })}
          </span>
        )}
      </footer>
    </section>
  )
}

// ------------------------------------------------------------
// Vertical bars — discrete daily counts read better as bars than
// as a line, and the markup stays trivial (no hover machinery).
// ------------------------------------------------------------

function BarsSvg({
  points,
  label,
  ariaLabel,
}: {
  points: { day: string; value: number }[]
  label: string
  ariaLabel: string
}) {
  const max = Math.max(...points.map((p) => p.value), 1)
  const ceil = niceCeil(max)
  const ticks = Array.from(new Set([0, ceil / 2, ceil].map((v) => Math.round(v))))

  const chartW = VB_W - PADDING.left - PADDING.right
  const chartH = VB_H - PADDING.top - PADDING.bottom
  const slot = chartW / points.length
  const barW = Math.max(2, Math.min(14, slot - 2))
  const yFor = (v: number) => PADDING.top + chartH - (v / ceil) * chartH
  const labelStride = Math.max(1, Math.ceil(points.length / 6))

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="h-[200px] w-full"
        role="img"
        aria-label={ariaLabel}
      >
        {ticks.map((tick) => {
          const y = yFor(tick)
          return (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={VB_W - PADDING.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeDasharray="3 3"
              />
              <text
                x={PADDING.left - 8}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {tick}
              </text>
            </g>
          )
        })}

        {points.map((p, i) => {
          const x = PADDING.left + i * slot + (slot - barW) / 2
          const y = yFor(p.value)
          const h = PADDING.top + chartH - y
          return (
            <g key={p.day}>
              {p.value > 0 && (
                <rect x={x} y={y} width={barW} height={h} rx={2} fill="#3b82f6">
                  <title>{`${p.day}: ${p.value} ${label}`}</title>
                </rect>
              )}
              {i % labelStride === 0 && (
                <text
                  x={x + barW / 2}
                  y={VB_H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {shortDayLabel(p.day)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function niceCeil(max: number): number {
  if (max <= 0) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(max)))
  const normalised = max / pow
  let nice: number
  if (normalised <= 1) nice = 1
  else if (normalised <= 2) nice = 2
  else if (normalised <= 5) nice = 5
  else nice = 10
  return nice * pow
}
