import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const whatsappConfig: EmailTemplate = {
  name: 'whatsapp-config',
  subject: 'WhatsApp connected — next steps',
  render: (data) => {
    const name = data.name || 'there';
    const phoneNumberId = data.phoneNumberId || '';
    const wabaId = data.wabaId || '';
    const verifyToken = data.verifyToken || '';
    const settingsUrl = `${SITE_URL}/settings?tab=whatsapp`;

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  WhatsApp Connected
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Your WhatsApp credentials have been verified and saved. Here's what was configured and what to do next.
</p>

<!-- Config Details Card -->
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
  <tr>
    <td style="padding:20px 24px">
      <p style="margin:0 0 12px 0;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Configuration</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%">
        <tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px">Phone Number ID</td>
          <td style="padding:6px 0;font-size:14px;color:#111827;font-family:monospace">${phoneNumberId}</td>
        </tr>
        ${wabaId ? `<tr>
          <td style="padding:6px 0;font-size:14px;color:#6b7280">WABA ID</td>
          <td style="padding:6px 0;font-size:14px;color:#111827;font-family:monospace">${wabaId}</td>
        </tr>` : ''}
      </table>
    </td>
  </tr>
</table>

<!-- Next Steps -->
<p style="margin:0 0 16px 0;font-size:16px;line-height:26px;color:#374151;font-weight:600">
  Next Steps
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0">
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">1</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Open your WhatsApp Settings</strong> &mdash; your webhook URL and verify token are shown there. Copy them into Meta Business Manager &rarr; WhatsApp Manager &rarr; Configuration &rarr; Webhook.
          </td>
        </tr>
      </table>
    </td>
  </tr>
  ${verifyToken ? `<tr>
    <td style="padding:12px 0;border-bottom:1px solid #f3f4f6">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">2</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Your Verify Token:</strong><br>
            <span style="font-family:monospace;font-size:13px;background-color:#f3f4f6;padding:4px 8px;border-radius:4px;display:inline-block;margin-top:4px">${verifyToken}</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>` : ''}
  <tr>
    <td style="padding:12px 0">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td width="32" valign="top" style="font-size:20px;padding-right:12px;color:#6366f1">${verifyToken ? '3' : '2'}</td>
          <td style="font-size:15px;line-height:22px;color:#374151">
            <strong>Subscribe to events</strong> &mdash; in Meta's webhook config, subscribe to <em>messages</em> and <em>message_template_status_update</em> to start receiving inbound messages.
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

    return baseTemplate(content, { preheader: `WhatsApp credentials verified. Open your settings to find your webhook URL and complete setup.` });
  },
};

export default whatsappConfig;
