"use client";

import {
  Eye,
  PhoneOff,
  Copy,
  Phone,
  MessageCircle,
  UserPlus,
  Pencil,
  Trash2,
  MessageSquare,
} from "lucide-react";

interface AuditStats {
  contactsViewed: number;
  phoneRevealed: number;
  phoneCopied: number;
  callActions: number;
  whatsappActions: number;
  contactsCreated: number;
  contactsUpdated: number;
  contactsDeleted: number;
  conversationsViewed: number;
}

const statCards = [
  {
    key: "contactsViewed" as const,
    label: "Contacts Viewed",
    icon: Eye,
    color: "text-blue-500",
  },
  {
    key: "phoneCopied" as const,
    label: "Phone Numbers Copied",
    icon: Copy,
    color: "text-amber-500",
  },
  {
    key: "callActions" as const,
    label: "Call Actions",
    icon: Phone,
    color: "text-green-500",
  },
  {
    key: "whatsappActions" as const,
    label: "WhatsApp Actions",
    icon: MessageCircle,
    color: "text-emerald-500",
  },
  {
    key: "conversationsViewed" as const,
    label: "Conversations Viewed",
    icon: MessageSquare,
    color: "text-purple-500",
  },
];

export function StatsCards({ stats }: { stats: AuditStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {statCards.map((card) => (
        <div
          key={card.key}
          className="rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <card.icon className={`h-4 w-4 ${card.color}`} />
            <span className="text-xs font-medium text-muted-foreground">
              {card.label}
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">
            {stats[card.key].toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
