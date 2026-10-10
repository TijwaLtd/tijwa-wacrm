// ============================================================
// Period windows + delta math. All windows are UTC:
//   daily    — today so far  [startOfUTCDay(now), now]
//   weekly   — last 7 complete days ending yesterday
//   monthly  — last 30 complete days ending yesterday
//   custom   — caller-supplied [from, to)
// The previous window is always the same length immediately
// before `from` (no YoY in v1).
// ============================================================

import type { ReportPeriodKind } from './types'

export interface PeriodWindow {
  from: Date
  to: Date
  prevFrom: Date
  prevTo: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

export function periodWindow(
  kind: ReportPeriodKind,
  now: Date = new Date(),
  custom?: { from: Date; to: Date },
): PeriodWindow {
  if (kind === 'custom') {
    if (!custom) throw new Error('custom period requires { from, to }')
    const { from, to } = custom
    const span = to.getTime() - from.getTime()
    return { from, to, prevFrom: new Date(from.getTime() - span), prevTo: from }
  }
  if (kind === 'daily') {
    const from = startOfUtcDay(now)
    const to = now
    return { from, to, prevFrom: new Date(from.getTime() - DAY_MS), prevTo: from }
  }
  const days = kind === 'weekly' ? 7 : 30
  const to = startOfUtcDay(now) // today 00:00 → excludes today (incomplete)
  const from = new Date(to.getTime() - days * DAY_MS)
  return { from, to, prevFrom: new Date(from.getTime() - days * DAY_MS), prevTo: from }
}

/** Percent change current vs previous; null when previous is 0 (no baseline). */
export function computeDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10 // 1 decimal
}

export function toKpi(current: number | null | undefined, previous: number | null | undefined) {
  const c = Number(current ?? 0) || 0
  const p = Number(previous ?? 0) || 0
  return { current: c, previous: p, deltaPct: computeDelta(c, p) }
}

/** Fill missing UTC days in a sparse series with zero-valued points. */
export function fillDailySeries<T extends { day: string }>(
  points: T[],
  from: Date,
  to: Date,
  empty: (day: string) => T,
): T[] {
  const byDay = new Map(points.map((p) => [p.day, p]))
  const out: T[] = []
  const start = startOfUtcDay(from)
  const end = startOfUtcDay(new Date(to.getTime() - 1)) // last day touched by the window
  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const day = new Date(t).toISOString().slice(0, 10)
    out.push(byDay.get(day) ?? empty(day))
  }
  return out
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function formatPeriodLabel(kind: ReportPeriodKind, from: Date, to: Date): string {
  if (kind === 'daily') {
    return `${MONTHS[from.getUTCMonth()]} ${from.getUTCDate()}, ${from.getUTCFullYear()} (today so far, UTC)`
  }
  const endInclusive = new Date(to.getTime() - DAY_MS)
  const fmt = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
  const sameYear = from.getUTCFullYear() === endInclusive.getUTCFullYear()
  return sameYear
    ? `${fmt(from)} – ${fmt(endInclusive)}, ${endInclusive.getUTCFullYear()}`
    : `${fmt(from)}, ${from.getUTCFullYear()} – ${fmt(endInclusive)}, ${endInclusive.getUTCFullYear()}`
}

/** "1:05" style compact duration for first-response KPIs. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    return `${h}h ${m % 60}m`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}
