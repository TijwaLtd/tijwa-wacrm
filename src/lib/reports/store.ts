// ============================================================
// Persistence for report configs + generated report history.
// business_reports.metrics stores the full ReportBundle so a
// PDF can be re-rendered on demand without recomputation.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReportBundle, ReportPeriodKind } from './types'

type DB = SupabaseClient

export interface ReportConfigRow {
  account_id: string
  enabled: boolean
  frequency: 'weekly' | 'monthly'
  weekday: number
  recipients: string[]
  last_sent_at: string | null
}

export const DEFAULT_REPORT_CONFIG: Omit<ReportConfigRow, 'account_id' | 'last_sent_at'> = {
  enabled: false,
  frequency: 'monthly',
  weekday: 1,
  recipients: [],
}

export interface BusinessReportRow {
  id: string
  account_id: string
  period: string
  period_start: string
  period_end: string
  metrics: ReportBundle
  pdf_path: string | null
  sent_at: string | null
  created_at: string
}

export async function getReportConfig(
  db: DB,
  accountId: string,
): Promise<ReportConfigRow> {
  const { data } = await db
    .from('report_configs')
    .select('account_id, enabled, frequency, weekday, recipients, last_sent_at')
    .eq('account_id', accountId)
    .maybeSingle()
  return (data as ReportConfigRow | null) ?? {
    ...DEFAULT_REPORT_CONFIG,
    account_id: accountId,
    last_sent_at: null,
  }
}

export async function upsertReportConfig(
  db: DB,
  accountId: string,
  patch: Partial<Pick<ReportConfigRow, 'enabled' | 'frequency' | 'weekday' | 'recipients'>>,
): Promise<ReportConfigRow> {
  const current = await getReportConfig(db, accountId)
  const next = { ...current, ...patch }
  const { data, error } = await db
    .from('report_configs')
    .upsert(
      {
        account_id: accountId,
        enabled: next.enabled,
        frequency: next.frequency,
        weekday: next.weekday,
        recipients: next.recipients,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_id' },
    )
    .select('account_id, enabled, frequency, weekday, recipients, last_sent_at')
    .single()
  if (error) throw new Error(`report config upsert failed: ${error.message}`)
  return data as ReportConfigRow
}

export async function markReportSent(db: DB, reportId: string): Promise<void> {
  await db
    .from('business_reports')
    .update({ sent_at: new Date().toISOString() })
    .eq('id', reportId)
}

export async function markConfigSent(db: DB, accountId: string): Promise<void> {
  await db
    .from('report_configs')
    .update({ last_sent_at: new Date().toISOString() })
    .eq('account_id', accountId)
}

export async function saveReport(
  db: DB,
  input: { accountId: string; bundle: ReportBundle; createdBy?: string | null },
): Promise<BusinessReportRow> {
  const { data, error } = await db
    .from('business_reports')
    .insert({
      account_id: input.accountId,
      period: input.bundle.period.kind,
      period_start: input.bundle.period.from.slice(0, 10),
      period_end: input.bundle.period.to.slice(0, 10),
      metrics: input.bundle,
      created_by: input.createdBy ?? null,
    })
    .select('id, account_id, period, period_start, period_end, metrics, pdf_path, sent_at, created_at')
    .single()
  if (error) throw new Error(`save report failed: ${error.message}`)
  return data as unknown as BusinessReportRow
}

export async function listReports(
  db: DB,
  accountId: string,
  limit = 20,
): Promise<BusinessReportRow[]> {
  const { data, error } = await db
    .from('business_reports')
    .select('id, account_id, period, period_start, period_end, metrics, pdf_path, sent_at, created_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`list reports failed: ${error.message}`)
  return (data ?? []) as unknown as BusinessReportRow[]
}

export async function getReport(
  db: DB,
  accountId: string,
  reportId: string,
): Promise<BusinessReportRow | null> {
  const { data, error } = await db
    .from('business_reports')
    .select('id, account_id, period, period_start, period_end, metrics, pdf_path, sent_at, created_at')
    .eq('account_id', accountId)
    .eq('id', reportId)
    .maybeSingle()
  if (error) throw new Error(`get report failed: ${error.message}`)
  return data as unknown as BusinessReportRow | null
}

// ------------------------------------------------------------
// Cron due-logic (pure)
// ------------------------------------------------------------

export function isReportDue(
  config: Pick<ReportConfigRow, 'enabled' | 'frequency' | 'weekday' | 'last_sent_at'>,
  now: Date,
): boolean {
  if (!config.enabled) return false
  const lastSent = config.last_sent_at ? new Date(config.last_sent_at) : null
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const dayMs = 24 * 60 * 60 * 1000
  const minGapMs = config.frequency === 'weekly' ? 6 * dayMs : 27 * dayMs
  if (lastSent && now.getTime() - lastSent.getTime() < minGapMs) return false

  if (config.frequency === 'weekly') {
    return now.getUTCDay() === config.weekday
  }
  // monthly: run on the 1st of each month (UTC)
  return now.getUTCDate() === 1
}
