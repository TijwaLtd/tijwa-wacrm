import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const planLabels: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const planChange: EmailTemplate = {
  name: 'plan-change',
  subject: 'Your plan has been updated',
  render: (data) => {
    const name = data.name || 'there';
    const workspaceName = data.workspaceName || 'your workspace';
    const newPlan = planLabels[data.plan] || data.plan || 'Unknown';
    const oldPlan = planLabels[data.oldPlan] || data.oldPlan;
    const action = data.action || 'upgraded';

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  Plan updated
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your workspace <strong>${workspaceName}</strong> has been ${action} to the <strong>${newPlan}</strong> plan.
  ${oldPlan ? `You were previously on the <strong>${oldPlan}</strong> plan.` : ''}
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
  <tr>
    <td style="padding:20px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;color:#6b7280;padding-bottom:8px">CURRENT PLAN</td>
        </tr>
        <tr>
          <td style="font-size:20px;font-weight:700;color:#111827">${newPlan}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#6b7280">
  You can view your plan details and billing anytime from your workspace settings.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${SITE_URL}/settings" class="btn" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        View Settings
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `Your plan has been ${action} to ${newPlan}` });
  },
};

export default planChange;
