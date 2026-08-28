// ============================================================
// Audit event type and category constants.
// Single source of truth — add new events here only.
// ============================================================

export const AuditCategory = {
  ACCESS: 'ACCESS',
  CONTACT: 'CONTACT',
  CONVERSATION: 'CONVERSATION',
  COMMUNICATION: 'COMMUNICATION',
  DATA: 'DATA',
  AUTHENTICATION: 'AUTHENTICATION',
  ADMIN: 'ADMIN',
} as const;

export type AuditCategoryValue = (typeof AuditCategory)[keyof typeof AuditCategory];

export const AuditEventType = {
  // Contact access
  CONTACT_VIEWED: 'CONTACT_VIEWED',
  CONTACT_PHONE_REVEALED: 'CONTACT_PHONE_REVEALED',
  CONTACT_PHONE_COPIED: 'CONTACT_PHONE_COPIED',
  CONTACT_EMAIL_VIEWED: 'CONTACT_EMAIL_VIEWED',

  // Communication actions
  CONTACT_CALL_CLICKED: 'CONTACT_CALL_CLICKED',
  CONTACT_WHATSAPP_CLICKED: 'CONTACT_WHATSAPP_CLICKED',

  // Conversation access
  CONVERSATION_VIEWED: 'CONVERSATION_VIEWED',
  CONVERSATION_CONTACT_OPENED: 'CONVERSATION_CONTACT_OPENED',

  // Contact modification (via DB trigger)
  CONTACT_CREATED: 'CONTACT_CREATED',
  CONTACT_UPDATED: 'CONTACT_UPDATED',
  CONTACT_DELETED: 'CONTACT_DELETED',

  // Data export (reserved for future use)
  CONTACT_EXPORT_REQUESTED: 'CONTACT_EXPORT_REQUESTED',
  CONTACT_EXPORT_COMPLETED: 'CONTACT_EXPORT_COMPLETED',
} as const;

export type AuditEventTypeValue = (typeof AuditEventType)[keyof typeof AuditEventType];

/** Map event types to their categories. */
export const EVENT_CATEGORY_MAP: Record<AuditEventTypeValue, AuditCategoryValue> = {
  CONTACT_VIEWED: AuditCategory.ACCESS,
  CONTACT_PHONE_REVEALED: AuditCategory.ACCESS,
  CONTACT_PHONE_COPIED: AuditCategory.ACCESS,
  CONTACT_EMAIL_VIEWED: AuditCategory.ACCESS,
  CONTACT_CALL_CLICKED: AuditCategory.COMMUNICATION,
  CONTACT_WHATSAPP_CLICKED: AuditCategory.COMMUNICATION,
  CONVERSATION_VIEWED: AuditCategory.CONVERSATION,
  CONVERSATION_CONTACT_OPENED: AuditCategory.CONVERSATION,
  CONTACT_CREATED: AuditCategory.CONTACT,
  CONTACT_UPDATED: AuditCategory.CONTACT,
  CONTACT_DELETED: AuditCategory.CONTACT,
  CONTACT_EXPORT_REQUESTED: AuditCategory.DATA,
  CONTACT_EXPORT_COMPLETED: AuditCategory.DATA,
};

/** Event types that the frontend is allowed to report via POST /api/audit/events. */
export const FRONTEND_REPORTABLE_EVENTS: Set<string> = new Set([
  AuditEventType.CONTACT_VIEWED,
  AuditEventType.CONTACT_PHONE_REVEALED,
  AuditEventType.CONTACT_PHONE_COPIED,
  AuditEventType.CONTACT_EMAIL_VIEWED,
  AuditEventType.CONTACT_CALL_CLICKED,
  AuditEventType.CONTACT_WHATSAPP_CLICKED,
  AuditEventType.CONVERSATION_VIEWED,
  AuditEventType.CONVERSATION_CONTACT_OPENED,
]);
