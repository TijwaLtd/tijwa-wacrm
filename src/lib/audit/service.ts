// ============================================================
// Audit service — server-side event recording.
// Use this from API routes and server components.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type { AuditEventTypeValue, AuditCategoryValue } from './events';
import { EVENT_CATEGORY_MAP } from './events';

const SERVICE_CLIENT = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export interface AuditRecordParams {
  eventType: AuditEventTypeValue;
  accountId: string;
  actorUserId: string;
  contactId?: string;
  conversationId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * Record an audit event. Call this from API routes or server components.
   * The event_category is automatically derived from the event_type.
   */
  static async record(params: AuditRecordParams): Promise<void> {
    const {
      eventType,
      accountId,
      actorUserId,
      contactId,
      conversationId,
      metadata = {},
      ipAddress,
      userAgent,
    } = params;

    const eventCategory = EVENT_CATEGORY_MAP[eventType];
    if (!eventCategory) {
      console.error(`[AuditService] Unknown event type: ${eventType}`);
      return;
    }

    const { error } = await SERVICE_CLIENT.from('audit_events').insert({
      account_id: accountId,
      actor_user_id: actorUserId,
      contact_id: contactId ?? null,
      conversation_id: conversationId ?? null,
      event_type: eventType,
      event_category: eventCategory,
      metadata,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    });

    if (error) {
      console.error('[AuditService] Failed to record event:', error);
    }
  }
}
