import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const planLabels: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const subscriptionExpired: EmailTemplate = {
  name: 'subscription-expired',
  subject: 'Your subscription has expired',
  render: (data) => {
    const name = data.name || 'there';
    const workspaceName = data.workspaceName || 'your workspace';
    const plan = planLabels[data.plan] || data.plan || 'your';

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  Subscription expired
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your <strong>${plan}</strong> plan for <strong>${workspaceName}</strong> has expired.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca">
  <tr>
    <td style="padding:20px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;color:#991b1b;font-weight:600">
            What happens now:
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;color:#991b1b;padding-top:8px">
            &bull; Sending messages is disabled<br>
            &bull; Team conversations are read-only<br>
            &bull; New contacts cannot be added
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#6b7280">
  Renew your subscription to restore full access to your workspace.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${SITE_URL}/settings?tab=plans" class="btn" style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Renew Subscription
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `Your ${plan} subscription has expired — renew to restore access` });
  },
};

export default subscriptionExpired;
