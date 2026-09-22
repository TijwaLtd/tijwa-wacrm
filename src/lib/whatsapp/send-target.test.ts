import { describe, expect, it, vi } from 'vitest';

import {
  isPlaceholderOrEmptyPhone,
  resolveSendTarget,
  sendViaTarget,
  NO_SEND_TARGET_MESSAGE,
} from './send-target';

describe('isPlaceholderOrEmptyPhone', () => {
  it('treats empty and bsuid_ placeholders as unusable', () => {
    expect(isPlaceholderOrEmptyPhone('')).toBe(true);
    expect(isPlaceholderOrEmptyPhone(null)).toBe(true);
    expect(isPlaceholderOrEmptyPhone(undefined)).toBe(true);
    expect(isPlaceholderOrEmptyPhone('bsuid_abc123')).toBe(true);
  });

  it('treats real phones as usable', () => {
    expect(isPlaceholderOrEmptyPhone('+14155551212')).toBe(false);
    expect(isPlaceholderOrEmptyPhone('14155551212')).toBe(false);
  });
});

describe('resolveSendTarget', () => {
  it('returns null when neither phone nor bsuid exists', () => {
    expect(resolveSendTarget({ phone: '', bsuid: null })).toBeNull();
    expect(resolveSendTarget({})).toBeNull();
    expect(resolveSendTarget({ phone: 'bsuid_x', bsuid: null })).toBeNull();
  });

  it('prefers a valid phone and attaches BSUID as fallback', () => {
    const target = resolveSendTarget({
      phone: '+14155551212',
      bsuid: 'user-9',
    });
    expect(target).toMatchObject({ kind: 'phone', phone: '14155551212', bsuid: 'user-9' });
    if (target?.kind !== 'phone') throw new Error('expected phone target');
    expect(target.variants[0]).toBe('14155551212');
    expect(target.variants.length).toBeGreaterThan(1);
  });

  it('falls back to BSUID when phone is a placeholder', () => {
    expect(
      resolveSendTarget({ phone: 'bsuid_user-1', bsuid: 'user-1' }),
    ).toEqual({ kind: 'bsuid', bsuid: 'user-1' });
  });

  it('falls back to BSUID when phone is not E.164', () => {
    expect(resolveSendTarget({ phone: 'abc', bsuid: 'user-2' })).toEqual({
      kind: 'bsuid',
      bsuid: 'user-2',
    });
  });

  it('uses phone only (no bsuid field) when bsuid is absent', () => {
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: null });
    expect(target).toMatchObject({ kind: 'phone', bsuid: null });
  });
});

describe('sendViaTarget — phone path', () => {
  it('returns the first successful variant and its working phone', async () => {
    const attempt = vi.fn(async (to: string) => {
      if (to === '14155551212') return 'wamid-1';
      throw new Error('(#131030) Recipient phone number not in allowed list');
    });
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: null })!;
    const result = await sendViaTarget(target, attempt);
    expect(result).toEqual({ messageId: 'wamid-1', workingPhone: '14155551212' });
  });

  it('propagates Meta waId from a MetaSendResult-shaped attempt', async () => {
    const attempt = vi.fn(async () => ({
      messageId: 'wamid-1',
      waId: '14155550123',
    }));
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: null })!;
    const result = await sendViaTarget(target, attempt);
    expect(result.messageId).toBe('wamid-1');
    expect(result.waId).toBe('14155550123');
    expect(result.workingPhone).toBe('14155551212');
  });

  it('tries subsequent variants on recipient-not-allowed', async () => {
    const attempt = vi.fn(async (to: string) => {
      if (to === '370063949836') return 'wamid-ok';
      throw new Error('(#131030) not in allowed list');
    });
    const target = resolveSendTarget({ phone: '+37063949836', bsuid: null })!;
    const result = await sendViaTarget(target, attempt);
    expect(result.messageId).toBe('wamid-ok');
    expect(result.workingPhone).toBe('370063949836');
    expect(attempt.mock.calls.length).toBeGreaterThan(1);
  });

  it('throws hard Meta errors without trying further variants', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('(#100) Invalid parameter');
    });
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: 'user-9' })!;
    await expect(sendViaTarget(target, attempt)).rejects.toThrow(/Invalid parameter/);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('falls back to BSUID when all phone variants are not-allowed', async () => {
    const attempt = vi.fn(async (to: string) => {
      if (to === 'user-9') return 'wamid-bsuid';
      throw new Error('(#131030) not in allowed list');
    });
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: 'user-9' })!;
    const result = await sendViaTarget(target, attempt);
    expect(result).toEqual({ messageId: 'wamid-bsuid' });
    expect(attempt).toHaveBeenCalledWith('user-9');
  });

  it('rethrows the phone error when both phone and BSUID fail', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('(#131030) not in allowed list');
    });
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: 'user-9' })!;
    await expect(sendViaTarget(target, attempt)).rejects.toThrow(/131030/);
  });

  it('throws NO_SEND_TARGET_MESSAGE when phone has no variants and no bsuid', async () => {
    // Degenerate: empty variant list can't happen for valid E.164, but
    // the no-bsuid terminal path must still surface a clear error.
    const attempt = vi.fn(async () => {
      throw new Error('(#131030) not in allowed list');
    });
    const target = resolveSendTarget({ phone: '+14155551212', bsuid: null })!;
    await expect(sendViaTarget(target, attempt)).rejects.toThrow(/131030/);
  });
});

describe('sendViaTarget — BSUID path', () => {
  it('sends with the BSUID as `to` when there is no phone', async () => {
    const attempt = vi.fn(async (to: string) => {
      expect(to).toBe('user-1');
      return 'wamid-b';
    });
    const target = resolveSendTarget({ phone: 'bsuid_user-1', bsuid: 'user-1' })!;
    const result = await sendViaTarget(target, attempt);
    expect(result).toEqual({ messageId: 'wamid-b' });
    expect(result.workingPhone).toBeUndefined();
  });

  it('propagates BSUID send failures', async () => {
    const attempt = vi.fn(async () => {
      throw new Error('Meta BSUID rejected');
    });
    const target = resolveSendTarget({ phone: '', bsuid: 'user-1' })!;
    await expect(sendViaTarget(target, attempt)).rejects.toThrow(/BSUID rejected/);
  });
});

describe('NO_SEND_TARGET_MESSAGE', () => {
  it('is the shared no-identity error text', () => {
    expect(NO_SEND_TARGET_MESSAGE).toMatch(/phone number or WhatsApp user ID/);
  });
});
