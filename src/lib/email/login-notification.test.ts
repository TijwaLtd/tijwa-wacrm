import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock nodemailer ──────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-123' });

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

const { sendLoginNotificationEmail } = await import('./send');

describe('email/send - login notification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendLoginNotificationEmail sends correctly', async () => {
    const result = await sendLoginNotificationEmail('user@test.com', {
      name: 'Alice',
      device: 'Chrome · 120 · Windows 11',
      location: 'Sign-in from 1.2.3.4',
      ip: '1.2.3.4',
      time: 'Mon, Jan 15, 2025, 10:30 AM UTC',
      securityUrl: 'https://crm.example.com/settings/security',
    });

    expect(result.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledOnce();

    const call = mockSendMail.mock.calls[0][0];
    expect(call.to).toBe('user@test.com');
    expect(call.subject).toContain('sign-in');
    expect(call.html).toContain('Chrome');
    expect(call.html).toContain('Windows 11');
    expect(call.html).toContain('1.2.3.4');
    expect(call.html).toContain('Secure My Account');
  });
});
