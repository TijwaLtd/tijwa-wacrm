import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock nodemailer ──────────────────────────────────────
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-123' });
const mockVerify = vi.fn().mockResolvedValue(true);

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
      verify: mockVerify,
    })),
  },
}));

// Set env vars before importing modules
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'test-pass';
process.env.EMAIL_FROM = 'Test <test@test.com>';

const { sendEmail, verifyConnection } = await import('./client');

describe('email/client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendEmail returns success with messageId', async () => {
    const result = await sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('test-123');
    expect(mockSendMail).toHaveBeenCalledOnce();
  });

  it('sendEmail returns error on failure after retries', async () => {
    mockSendMail.mockRejectedValueOnce(new Error('SMTP timeout'));
    mockSendMail.mockResolvedValueOnce({ messageId: 'retry-456' });

    const result = await sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('retry-456');
  });

  it('sendEmail returns failure after all retries exhausted', async () => {
    mockSendMail.mockRejectedValue(new Error('Connection refused'));

    const result = await sendEmail({
      to: 'user@test.com',
      subject: 'Test',
      html: '<p>Hello</p>',
    }, 0); // no retries

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });

  it('verifyConnection returns true on success', async () => {
    const result = await verifyConnection();
    expect(result).toBe(true);
    expect(mockVerify).toHaveBeenCalledOnce();
  });

  it('verifyConnection returns false on failure', async () => {
    mockVerify.mockRejectedValueOnce(new Error('Auth failed'));

    const result = await verifyConnection();
    expect(result).toBe(false);
  });
});
