export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailResult {
  id: string;
  success: boolean;
  error?: string;
}

export interface EmailTemplate {
  name: string;
  subject: string;
  render: (data: Record<string, string>) => { html: string; text: string };
}

export type EmailTemplateName =
  | 'welcome'
  | 'plan-change'
  | 'payment-failed'
  | 'invitation'
  | 'ai-credits-low'
  | 'login-notification';
