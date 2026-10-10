// ============================================================
// Support helpdesk types and constants.
// Mirrors migration 106_support_tickets.sql.
// ============================================================

export const SUPPORT_TICKET_STATUSES = [
  'open',
  'in_progress',
  'waiting_on_user',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_TICKET_PRIORITIES = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;
export type SupportTicketPriority = (typeof SUPPORT_TICKET_PRIORITIES)[number];

export const SUPPORT_TICKET_CATEGORIES = [
  'bug',
  'question',
  'billing',
  'feature_request',
  'account',
  'other',
] as const;
export type SupportTicketCategory = (typeof SUPPORT_TICKET_CATEGORIES)[number];

export const SUPPORT_REPLY_AUTHOR_ROLES = ['user', 'staff'] as const;
export type SupportReplyAuthorRole = (typeof SUPPORT_REPLY_AUTHOR_ROLES)[number];

export interface SupportTicket {
  id: string;
  account_id: string;
  user_id: string;
  tracking_id: string;
  subject: string;
  body: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  created_at: string;
  updated_at: string;
}

export interface SupportTicketReply {
  id: string;
  ticket_id: string;
  account_id: string;
  author_user_id: string;
  author_role: SupportReplyAuthorRole;
  body: string;
  created_at: string;
}

/** Ticket with its ordered replies — the /support/tickets/[id] payload. */
export interface SupportTicketWithReplies extends SupportTicket {
  replies: SupportTicketReply[];
}

/** Statuses a user can still expect a reply for (not terminal). */
export function isTicketOpen(status: SupportTicketStatus): boolean {
  return status === 'open' || status === 'in_progress' || status === 'waiting_on_user';
}

export function isSupportTicketStatus(value: unknown): value is SupportTicketStatus {
  return typeof value === 'string' && (SUPPORT_TICKET_STATUSES as readonly string[]).includes(value);
}

export function isSupportTicketPriority(value: unknown): value is SupportTicketPriority {
  return typeof value === 'string' && (SUPPORT_TICKET_PRIORITIES as readonly string[]).includes(value);
}

export function isSupportTicketCategory(value: unknown): value is SupportTicketCategory {
  return typeof value === 'string' && (SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(value);
}
