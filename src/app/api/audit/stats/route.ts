// ============================================================
// GET /api/audit/stats — Summary audit stats for dashboard
// ============================================================

import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function GET() {
  try {
    const ctx = await requireRole('admin');

    const { data, error } = await ctx.serviceClient
      .from('audit_events')
      .select('event_type')
      .eq('account_id', ctx.accountId);

    if (error) {
      console.error('[AuditStats] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{ event_type: string }>;

    // Count events by type
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.event_type] = (counts[row.event_type] ?? 0) + 1;
    }

    return NextResponse.json({
      contactsViewed: counts['CONTACT_VIEWED'] ?? 0,
      phoneRevealed: counts['CONTACT_PHONE_REVEALED'] ?? 0,
      phoneCopied: counts['CONTACT_PHONE_COPIED'] ?? 0,
      callActions: counts['CONTACT_CALL_CLICKED'] ?? 0,
      whatsappActions: counts['CONTACT_WHATSAPP_CLICKED'] ?? 0,
      contactsCreated: counts['CONTACT_CREATED'] ?? 0,
      contactsUpdated: counts['CONTACT_UPDATED'] ?? 0,
      contactsDeleted: counts['CONTACT_DELETED'] ?? 0,
      conversationsViewed: counts['CONVERSATION_VIEWED'] ?? 0,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
