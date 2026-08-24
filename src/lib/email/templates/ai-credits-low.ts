import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const aiCreditsLow: EmailTemplate = {
  name: 'ai-credits-low',
  subject: 'AI credits running low',
  render: (data) => {
    const name = data.name || 'there';
    const workspaceName = data.workspaceName || 'your workspace';
    const creditsLeft = data.creditsLeft || '0';
    const plan = data.plan || 'your current plan';

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  AI credits running low
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your workspace <strong>${workspaceName}</strong> has <strong>${creditsLeft}</strong> AI credits remaining on <strong>${plan}</strong>.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#fffbeb;border-radius:8px;border:1px solid #fde68a">
  <tr>
    <td style="padding:16px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;color:#92400e;font-weight:600;padding-right:8px">⚡</td>
          <td style="font-size:14px;color:#92400e">
            Once credits are exhausted, the AI assistant will stop responding until your credits reset.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#374151">
  Upgrade your plan to get more credits and keep your AI assistant running.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${SITE_URL}/settings" class="btn" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Upgrade Plan
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `${creditsLeft} AI credits left on ${workspaceName}` });
  },
};

export default aiCreditsLow;
