// ============================================================
// /api/reports/config — schedule settings (admin+).
//   PATCH { account_id, enabled?, frequency?, weekday?, recipients? }
// ============================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { hasMinRole } from '@/lib/auth/roles'
import { upsertReportConfig } from '@/lib/reports/store'

const ALLOWED_FREQUENCY = new Set(['weekly', 'monthly'])

export async function PATCH(request: Request) {
  let body: {
    account_id?: string
    enabled?: boolean
    frequency?: string
    weekday?: number
    recipients?: string[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const accountId = body.account_id
  if (!accountId) {
    return NextResponse.json({ error: 'account_id is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  if (!membership || !hasMinRole(membership.role as never, 'admin')) {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 })
  }

  const patch: Parameters<typeof upsertReportConfig>[2] = {}
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
  if (body.frequency !== undefined) {
    if (!ALLOWED_FREQUENCY.has(body.frequency)) {
      return NextResponse.json({ error: 'frequency must be weekly or monthly' }, { status: 400 })
    }
    patch.frequency = body.frequency as 'weekly' | 'monthly'
  }
  if (body.weekday !== undefined) {
    if (!Number.isInteger(body.weekday) || body.weekday < 0 || body.weekday > 6) {
      return NextResponse.json({ error: 'weekday must be 0-6' }, { status: 400 })
    }
    patch.weekday = body.weekday
  }
  if (body.recipients !== undefined) {
    if (!Array.isArray(body.recipients) || body.recipients.some((r) => typeof r !== 'string')) {
      return NextResponse.json({ error: 'recipients must be a string array' }, { status: 400 })
    }
    const emails = body.recipients
      .map((r) => r.trim().toLowerCase())
      .filter((r) => r.includes('@'))
      .slice(0, 10)
    patch.recipients = emails
  }

  try {
    const config = await upsertReportConfig(serviceClient, accountId, patch)
    return NextResponse.json({ config })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
