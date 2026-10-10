// ============================================================
// buildReportBundle — one call assembles everything both the
// PDF renderer and the /reports page need: account info, chat
// metrics, the business-type deep dive, and headline KPIs with
// period comparisons.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { collectChatMetrics, collectDeepDive } from './collectors'
import { familyForBusinessType } from './domain'
import {
  formatPeriodLabel,
  periodWindow,
} from './period'
import type {
  DeepDive,
  HeadlineKpi,
  ReportBundle,
  ReportPeriodKind,
} from './types'

type DB = SupabaseClient

// ------------------------------------------------------------
// Headline KPIs — the top strip on the cover page / page header
// ------------------------------------------------------------

function headlineFor(deepDive: DeepDive | null): HeadlineKpi[] {
  if (!deepDive) return []
  switch (deepDive.family) {
    case 'commerce':
      return [
        { label: 'Orders', value: deepDive.orders, format: 'number' },
        { label: 'Revenue', value: deepDive.revenue, format: 'currency' },
        { label: 'Avg order value', value: deepDive.aov, format: 'currency' },
        { label: 'Order inquiries', value: deepDive.pendingInquiries, format: 'number' },
        { label: 'Repeat order rate', value: deepDive.repeatOrderPct, format: 'percent' },
      ]
    case 'food':
      return [
        { label: 'Food orders', value: deepDive.orders, format: 'number' },
        { label: 'Revenue', value: deepDive.revenue, format: 'currency' },
        { label: 'Avg ticket', value: deepDive.avgTicket, format: 'currency' },
        { label: 'Reservations', value: deepDive.reservations, format: 'number' },
        { label: 'Order inquiries', value: deepDive.pendingInquiries, format: 'number' },
      ]
    case 'hospitality':
      return [
        { label: 'Bookings', value: deepDive.bookings, format: 'number' },
        { label: 'Revenue', value: deepDive.revenue, format: 'currency' },
        { label: 'Room-nights', value: deepDive.roomNights, format: 'number' },
        { label: 'Occupancy', value: deepDive.occupancyPct, format: 'percent' },
        { label: 'Booking inquiries', value: deepDive.pendingInquiries, format: 'number' },
      ]
    case 'property':
      return [
        { label: 'New inquiries', value: deepDive.newInquiries, format: 'number' },
        { label: 'Converted inquiries', value: deepDive.convertedInquiries, format: 'number' },
        { label: 'Viewings', value: deepDive.viewings, format: 'number' },
        { label: 'Offers', value: deepDive.offers, format: 'number' },
        { label: 'Active listings', value: deepDive.activeListings, format: 'number' },
      ]
    case 'ngo':
      return [
        { label: 'Applications', value: deepDive.applications, format: 'number' },
        { label: 'Approved', value: deepDive.approvedApplications, format: 'number' },
        { label: 'Enrollments', value: deepDive.enrollments, format: 'number' },
        { label: 'Donations', value: deepDive.donations, format: 'number' },
        { label: 'Donation amount', value: deepDive.donationAmount, format: 'currency' },
      ]
    case 'services':
      return [
        { label: 'Bookings', value: deepDive.bookings, format: 'number' },
        { label: 'Revenue', value: deepDive.revenue, format: 'currency' },
        { label: 'Service inquiries', value: deepDive.pendingInquiries, format: 'number' },
      ]
  }
}

// ------------------------------------------------------------
// Bundle builder
// ------------------------------------------------------------

export interface BuildReportOptions {
  kind?: ReportPeriodKind
  now?: Date
  custom?: { from: Date; to: Date }
}

export async function buildReportBundle(
  db: DB,
  accountId: string,
  options: BuildReportOptions = {},
): Promise<ReportBundle> {
  const kind = options.kind ?? 'monthly'
  const now = options.now ?? new Date()
  const win = periodWindow(kind, now, options.custom)
  const winArg = { from: win.from, to: win.to }

  const [{ data: account, error: accountError }, { data: settings }] = await Promise.all([
    db
      .from('accounts')
      .select('id, name, business_type, default_currency')
      .eq('id', accountId)
      .single(),
    db.from('tenant_settings').select('accent_color').eq('account_id', accountId).maybeSingle(),
  ])

  if (accountError || !account) {
    throw new Error(`account lookup failed for ${accountId}: ${accountError?.message ?? 'not found'}`)
  }

  const businessType = (account.business_type as string | null) ?? 'other'
  const family = familyForBusinessType(businessType)

  const [chat, deepDive] = await Promise.all([
    collectChatMetrics(db, accountId, winArg),
    collectDeepDive(db, accountId, family, winArg),
  ])

  const headlineKpis: HeadlineKpi[] = [
    { label: 'New conversations', value: chat.conversationsOpened, format: 'number' },
    { label: 'Messages received', value: chat.incoming, format: 'number' },
    { label: 'Avg first response', value: chat.firstResponseAvgSeconds, format: 'duration' },
    ...headlineFor(deepDive),
  ]

  return {
    accountId,
    businessName: (account.name as string) ?? 'Business',
    businessType,
    family,
    currency: (account.default_currency as string) ?? 'USD',
    accentColor: (settings?.accent_color as string | null) ?? null,
    period: {
      kind,
      from: win.from.toISOString(),
      to: win.to.toISOString(),
      label: formatPeriodLabel(kind, win.from, win.to),
    },
    chat,
    deepDive,
    headlineKpis,
    generatedAt: now.toISOString(),
  }
}

// ------------------------------------------------------------
// Formatting helpers shared by PDF + page
// ------------------------------------------------------------

export function formatKpiNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function formatKpiCurrency(n: number, currency: string): string {
  const symbol =
    currency === 'KES' ? 'KSh' :
    currency === 'USD' ? '$' :
    currency === 'EUR' ? '€' :
    currency === 'GBP' ? '£' :
    `${currency} `
  if (Math.abs(n) >= 1_000_000) return `${symbol}${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 10_000) return `${symbol}${Math.round(n / 1000)}k`
  return `${symbol}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export function formatKpiPercent(n: number): string {
  return `${Math.round(n * 10) / 10}%`
}

export function formatKpiValue(
  kpi: { current: number },
  format: HeadlineKpi['format'],
  currency: string,
): string {
  switch (format) {
    case 'currency':
      return formatKpiCurrency(kpi.current, currency)
    case 'percent':
      return formatKpiPercent(kpi.current)
    case 'duration': {
      const m = Math.floor(kpi.current / 60)
      const s = Math.round(kpi.current % 60)
      return m >= 60
        ? `${Math.floor(m / 60)}h ${m % 60}m`
        : `${m}:${String(s).padStart(2, '0')}`
    }
    default:
      return formatKpiNumber(kpi.current)
  }
}

export function deltaLabel(deltaPct: number | null): string {
  if (deltaPct === null) return 'new'
  if (deltaPct === 0) return '±0%'
  return `${deltaPct > 0 ? '+' : ''}${deltaPct}%`
}
