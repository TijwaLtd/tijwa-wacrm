// ============================================================
// generateAndDeliverReport — the full pipeline used by the cron
// and the "generate now" API: build bundle → save history →
// (optional) render PDF and email it.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { buildReportBundle } from './metrics'
import { sendReportEmail } from './email'
import { renderReportPdf, reportPdfFilename } from './pdf/render'
import {
  getReportConfig,
  markConfigSent,
  markReportSent,
  saveReport,
} from './store'
import type { BusinessReportRow, ReportConfigRow } from './store'
import type { ReportPeriodKind } from './types'

type DB = SupabaseClient

export interface GenerateReportResult {
  report: BusinessReportRow
  emailed: boolean
  recipients: string[]
  error?: string
}

export async function generateAndDeliverReport(
  db: DB,
  accountId: string,
  options: {
    kind?: ReportPeriodKind
    email?: boolean
    recipients?: string[] | null
    createdBy?: string | null
    config?: ReportConfigRow
  } = {},
): Promise<GenerateReportResult> {
  const config = options.config ?? (await getReportConfig(db, accountId))
  const kind = options.kind ?? config.frequency
  const bundle = await buildReportBundle(db, accountId, { kind })
  const report = await saveReport(db, {
    accountId,
    bundle,
    createdBy: options.createdBy ?? null,
  })

  if (!options.email) {
    return { report, emailed: false, recipients: [] }
  }
  if (kind === 'daily') {
    return {
      report,
      emailed: false,
      recipients: [],
      error: 'Daily reports are view-only and cannot be emailed',
    }
  }

  try {
    const pdfBuffer = await renderReportPdf(bundle)
    const result = await sendReportEmail({
      db,
      accountId,
      bundle,
      pdfBuffer,
      pdfFilename: reportPdfFilename(bundle),
      recipients: options.recipients ?? config.recipients,
    })
    if (result.success) {
      await markReportSent(db, report.id)
      if (options.kind === undefined) {
        // cron path (no explicit kind override) — advance the schedule clock
        await markConfigSent(db, accountId)
      }
    }
    return { report, emailed: result.success, recipients: result.recipients, error: result.error }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[reports] delivery failed for ${accountId}:`, message)
    return { report, emailed: false, recipients: [], error: message }
  }
}
