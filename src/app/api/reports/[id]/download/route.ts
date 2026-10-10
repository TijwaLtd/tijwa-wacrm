// ============================================================
// /api/reports/[id]/download — re-render the PDF for a stored
// report (from business_reports.metrics) and stream it back.
// ============================================================

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { hasMinRole } from '@/lib/auth/roles'
import { getReport } from '@/lib/reports/store'
import { renderReportPdf, reportPdfFilename } from '@/lib/reports/pdf/render'
import type { ReportBundle } from '@/lib/reports/types'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const accountId = searchParams.get('account_id')
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
  if (!membership || !hasMinRole(membership.role as never, 'agent')) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  try {
    const report = await getReport(serviceClient, accountId, id)
    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }
    const bundle = report.metrics as ReportBundle
    const buffer = await renderReportPdf(bundle)
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${reportPdfFilename(bundle)}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
