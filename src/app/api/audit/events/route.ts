// ============================================================
// POST /api/audit/events — Record a frontend-reported audit event
// GET  /api/audit/events — Query audit events (admin+ only)
// ============================================================

import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { AuditService } from '@/lib/audit/service';
import { FRONTEND_REPORTABLE_EVENTS } from '@/lib/audit/events';
import { maskPhoneNumber } from '@/lib/audit/masking';
import type { AuditEventTypeValue } from '@/lib/audit/events';

// ------- POST -------
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');

    const body = await request.json();
    const { eventType, contactId, conversationId, metadata } = body as {
      eventType: string;
      contactId?: string;
      conversationId?: string;
      metadata?: Record<string, unknown>;
    };

    if (!eventType || !FRONTEND_REPORTABLE_EVENTS.has(eventType)) {
      return NextResponse.json(
        { error: 'Invalid or forbidden event type' },
        { status: 400 },
      );
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ipAddress = forwarded?.split(',')[0]?.trim() ?? null;
    const userAgent = request.headers.get('user-agent') ?? null;

    await AuditService.record({
      eventType: eventType as AuditEventTypeValue,
      accountId: ctx.accountId,
      actorUserId: ctx.userId,
      contactId,
      conversationId,
      metadata: metadata ?? {},
      ipAddress: ipAddress ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

// ------- GET -------
export async function GET(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const { searchParams } = new URL(request.url);
    const userFilter = searchParams.get('user');
    const contactFilter = searchParams.get('contact');
    const eventTypeFilter = searchParams.get('event_type');
    const categoryFilter = searchParams.get('event_category');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const cursor = searchParams.get('cursor');
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 100);

    let query = ctx.serviceClient
      .from('audit_events')
      .select(`
        id,
        actor_user_id,
        contact_id,
        conversation_id,
        event_type,
        event_category,
        metadata,
        created_at,
        actor:profiles!audit_events_actor_user_id_fkey(full_name, email),
        contact:contacts!audit_events_contact_id_fkey(name, phone)
      `)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });

    if (userFilter) {
      query = query.eq('actor_user_id', userFilter);
    }
    if (contactFilter) {
      query = query.eq('contact_id', contactFilter);
    }
    if (eventTypeFilter) {
      query = query.eq('event_type', eventTypeFilter);
    }
    if (categoryFilter) {
      query = query.eq('event_category', categoryFilter);
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Cursor-based pagination
    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf-8');
      const [cursorDate, cursorId] = decoded.split('|');
      if (cursorDate && cursorId) {
        query = query.or(
          `created_at.lt.${cursorDate},and(created_at.eq.${cursorDate},id.lt.${cursorId})`,
        );
      }
    }

    query = query.limit(limit + 1);

    const { data, error } = await query;

    if (error) {
      console.error('[AuditEvents] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const events = hasMore ? rows.slice(0, limit) : rows;

    // Mask phone numbers in contact data
    const maskedEvents = events.map((event) => {
      const contactRaw = event.contact as unknown as { name: string | null; phone: string } | null;
      return {
        ...event,
        contact: contactRaw
          ? {
              name: contactRaw.name,
              phone: maskPhoneNumber(contactRaw.phone),
            }
          : null,
        actor: event.actor,
      };
    });

    // Build next cursor
    let nextCursor: string | null = null;
    if (hasMore && events.length > 0) {
      const last = events[events.length - 1];
      nextCursor = Buffer.from(`${last.created_at}|${last.id}`).toString('base64url');
    }

    return NextResponse.json({
      data: maskedEvents,
      meta: { next_cursor: nextCursor },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
