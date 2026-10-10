// ============================================================
// POST/GET /api/cron/reports
//
// Daily sweep: for every account with reports enabled, decide
// whether the report is due (weekly on configured weekday,
// monthly on the 1st UTC) and generate + email it.
//
// Invoked by:
//   - Vercel Cron (GET; auto-attach of CRON_SECRET header)
//   - pg_cron via pg_net (POST)
//   - Manual trigger
//
// Protected by CRON_SECRET.
// ============================================================

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isReportDue, getReportConfig } from '@/lib/reports/store'
import { generateAndDeliverReport } from '@/lib/reports/generate'
import type { ReportConfigRow } from '@/lib/reports/store'

const CRON_SECRET = process.env.CRON_SECRET

async function handle(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date()

  try {
    const { data: configs, error } = await db
      .from('report_configs')
      .select('account_id, enabled, frequency, weekday, recipients, last_sent_at')
      .eq('enabled', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const due = (configs ?? []).filter((c) =>
      isReportDue(c as ReportConfigRow, now),
    )

    let sent = 0
    let failed = 0
    const failures: { accountId: string; error: string }[] = []

    for (const config of due) {
      try {
        const result = await generateAndDeliverReport(db, config.account_id, {
          email: true,
          config: config as ReportConfigRow,
        })
        if (result.emailed) sent += 1
        else {
          failed += 1
          failures.push({ accountId: config.account_id, error: result.error ?? 'send failed' })
        }
      } catch (err) {
        failed += 1
        failures.push({
          accountId: config.account_id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      processed: due.length,
      sent,
      failed,
      failures: failures.slice(0, 10),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
