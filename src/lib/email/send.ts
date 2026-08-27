import { sendEmail } from './client';
import type { EmailTemplateName, EmailResult } from './types';
import type { EmailTemplate } from './types';

import welcome from './templates/welcome';
import planChange from './templates/plan-change';
import paymentFailed from './templates/payment-failed';
import invitation from './templates/invitation';
import aiCreditsLow from './templates/ai-credits-low';
import loginNotification from './templates/login-notification';
import whatsappConfig from './templates/whatsapp-config';
import whatsappReset from './templates/whatsapp-reset';
import subscriptionReminder from './templates/subscription-reminder';
import subscriptionExpired from './templates/subscription-expired';
import subscriptionRenewed from './templates/subscription-renewed';
import creditPurchaseReceipt from './templates/credit-purchase-receipt';
import seatLimitExceeded from './templates/seat-limit-exceeded';

const templates: Record<EmailTemplateName, EmailTemplate> = {
  welcome,
  'plan-change': planChange,
  'payment-failed': paymentFailed,
  invitation,
  'ai-credits-low': aiCreditsLow,
  'login-notification': loginNotification,
  'whatsapp-config': whatsappConfig,
  'whatsapp-reset': whatsappReset,
  'subscription-reminder': subscriptionReminder,
  'subscription-expired': subscriptionExpired,
  'subscription-renewed': subscriptionRenewed,
  'credit-purchase-receipt': creditPurchaseReceipt,
  'seat-limit-exceeded': seatLimitExceeded,
};

function isEnabled(): boolean {
  if (process.env.EMAIL_DISABLED === 'true') return false;
  return true;
}

async function renderAndSend(
  templateName: EmailTemplateName,
  to: string,
  data: Record<string, string>,
): Promise<EmailResult> {
  if (!isEnabled()) {
    console.log(`[email] Skipping ${templateName} (EMAIL_DISABLED=true)`);
    return { id: '', success: true };
  }

  const template = templates[templateName];
  if (!template) {
    return { id: '', success: false, error: `Unknown template: ${templateName}` };
  }

  const { html, text } = template.render(data);

  const result = await sendEmail({
    to,
    subject: template.subject,
    html,
    text,
  });

  return result;
}

// ──────────────────────────────────────────
// Named send functions
// ──────────────────────────────────────────

export async function sendWelcomeEmail(
  to: string,
  data: { name: string; workspaceName: string },
): Promise<EmailResult> {
  return renderAndSend('welcome', to, data);
}

export async function sendPlanChangeEmail(
  to: string,
  data: { name: string; workspaceName: string; plan: string; oldPlan?: string; action?: string },
): Promise<EmailResult> {
  return renderAndSend('plan-change', to, data);
}

export async function sendPaymentFailedEmail(
  to: string,
  data: { name: string; workspaceName: string; reason?: string },
): Promise<EmailResult> {
  return renderAndSend('payment-failed', to, data);
}

export async function sendInvitationEmail(
  to: string,
  data: { name: string; inviterName: string; workspaceName: string; inviteUrl: string },
): Promise<EmailResult> {
  return renderAndSend('invitation', to, data);
}

export async function sendAiCreditsLowEmail(
  to: string,
  data: { name: string; workspaceName: string; creditsLeft: string; plan: string },
): Promise<EmailResult> {
  return renderAndSend('ai-credits-low', to, data);
}

export async function sendLoginNotificationEmail(
  to: string,
  data: { name: string; device: string; location: string; ip: string; time: string; securityUrl: string },
): Promise<EmailResult> {
  return renderAndSend('login-notification', to, data);
}

export async function sendWhatsappConfigEmail(
  to: string,
  data: { name: string; phoneNumberId: string; wabaId?: string; webhookUrl?: string; verifyToken?: string },
): Promise<EmailResult> {
  return renderAndSend('whatsapp-config', to, data);
}

export async function sendWhatsappResetEmail(
  to: string,
  data: { name: string; phoneNumberId?: string },
): Promise<EmailResult> {
  return renderAndSend('whatsapp-reset', to, data);
}

export async function sendSubscriptionReminderEmail(
  to: string,
  data: { name: string; workspaceName: string; plan: string; days: string },
): Promise<EmailResult> {
  return renderAndSend('subscription-reminder', to, data);
}

export async function sendSubscriptionExpiredEmail(
  to: string,
  data: { name: string; workspaceName: string; plan: string },
): Promise<EmailResult> {
  return renderAndSend('subscription-expired', to, data);
}

export async function sendSubscriptionRenewedEmail(
  to: string,
  data: { name: string; workspaceName: string; plan: string; action?: string },
): Promise<EmailResult> {
  return renderAndSend('subscription-renewed', to, data);
}

export async function sendCreditPurchaseReceiptEmail(
  to: string,
  data: { name: string; workspaceName: string; credits: string; amount_kes: string; new_balance: string; date: string },
): Promise<EmailResult> {
  return renderAndSend('credit-purchase-receipt', to, data);
}

export async function sendSeatLimitExceededEmail(
  to: string,
  data: { adminName: string; attempterName: string; workspaceName: string; plan: string; totalSeats: string; currentMembers: string },
): Promise<EmailResult> {
  return renderAndSend('seat-limit-exceeded', to, data);
}
