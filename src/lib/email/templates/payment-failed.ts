import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const paymentFailed: EmailTemplate = {
  name: 'payment-failed',
  subject: 'Payment failed — action required',
  render: (data) => {
    const name = data.name || 'there';
    const workspaceName = data.workspaceName || 'your workspace';
    const reason = data.reason || 'Your card on file was declined.';

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  Payment failed
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  We couldn't process your latest payment for <strong>${workspaceName}</strong>.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca">
  <tr>
    <td style="padding:16px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;color:#991b1b;font-weight:600;padding-right:8px">⚠</td>
          <td style="font-size:14px;color:#991b1b">${reason}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#374151">
  Please update your payment method to keep your workspace active. If the issue persists, contact your bank.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${SITE_URL}/settings/billing" class="btn" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Update Payment Method
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `Payment failed for ${workspaceName} — please update your card` });
  },
};

export default paymentFailed;
