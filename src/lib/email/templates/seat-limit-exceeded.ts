import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const seatLimitExceeded: EmailTemplate = {
  name: 'seat-limit-exceeded',
  subject: 'Team member join failed — seat limit reached',
  render: (data) => {
    const adminName = data.adminName || 'Admin';
    const attempterName = data.attempterName || 'A user';
    const workspaceName = data.workspaceName || 'your workspace';
    const plan = data.plan || 'starter';
    const totalSeats = data.totalSeats || '1';
    const currentMembers = data.currentMembers || '0';
    const billingUrl = data.billingUrl || `${SITE_URL}/billing`;

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  Team join failed — seat limit reached
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${adminName},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  <strong>${attempterName}</strong> tried to join <strong>${workspaceName}</strong> but couldn't because your team has reached its seat limit.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <tr style="background-color:#f9fafb">
    <td style="padding:12px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb;width:50%">Plan</td>
    <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;font-weight:600;text-transform:capitalize">${plan}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb">Total seats</td>
    <td style="padding:12px 16px;font-size:14px;color:#111827;border-bottom:1px solid #e5e7eb;font-weight:600">${totalSeats}</td>
  </tr>
  <tr style="background-color:#f9fafb">
    <td style="padding:12px 16px;font-size:14px;color:#6b7280">Members</td>
    <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600">${currentMembers} of ${totalSeats} used</td>
  </tr>
</table>

<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  To allow more team members, you can:
</p>
<ul style="margin:0 0 24px 0;padding-left:24px;font-size:16px;line-height:26px;color:#374151">
  <li>Purchase extra seats at KES 750/mo each</li>
  <li>Upgrade to a plan with more included seats</li>
</ul>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${billingUrl}" class="btn" style="display:inline-block;background-color:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Manage Billing
      </a>
    </td>
  </tr>
</table>

<p style="margin:24px 0 0 0;font-size:14px;line-height:22px;color:#6b7280">
  You're receiving this because you're the owner of this workspace.
</p>`;

    return baseTemplate(content, {
      preheader: `${attempterName} couldn't join ${workspaceName} — seat limit reached`,
    });
  },
};

export default seatLimitExceeded;
