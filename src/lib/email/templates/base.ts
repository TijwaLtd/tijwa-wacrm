const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://crm.example.com';

export function baseTemplate(content: string, opts?: { preheader?: string }): {
  html: string;
  text: string;
} {
  const preheader = opts?.preheader || '';

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Tijwa</title>
  <!--[if mso]>
  <style>table,td{font-family:Arial,sans-serif!important}</style>
  <![endif]-->
  <style>
    /* Reset */
    body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
    table,td{mso-table-lspace:0;mso-table-rspace:0}
    img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
    body{margin:0;padding:0;width:100%!important;height:100%!important;background-color:#f4f5f7}

    /* Responsive */
    @media only screen and (max-width:640px){
      .container{width:100%!important;padding:16px!important}
      .content{padding:24px!important}
      h1{font-size:24px!important;line-height:32px!important}
      .btn{display:block!important;width:100%!important}
      .footer{padding:16px!important}
    }

    /* Dark mode */
    @media (prefers-color-scheme:dark){
      body{background-color:#0f1114!important}
      .container{background-color:#1a1d22!important}
      .content{color:#e4e5e7!important}
      h1,h2,p{color:#e4e5e7!important}
      .footer{color:#8b8d93!important}
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:#f4f5f7">${preheader}</div>` : ''}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7">
    <tr>
      <td align="center" style="padding:40px 16px">

        <!-- Logo -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
          <tr>
            <td align="center" style="padding-bottom:24px">
              <a href="${SITE_URL}" style="font-size:20px;font-weight:700;color:#111827;text-decoration:none">
                tijwa
              </a>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="container" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
          <tr>
            <td class="content" style="padding:40px 48px">
              ${content}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="footer" style="max-width:560px">
          <tr>
            <td align="center" style="padding:24px 16px;font-size:12px;line-height:18px;color:#6b7280">
              <p style="margin:0 0 8px 0">
                Tijwa &mdash; WhatsApp CRM
              </p>
              <p style="margin:0">
                <a href="${SITE_URL}/settings/notifications" style="color:#6b7280;text-decoration:underline">Notification settings</a>
                &nbsp;&middot;&nbsp;
                <a href="${SITE_URL}/settings" style="color:#6b7280;text-decoration:underline">Account</a>
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = preheader ? `${preheader}\n\n${content.replace(/<[^>]+>/g, '')}` : content.replace(/<[^>]+>/g, '');

  return { html, text };
}
