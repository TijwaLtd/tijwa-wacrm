// ============================================================
// Business trend series for the dashboard. Reuses the report_*
// aggregation RPCs (member JWT passes report_assert_access) so
// the dashboard and the /reports page never disagree on numbers.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { familyForBusinessType } from '@/lib/reports/domain'
import type { ReportFamily } from '@/lib/reports/types'

type DB = SupabaseClient

export interface BusinessTrendPoint {
  day: string // YYYY-MM-DD (UTC, matches the RPC bucketing)
  value: number
}

export interface BusinessTrendSeries {
  family: ReportFamily
  /** RPC + daily field that drives the chart */
  field: 'orders' | 'bookings' | 'inquiries' | 'applications'
  points: BusinessTrendPoint[]
}

const RPC_BY_FAMILY: Record<ReportFamily, string> = {
  commerce: 'report_commerce_metrics',
  food: 'report_food_metrics',
  hospitality: 'report_hospitality_metrics',
  property: 'report_property_metrics',
  ngo: 'report_ngo_metrics',
  services: 'report_services_metrics',
}

const FIELD_BY_FAMILY: Record<ReportFamily, BusinessTrendSeries['field']> = {
  commerce: 'orders',
  food: 'orders',
  hospitality: 'bookings',
  property: 'inquiries',
  ngo: 'applications',
  services: 'bookings',
}

/** UTC day keys spanning [from, to) — matches RPC bucketing. */
function utcDayKeys(from: Date, to: Date): string[] {
  const keys: string[] = []
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  )
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  )
  while (cursor.getTime() <= end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys
}

export async function loadBusinessTrends(
  db: DB,
  accountId: string,
  businessType: string | null | undefined,
  rangeDays: number,
): Promise<BusinessTrendSeries> {
  const family = familyForBusinessType(businessType)
  const to = new Date()
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (rangeDays - 1)),
  )

  const { data, error } = await db.rpc(RPC_BY_FAMILY[family], {
    p_account_id: accountId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  if (error) throw new Error(error.message)

  const field = FIELD_BY_FAMILY[family]
  const rawDaily = ((data ?? {}) as { daily?: { day: string }[] }).daily ?? []
  const byDay = new Map(
    rawDaily.map((d) => [
      d.day,
      Number((d as Record<string, unknown>)[field]) || 0,
    ]),
  )

  return {
    family,
    field,
    points: utcDayKeys(from, to).map((day) => ({
      day,
      value: byDay.get(day) ?? 0,
    })),
  }
}
