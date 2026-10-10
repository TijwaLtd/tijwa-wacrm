// ============================================================
// /api/reports — report status, history, and generate-now.
//   GET  → { config, history[] }  (agent+)
//   POST → generate a report now { account_id, email?, kind? }
//          email=true requires admin+
// ============================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { hasMinRole, type AccountRole } from '@/lib/auth/roles'
import { generateAndDeliverReport } from '@/lib/reports/generate'
import { getReportConfig, listReports } from '@/lib/reports/store'

async function requireMembership(accountId: string, minRole: AccountRole) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data: membership } = await serviceClient
    .from('account_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .single()
  if (!membership) {
    return { error: NextResponse.json({ error: 'Not a member of this account' }, { status: 403 }) }
  }
  const role = membership.role as AccountRole
  if (!hasMinRole(role, minRole)) {
    return { error: NextResponse.json({ error: 'Insufficient role' }, { status: 403 }) }
  }
  return { user, role, serviceClient }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  const auth = await requireMembership(accountId, 'agent')
  if (auth.error) return auth.error

  try {
    const [config, history] = await Promise.all([
      getReportConfig(auth.serviceClient, accountId),
      listReports(auth.serviceClient, accountId, 20),
    ])
    return NextResponse.json({ config, history })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: { account_id?: string; email?: boolean; kind?: 'weekly' | 'monthly' | 'daily' }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const accountId = body.account_id
  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }
  const wantsEmail = body.email === true
  // Daily reports are page-view-only; PDFs are weekly/monthly
  if (wantsEmail && body.kind === 'daily') {
    return NextResponse.json(
      { error: 'Daily reports cannot be emailed — use weekly or monthly' },
      { status: 400 },
    )
  }
  const auth = await requireMembership(accountId, wantsEmail ? 'admin' : 'agent')
  if (auth.error) return auth.error

  try {
    const result = await generateAndDeliverReport(auth.serviceClient, accountId, {
      kind: body.kind,
      email: wantsEmail,
      createdBy: auth.user?.id ?? null,
    })
    return NextResponse.json({
      report_id: result.report.id,
      emailed: result.emailed,
      recipients: result.recipients,
      error: result.error,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
