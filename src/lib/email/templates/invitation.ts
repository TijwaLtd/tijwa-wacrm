import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const invitation: EmailTemplate = {
  name: 'invitation',
  subject: 'You\'ve been invited to join a workspace',
  render: (data) => {
    const name = data.name || 'there';
    const inviterName = data.inviterName || 'Someone';
    const workspaceName = data.workspaceName || 'a workspace';
    const inviteUrl = data.inviteUrl || SITE_URL;

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  You're invited
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  <strong>${inviterName}</strong> has invited you to join <strong>${workspaceName}</strong> on Tijwa.
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Click below to accept and get started:
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${inviteUrl}" class="btn" style="display:inline-block;background-color:#6366f1;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Accept Invitation
      </a>
    </td>
  </tr>
</table>

<p style="margin:24px 0 0 0;font-size:14px;line-height:22px;color:#6b7280">
  If you didn't expect this invitation, you can safely ignore this email.
</p>`;

    return baseTemplate(content, { preheader: `${inviterName} invited you to ${workspaceName}` });
  },
};

export default invitation;
