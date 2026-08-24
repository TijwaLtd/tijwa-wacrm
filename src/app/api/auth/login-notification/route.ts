// ============================================================
// POST /api/auth/login-notification
//
// Sends a login notification email with device info, location,
// and a security link. Called fire-and-forget from the client
// after successful sign-in.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendLoginNotificationEmail } from '@/lib/email/send';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const UAParser = require('ua-parser-js');

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function parseDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';

  const parser = new UAParser(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  const parts: string[] = [];

  // Device type (mobile/tablet) or browser name
  if (device.type === 'mobile') parts.push('Mobile');
  else if (device.type === 'tablet') parts.push('Tablet');

  if (browser.name) parts.push(browser.name);
  if (browser.major) parts.push(browser.major);

  if (os.name) parts.push(os.name);
  if (os.version) parts.push(os.version);

  return parts.length > 0 ? parts.join(' · ') : 'Unknown device';
}

function getBaseUrl(request: Request): string {
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const host = request.headers.get('host') || process.env.NEXT_PUBLIC_SITE_URL?.replace(/^https?:\/\//, '') || 'crm.example.com';
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  // Use service-role client to avoid RLS issues on profile lookup
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user profile for name
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('user_id', user.id)
    .single();

  const name = profile?.full_name || user.email?.split('@')[0] || 'there';
  const userAgent = request.headers.get('user-agent');
  const ip = getClientIp(request);
  const device = parseDevice(userAgent);
  const time = new Date().toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const baseUrl = getBaseUrl(request);
  const securityUrl = `${baseUrl}/settings/security`;

  // Fire-and-forget — don't block the response
  sendLoginNotificationEmail(user.email || '', {
    name,
    device,
    location: 'Sign-in from ' + ip,
    ip,
    time,
    securityUrl,
  }).catch((err) => console.error('[login-notification] email failed:', err));

  return NextResponse.json({ ok: true });
}
