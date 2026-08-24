import nodemailer, { type Transporter } from 'nodemailer';
import type { SendEmailOptions, EmailResult } from './types';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      '[email] Missing SMTP config. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env',
    );
  }

  _transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 10_000,
  });

  return _transporter;
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM || 'Tijwa <noreply@tijwa.com>';
}

const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendEmail(
  options: SendEmailOptions,
  retries = MAX_RETRIES,
): Promise<EmailResult> {
  try {
    const transporter = getTransporter();
    const result = await transporter.sendMail({
      from: getFromAddress(),
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
    });

    console.log(`[email] Sent ${options.subject} → ${options.to} (id: ${result.messageId})`);

    return { id: result.messageId, success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (retries > 0) {
      console.warn(`[email] Failed (${message}), retrying...`);
      await sleep(RETRY_DELAY_MS);
      return sendEmail(options, retries - 1);
    }

    console.error(`[email] Failed after retries: ${message}`);
    return { id: '', success: false, error: message };
  }
}

export async function verifyConnection(): Promise<boolean> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    console.log('[email] SMTP connection verified');
    return true;
  } catch (error) {
    console.error('[email] SMTP verification failed:', error);
    return false;
  }
}
