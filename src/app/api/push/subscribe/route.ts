// ============================================================
// POST /api/push/subscribe — register a Web Push subscription
// DELETE /api/push/subscribe — remove one by endpoint
//
// The browser calls these after `pushManager.subscribe()`. RLS on
// push_subscriptions restricts every row to the authenticated user
// (migration 105), so the client-scoped `supabase` from requireRole
// is enough — no service-role needed.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
}

export async function POST(request: Request) {
  try {
    const { supabase, userId, accountId } = await requireRole('viewer');

    const body = (await request.json().catch(() => null)) as SubscribeBody | null;
    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: 'endpoint and keys.p256dh / keys.auth are required' },
        { status: 400 },
      );
    }

    // Re-subscribing with a rotated key must overwrite the old row —
    // endpoint is UNIQUE, so upsert on it.
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        account_id: accountId,
        endpoint,
        p256dh,
        auth,
        user_agent: body?.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    if (error) {
      console.error('[push/subscribe] upsert failed:', error);
      return NextResponse.json(
        { error: 'Failed to save subscription' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase } = await requireRole('viewer');

    const body = (await request.json().catch(() => null)) as {
      endpoint?: string;
    } | null;
    if (!body?.endpoint) {
      return NextResponse.json(
        { error: 'endpoint is required' },
        { status: 400 },
      );
    }

    // RLS scopes the delete to this user's own rows.
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', body.endpoint);
    if (error) {
      console.error('[push/subscribe] delete failed:', error);
      return NextResponse.json(
        { error: 'Failed to remove subscription' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
