import type { EmailTemplate } from '../types';

const creditPurchaseReceipt: EmailTemplate = {
  name: 'credit-purchase-receipt',
  subject: 'Your AI Credit Purchase Receipt',
  render: (data) => ({
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="font-size: 24px; font-weight: 600; color: #0f172a; margin: 0;">AI Credit Purchase Receipt</h1>
    </div>

    <div style="background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 32px; margin-bottom: 24px;">
      <p style="font-size: 16px; color: #334155; margin: 0 0 24px 0;">Hi ${data.name},</p>

      <p style="font-size: 14px; color: #475569; margin: 0 0 24px 0;">
        Your credit purchase was successful. Here are the details:
      </p>

      <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Credits purchased</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 600;">${data.credits} credits</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Amount paid</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 600;">KES ${data.amount_kes}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 14px; color: #64748b;">New balance</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; text-align: right; font-weight: 600;">${data.new_balance} credits</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-size: 14px; color: #64748b;">Date</td>
            <td style="padding: 8px 0; font-size: 14px; color: #0f172a; text-align: right;">${data.date}</td>
          </tr>
        </table>
      </div>

      <p style="font-size: 14px; color: #475569; margin: 0 0 16px 0;">
        Credits never expire until used. Each credit powers approximately 5 AI replies.
      </p>

      <p style="font-size: 14px; color: #475569; margin: 0;">
        — The ${data.workspaceName} team
      </p>
    </div>

    <div style="text-align: center;">
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        This is a receipt for your credit purchase. No payment action is required.
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `AI Credit Purchase Receipt

Hi ${data.name},

Your credit purchase was successful:
- Credits purchased: ${data.credits}
- Amount paid: KES ${data.amount_kes}
- New balance: ${data.new_balance} credits
- Date: ${data.date}

Credits never expire until used. Each credit powers approximately 5 AI replies.

— The ${data.workspaceName} team
`,
  }),
};

export default creditPurchaseReceipt;
