import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSubscriptionReminderEmail } from '@/lib/email/send';

/**
 * GET /api/subscription/cron
 *
 * Daily cron job that checks for subscriptions expiring within 7 days
 * and sends reminder emails to admin members. Meant to be hit on a
 * schedule (Vercel Cron / external pinger) — requires a shared secret
 * via the `x-cron-secret` header.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 });
  }
  const supplied = request.headers.get('x-cron-secret') ?? '';
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    // Find subscriptions that are active and renewing within 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: expiringSubs, error: subsErr } = await serviceClient
      .from('subscriptions')
      .select('id, account_id, plan, current_period_end, status')
      .eq('status', 'active')
      .not('current_period_end', 'is', null)
      .lte('current_period_end', sevenDaysFromNow.toISOString())
      .gte('current_period_end', new Date().toISOString());

    if (subsErr) {
      console.error('[subscription/cron] fetch error:', subsErr);
      return NextResponse.json({ error: 'Failed to query subscriptions' }, { status: 500 });
    }

    if (!expiringSubs || expiringSubs.length === 0) {
      return NextResponse.json({ checked: true, reminded: 0 });
    }

    let reminded = 0;

    for (const sub of expiringSubs) {
      // Get account name
      const { data: settings } = await serviceClient
        .from('tenant_settings')
        .select('display_name')
        .eq('account_id', sub.account_id)
        .maybeSingle();

      const workspaceName = settings?.display_name || 'your workspace';

      // Calculate days until renewal
      const periodEnd = new Date(sub.current_period_end);
      const now = new Date();
      const daysUntilRenewal = Math.ceil(
        (periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Get admin members to notify
      const { data: admins } = await serviceClient
        .from('account_memberships')
        .select('user_id')
        .eq('account_id', sub.account_id)
        .in('role', ['owner', 'admin']);

      if (!admins || admins.length === 0) continue;

      // Get profiles for admin emails
      const userIds = admins.map((a) => a.user_id);
      const { data: profiles } = await serviceClient
        .from('profiles')
        .select('user_id, full_name, email')
        .in('user_id', userIds);

      if (!profiles) continue;

      for (const profile of profiles) {
        if (!profile.email) continue;

        const result = await sendSubscriptionReminderEmail(profile.email, {
          name: profile.full_name || 'there',
          workspaceName,
          plan: sub.plan,
          days: String(daysUntilRenewal),
        });

        if (result.success) reminded++;
      }
    }

    return NextResponse.json({
      checked: true,
      expiring: expiringSubs.length,
      reminded,
    });
  } catch (err) {
    console.error('[subscription/cron] error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
