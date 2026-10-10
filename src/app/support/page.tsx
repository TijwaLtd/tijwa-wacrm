"use client";

// ============================================================
// /support — "My tickets" list for the caller's account.
// Status filter chips, newest first. Links to the thread view.
// ============================================================

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useState } from "react";
import { Loader2, PlusCircle, Ticket, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StatusBadge, CategoryBadge } from "@/components/support/status-badge";
import type { SupportTicket, SupportTicketStatus } from "@/lib/support/types";

const FILTERS = [
  { value: "", labelKey: "filter.all" },
  { value: "open", labelKey: "filter.open" },
  { value: "in_progress", labelKey: "filter.inProgress" },
  { value: "resolved", labelKey: "filter.resolved" },
  { value: "closed", labelKey: "filter.closed" },
] as const;

function formatDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function SupportHomePage() {
  const t = useTranslations("Support");
  const locale = useLocale();
  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [filter, setFilter] = useState<SupportTicketStatus | "">("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = filter ? `?status=${filter}&limit=50` : "?limit=50";
        const res = await fetch(`/api/support/tickets${qs}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setTickets(data.tickets ?? []);
      } catch {
        if (!cancelled) setTickets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t("myTickets")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("myTicketsDesc")}</p>
        </div>
        {/* buttonVariants on a Link — the wacrm Button has no asChild slot. */}
        <Link href="/support/new" className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}>
          <PlusCircle className="size-4" /> {t("newTicket")}
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value as SupportTicketStatus | "")}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === f.value
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {t(f.labelKey)}
          </button>
        ))}
      </div>

      {tickets === null ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("loading")}
        </div>
      ) : tickets.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <SearchX className="size-8 text-muted-foreground/60" />
          <p className="text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{t("emptyDesc")}</p>
          <Link
            href="/support/new"
            className={cn(buttonVariants({ size: "sm", variant: "outline" }), "mt-1")}
          >
            {t("newTicket")}
          </Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/support/tickets/${ticket.id}`}
                className="group flex items-start gap-3 rounded-xl border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="mt-0.5 hidden size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:flex">
                  <Ticket className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                      {ticket.tracking_id}
                    </code>
                    <StatusBadge status={ticket.status} />
                    <CategoryBadge category={ticket.category} />
                  </div>
                  <p className="mt-1.5 truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {ticket.subject}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(ticket.created_at, locale)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
