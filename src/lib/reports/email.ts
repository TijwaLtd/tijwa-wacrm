// ============================================================
// Report email orchestration — recipient resolution, KPI rows
// for the email body, and the send call with the PDF attached.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBusinessReportEmail } from '@/lib/email/send'
import { deltaLabel, formatKpiValue } from './metrics'
import type { ReportBundle } from './types'

type DB = SupabaseClient

const EMAIL_DISABLED = process.env.EMAIL_DISABLED === 'true'

export function buildKpiRowsHtml(bundle: ReportBundle): string {
  return bundle.headlineKpis
    .map((kpi) => {
      const value = formatKpiValue(kpi.value, kpi.format, bundle.currency)
      const delta = deltaLabel(kpi.value.deltaPct)
      const color =
        kpi.value.deltaPct === null || kpi.value.deltaPct === 0
          ? '#6b7280'
          : kpi.value.deltaPct > 0
            ? '#059669'
            : '#dc2626'
      return `
  <tr>
    <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151">${kpi.label}</td>
    <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#111827;text-align:right">${value}</td>
    <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;font-size:12px;color:${color};text-align:right">${delta}</td>
  </tr>`
    })
    .join('')
}

/** Config recipients first; always falls back to the workspace owner. */
export async function resolveReportRecipients(
  db: DB,
  accountId: string,
  configured?: string[] | null,
): Promise<string[]> {
  const emails = new Set<string>()
  for (const e of configured ?? []) {
    if (e.includes('@')) emails.add(e.trim().toLowerCase())
  }

  if (emails.size === 0) {
    const { data: membership } = await db
      .from('account_memberships')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('role', 'owner')
      .limit(1)
      .maybeSingle()
    if (membership?.user_id) {
      const { data: profile } = await db
        .from('profiles')
        .select('email')
        .eq('user_id', membership.user_id)
        .maybeSingle()
      if (profile?.email) emails.add(profile.email.toLowerCase())
    }
  }

  return [...emails]
}

export interface SendReportEmailInput {
  db: DB
  accountId: string
  bundle: ReportBundle
  pdfBuffer: Buffer
  pdfFilename: string
  recipients?: string[] | null
}

export async function sendReportEmail(input: SendReportEmailInput): Promise<{
  success: boolean
  recipients: string[]
  error?: string
}> {
  const { db, accountId, bundle, pdfBuffer, pdfFilename } = input
  const recipients = await resolveReportRecipients(db, accountId, input.recipients)
  if (recipients.length === 0) {
    return { success: false, recipients: [], error: 'no recipients resolved' }
  }
  if (EMAIL_DISABLED) {
    console.log('[reports] EMAIL_DISABLED=true — skipping report send to', recipients)
    return { success: true, recipients }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com'
  const result = await sendBusinessReportEmail(
    recipients,
    {
      businessName: bundle.businessName,
      periodLabel: bundle.period.label,
      kpiRowsHtml: buildKpiRowsHtml(bundle),
      generatedDate: new Date(bundle.generatedAt).toUTCString(),
      viewUrl: `${siteUrl}/reports`,
    },
    { filename: pdfFilename, content: pdfBuffer },
  )

  return result.success
    ? { success: true, recipients }
    : { success: false, recipients, error: result.error }
}
