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

    // Query audit_events without joins (no FK to profiles/contacts)
    let query = ctx.serviceClient
      .from('audit_events')
      .select('id, actor_user_id, contact_id, conversation_id, event_type, event_category, metadata, created_at')
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

    const { data: rows, error } = await query;

    if (error) {
      console.error('[AuditEvents] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const allRows = rows ?? [];
    const hasMore = allRows.length > limit;
    const events = hasMore ? allRows.slice(0, limit) : allRows;

    // Fetch actor profiles and contacts separately (no FK joins)
    const actorIds = [...new Set(events.map((e) => e.actor_user_id).filter(Boolean))];
    const contactIds = [...new Set(events.map((e) => e.contact_id).filter(Boolean))];

    const [profilesRes, contactsRes] = await Promise.all([
      actorIds.length > 0
        ? ctx.serviceClient
            .from('profiles')
            .select('user_id, full_name, email')
            .in('user_id', actorIds)
        : { data: [], error: null },
      contactIds.length > 0
        ? ctx.serviceClient
            .from('contacts')
            .select('id, name, phone')
            .in('id', contactIds)
        : { data: [], error: null },
    ]);

    // Build lookup maps
    const profileMap = new Map<string, { full_name: string | null; email: string }>();
    for (const p of (profilesRes.data ?? []) as Array<{ user_id: string; full_name: string | null; email: string }>) {
      profileMap.set(p.user_id, { full_name: p.full_name, email: p.email });
    }

    const contactMap = new Map<string, { name: string | null; phone: string }>();
    for (const c of (contactsRes.data ?? []) as Array<{ id: string; name: string | null; phone: string }>) {
      contactMap.set(c.id, { name: c.name, phone: c.phone });
    }

    // Merge and mask
    const maskedEvents = events.map((event) => {
      const actor = profileMap.get(event.actor_user_id) ?? null;
      const contact = contactMap.get(event.contact_id) ?? null;
      return {
        id: event.id,
        actor_user_id: event.actor_user_id,
        contact_id: event.contact_id,
        conversation_id: event.conversation_id,
        event_type: event.event_type,
        event_category: event.event_category,
        metadata: event.metadata,
        created_at: event.created_at,
        actor,
        contact: contact
          ? { name: contact.name, phone: maskPhoneNumber(contact.phone) }
          : null,
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
