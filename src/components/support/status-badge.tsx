"use client";

// ============================================================
// Status / priority / category badges shared by the user-facing
// support pages and the staff console. Labels come from the
// Support.status / Support.priority / Support.category i18n
// namespaces; colors are stable across both surfaces so a staff
// member and a user read the same chip the same way.
// ============================================================

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "@/lib/support/types";

const STATUS_STYLES: Record<SupportTicketStatus, string> = {
  open: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  waiting_on_user: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  resolved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  closed: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_STYLES: Record<SupportTicketPriority, string> = {
  low: "bg-muted text-muted-foreground border-border",
  normal: "bg-muted text-muted-foreground border-border",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
  urgent: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

export function StatusBadge({ status }: { status: SupportTicketStatus }) {
  const t = useTranslations("Support");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        STATUS_STYLES[status],
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: SupportTicketPriority }) {
  const t = useTranslations("Support");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        PRIORITY_STYLES[priority],
      )}
    >
      {t(`priority.${priority}`)}
    </span>
  );
}

export function CategoryBadge({ category }: { category: SupportTicketCategory }) {
  const t = useTranslations("Support");
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {t(`category.${category}`)}
    </span>
  );
}
