import { describe, expect, it } from 'vitest';

import { defaultTag } from './notify';
import { urlBase64ToUint8Array } from './push-client';

describe('defaultTag', () => {
  it('scopes conversation-scoped types to the conversation', () => {
    expect(defaultTag('message_received', 'conv-1')).toBe(
      'message_received:conv-1',
    );
  });

  it('falls back to the bare type when there is no conversation', () => {
    expect(defaultTag('billing_confirmation')).toBe('billing_confirmation');
  });
});

describe('urlBase64ToUint8Array', () => {
  it('decodes a VAPID-style base64url key to bytes', () => {
    // "AQID" == base64url for bytes 1,2,3
    const out = urlBase64ToUint8Array('AQID');
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });

  it('handles missing padding', () => {
    const out = urlBase64ToUint8Array('AQI');
    expect(Array.from(out)).toEqual([1, 2]);
  });
});
