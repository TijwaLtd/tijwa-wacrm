import { baseTemplate } from './base';
import type { EmailTemplate } from '../types';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

const loginNotification: EmailTemplate = {
  name: 'login-notification',
  subject: 'New sign-in to your account',
  render: (data) => {
    const name = data.name || 'there';
    const device = data.device || 'Unknown device';
    const location = data.location || 'Unknown location';
    const ip = data.ip || 'Unknown IP';
    const time = data.time || new Date().toLocaleString();
    const securityUrl = data.securityUrl || `${SITE_URL}/settings/security`;

    const content = `
<h1 style="margin:0 0 16px 0;font-size:28px;line-height:36px;font-weight:700;color:#111827">
  New sign-in detected
</h1>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  Hi ${name},
</p>
<p style="margin:0 0 24px 0;font-size:16px;line-height:26px;color:#374151">
  We detected a new sign-in to your Tijwa account.
</p>

<!-- Sign-in details card -->
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#f9fafb;border-radius:8px;border:1px solid #e5e7eb">
  <tr>
    <td style="padding:20px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;color:#6b7280;padding-bottom:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">
            Sign-in Details
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:8px">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="80" style="font-size:13px;color:#6b7280;padding-right:12px">Device</td>
                <td style="font-size:14px;color:#111827;font-weight:500">${device}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:8px">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="80" style="font-size:13px;color:#6b7280;padding-right:12px">Location</td>
                <td style="font-size:14px;color:#111827;font-weight:500">${location}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding-bottom:8px">
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="80" style="font-size:13px;color:#6b7280;padding-right:12px">IP</td>
                <td style="font-size:14px;color:#111827;font-weight:500">${ip}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
            <table role="presentation" cellpadding="0" cellspacing="0">
              <tr>
                <td width="80" style="font-size:13px;color:#6b7280;padding-right:12px">Time</td>
                <td style="font-size:14px;color:#111827;font-weight:500">${time}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Warning if not them -->
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 24px 0;background-color:#fef2f2;border-radius:8px;border:1px solid #fecaca">
  <tr>
    <td style="padding:16px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:14px;color:#991b1b;font-weight:600;padding-right:8px">⚠</td>
          <td style="font-size:14px;color:#991b1b">
            <strong>Wasn't you?</strong> If you don't recognize this sign-in, secure your account immediately.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px 0">
  <tr>
    <td>
      <a href="${securityUrl}" class="btn" style="display:inline-block;background-color:#dc2626;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;text-align:center">
        Secure My Account
      </a>
    </td>
  </tr>
</table>

<p style="margin:0;font-size:13px;line-height:20px;color:#6b7280">
  If this was you, no action is needed. This is a one-time notification for new sign-ins.
</p>`;

    return baseTemplate(content, {
      preheader: `New sign-in from ${device} in ${location}`,
    });
  },
};

export default loginNotification;
