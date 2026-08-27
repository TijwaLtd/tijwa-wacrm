import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const planLabels: Record<string, string> = {
  starter: 'Starter',
  business: 'Business',
  growth: 'Growth',
  enterprise: 'Enterprise',
};

const subscriptionRenewed: EmailTemplate = {
  name: 'subscription-renewed',
  subject: 'Your subscription is active',
  render: (data) => {
    const name = data.name || 'there';
    const workspaceName = data.workspaceName || 'your workspace';
    const plan = planLabels[data.plan] || data.plan || 'your';
    const action = data.action || 'renewed';

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  ${action === 'activated' ? 'Welcome!' : 'Welcome back!'}
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your <strong>${plan}</strong> plan for <strong>${workspaceName}</strong> is now active.
  ${action === 'activated' ? 'You can start using all features included in your plan.' : 'All features have been restored.'}
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0">
  <tr>
    <td style="padding:20px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;color:#166534;font-weight:600">
            You're all set:
          </td>
        </tr>
        <tr>
          <td style="font-size:14px;color:#166534;padding-top:8px">
            &bull; Send and receive messages<br>
            &bull; Create team conversations<br>
            &bull; Add new contacts<br>
            &bull; AI assistant and automations
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${SITE_URL}/inbox" class="btn" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Go to Inbox
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `Your ${plan} subscription is active — welcome back!` });
  },
};

export default subscriptionRenewed;
