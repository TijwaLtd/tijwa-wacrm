import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const whatsappReset: EmailTemplate = {
  name: 'whatsapp-reset',
  subject: 'WhatsApp configuration reset',
  render: (data) => {
    const name = data.name || 'there';
    const phoneNumberId = data.phoneNumberId || '';
    const settingsUrl = `${SITE_URL}/settings?tab=whatsapp`;

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  WhatsApp Configuration Reset
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your WhatsApp configuration has been removed. ${phoneNumberId ? `The credentials for phone number <strong>${phoneNumberId}</strong> are no longer stored.` : 'Your credentials are no longer stored.'}
</p>

<!-- Warning Card -->
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca">
  <tr>
    <td style="padding:16px 20px">
      <p style="margin:0;font-size:14px;line-height:22px;color:#991b1b">
        <strong>Inbound messages will stop working</strong> until you reconfigure your credentials and complete Meta webhook registration again.
      </p>
    </td>
  </tr>
</table>

<!-- What to do next -->
<p style="margin:0 0 16px 0;font-size:16px;line-height:26px;color:#374151;font-weight:600">
  What to do next
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0">
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">1</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Re-enter your credentials</strong> &mdash; open WhatsApp Settings and paste your Phone Number ID, Access Token, and optionally your 2-Step PIN.
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
            <strong>Re-register with Meta</strong> &mdash; after saving, click "Verify with Meta" to complete inbound webhook registration.
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
            <strong>Verify your webhook</strong> &mdash; make sure your callback URL and verify token are set in Meta Business Manager.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td>
      <a href="${settingsUrl}" class="btn" style="display:inline-block;background-color:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Open WhatsApp Settings
      </a>
    </td>
  </tr>
</table>`;

    return baseTemplate(content, { preheader: `Your WhatsApp configuration has been removed. Reconfigure to restore inbound messaging.` });
  },
};

export default whatsappReset;
