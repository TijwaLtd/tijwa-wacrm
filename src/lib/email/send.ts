import { sendEmail } from './client';
import type { EmailTemplateName, EmailResult } from './types';
import type { EmailTemplate } from './types';

import welcome from './templates/welcome';
import planChange from './templates/plan-change';
import paymentFailed from './templates/payment-failed';
import invitation from './templates/invitation';
import aiCreditsLow from './templates/ai-credits-low';
import loginNotification from './templates/login-notification';

const templates: Record<EmailTemplateName, EmailTemplate> = {
  welcome,
  'plan-change': planChange,
  'payment-failed': paymentFailed,
  invitation,
  'ai-credits-low': aiCreditsLow,
  'login-notification': loginNotification,
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
