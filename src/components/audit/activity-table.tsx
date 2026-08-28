"use client";

import { maskPhoneNumber } from "@/lib/audit/masking";
import { format } from "date-fns";

interface AuditEvent {
  id: string;
  actor_user_id: string;
  contact_id: string | null;
  event_type: string;
  event_category: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
  contact: { name: string | null; phone: string } | null;
}

const EVENT_LABELS: Record<string, string> = {
  CONTACT_VIEWED: "Contact viewed",
  CONTACT_PHONE_REVEALED: "Phone revealed",
  CONTACT_PHONE_COPIED: "Phone copied",
  CONTACT_EMAIL_VIEWED: "Email viewed",
  CONTACT_CALL_CLICKED: "Call clicked",
  CONTACT_WHATSAPP_CLICKED: "WhatsApp clicked",
  CONVERSATION_VIEWED: "Conversation viewed",
  CONVERSATION_CONTACT_OPENED: "Contact opened from conversation",
  CONTACT_CREATED: "Contact created",
  CONTACT_UPDATED: "Contact updated",
  CONTACT_DELETED: "Contact deleted",
  CONTACT_EXPORT_REQUESTED: "Export requested",
  CONTACT_EXPORT_COMPLETED: "Export completed",
};

const EVENT_BADGE_COLORS: Record<string, string> = {
  ACCESS: "bg-blue-500/10 text-blue-500",
  COMMUNICATION: "bg-green-500/10 text-green-500",
  CONVERSATION: "bg-purple-500/10 text-purple-500",
  CONTACT: "bg-amber-500/10 text-amber-500",
  DATA: "bg-red-500/10 text-red-500",
  AUTHENTICATION: "bg-gray-500/10 text-gray-500",
  ADMIN: "bg-rose-500/10 text-rose-500",
};

function getCategoryBadgeClass(category: string): string {
  return EVENT_BADGE_COLORS[category] ?? "bg-muted text-muted-foreground";
}

export function ActivityTable({ events }: { events: AuditEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card py-12 text-center">
        <p className="text-sm text-muted-foreground">No audit events found.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Time
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Employee
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Customer
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {events.map((event) => {
            const actorName =
              event.actor?.full_name ?? event.actor?.email ?? "Unknown";
            const contactName = event.contact?.name ?? "Unknown";
            // Phone is already masked by the API, but mask again for safety
            const maskedPhone = event.contact?.phone
              ? maskPhoneNumber(event.contact.phone)
              : null;
            const eventLabel =
              EVENT_LABELS[event.event_type] ?? event.event_type;
            const timeStr = format(new Date(event.created_at), "MMM d, HH:mm");

            return (
              <tr key={event.id} className="hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                  {timeStr}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-foreground">
                  {actorName}
                </td>
                <td className="px-4 py-3 text-xs text-foreground">
                  <span className="font-medium">{contactName}</span>
                  {maskedPhone && (
                    <span className="ml-1.5 text-muted-foreground">
                      {maskedPhone}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getCategoryBadgeClass(
                      event.event_category,
                    )}`}
                  >
                    {eventLabel}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
