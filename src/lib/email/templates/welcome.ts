import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const welcome: EmailTemplate = {
  name: 'welcome',
  subject: 'Welcome to Tijwa',
  render: (data) => {
    const name = data.name || 'there';
    const workspaceName = data.workspaceName || 'your workspace';

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  Welcome to Tijwa
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your workspace <strong>${workspaceName}</strong> is ready. Here's what you can do next:
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0">
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">1</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Connect WhatsApp</strong> &mdash; link your business number to start receiving messages
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">2</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Invite your team</strong> &mdash; add agents to handle conversations together
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:12px 0">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">3</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Turn on AI assistant</strong> &mdash; let AI handle replies while your team focuses on what matters
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${SITE_URL}" class="btn" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Go to Dashboard
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `Your workspace ${workspaceName} is ready` });
  },
};

export default welcome;
