import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const businessReport: EmailTemplate = {
  name: 'business-report',
  subject: 'Your business report is ready',
  render: (data) => {
    const businessName = data.businessName || 'Your workspace';
    const periodLabel = data.periodLabel || '';
    const kpiRowsHtml = data.kpiRowsHtml || '';
    const generatedDate = data.generatedDate || '';
    const viewUrl = data.viewUrl || `${SITE_URL}/reports`;

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  Business report
</h1>
<p style="margin:0 0 8px 0;font-size:16px;line-height:26px;color:#374151">
  <strong>${businessName}</strong>
</p>
<p style="margin:0 0 24px 0;font-size:14px;line-height:22px;color:#6b7280">
  ${periodLabel}
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;border:1px solid #e5e7eb;border-radius:8px">
  ${kpiRowsHtml}
</table>

<p style="margin:0 0 24px 0;font-size:14px;line-height:22px;color:#374151">
  Your full report is attached as a PDF, with charts and comparisons against the previous
  period. You can also view it any time in the app:
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0">
  <tr>
    <td style="border-radius:6px;background-color:#2563eb;padding:12px 20px">
      <a href="${viewUrl}" style="font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">
        Open report in Tijwa
      </a>
    </td>
  </tr>
</table>

<p style="margin:0 0 8px 0;font-size:12px;line-height:18px;color:#9ca3af">
  Generated ${generatedDate}. Periods are UTC. You receive this because report emails are
  enabled for your workspace — change the schedule or recipients in Settings → Reports.
</p>
`;

    return baseTemplate(content, { preheader: `${businessName} report for ${periodLabel}` });
  },
};

export default businessReport;
