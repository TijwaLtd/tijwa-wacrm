import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock nodemailer ──────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'send-789' });

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: vi.fn(),
    })),
  },
}));

process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'test-pass';
process.env.EMAIL_FROM = 'Test <test@test.com>';

const {
  sendWelcomeEmail,
  sendPlanChangeEmail,
  sendPaymentFailedEmail,
  sendInvitationEmail,
  sendAiCreditsLowEmail,
} = await import('./send');

describe('email/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendWelcomeEmail sends correctly', async () => {
    const result = await sendWelcomeEmail('user@test.com', {
      name: 'Alice',
      workspaceName: 'Test Co',
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();

    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('user@test.com');
    expect(call.subject).toContain('Welcome');
    expect(call.html).toContain('Alice');
  });

  it('sendPlanChangeEmail sends correctly', async () => {
    const result = await sendPlanChangeEmail('user@test.com', {
      name: 'Bob',
      workspaceName: 'Test Co',
      plan: 'pro',
      oldPlan: 'starter',
    });

    expect(result.success).toBe(true);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('updated');
    expect(call.html).toContain('Pro');
  });

  it('sendPaymentFailedEmail sends correctly', async () => {
    const result = await sendPaymentFailedEmail('user@test.com', {
      name: 'Carol',
      workspaceName: 'Test Co',
    });

    expect(result.success).toBe(true);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('Payment failed');
  });

  it('sendInvitationEmail sends correctly', async () => {
    const result = await sendInvitationEmail('user@test.com', {
      name: 'Dave',
      inviterName: 'Eve',
      workspaceName: 'Test Co',
      inviteUrl: 'https://example.com/invite/123',
    });

    expect(result.success).toBe(true);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('invited');
    expect(call.html).toContain('https://example.com/invite/123');
  });

  it('sendAiCreditsLowEmail sends correctly', async () => {
    const result = await sendAiCreditsLowEmail('user@test.com', {
      name: 'Frank',
      workspaceName: 'Test Co',
      creditsLeft: '5',
      plan: 'starter',
    });

    expect(result.success).toBe(true);
    const call = mockSendMail.mock.calls[0][0];
    expect(call.subject).toContain('credits');
    expect(call.html).toContain('5');
  });

  it('skips sending when EMAIL_DISABLED=true', async () => {
    process.env.EMAIL_DISABLED = 'true';

    const result = await sendWelcomeEmail('user@test.com', {
      name: 'Test',
      workspaceName: 'Test',
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();

    delete process.env.EMAIL_DISABLED;
  });
});
