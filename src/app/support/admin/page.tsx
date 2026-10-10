"use client";

// ============================================================
// /support/admin — staff queue across every account. Env-allowlist
// gated (403 otherwise, rendered as a plain "staff only" card).
// Filters: status / priority / category + tracking-id or subject
// search. Stats strip on top for a quick workload read.
// ============================================================

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Search, ShieldAlert, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
} from "@/components/support/status-badge";
import {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_CATEGORIES,
  type SupportTicket,
} from "@/lib/support/types";

const ALL = "__all__";

type StaffTicket = SupportTicket & { account?: { name: string } | null };

function formatDate(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export default function SupportAdminPage() {
  const t = useTranslations("Support");
  const locale = useLocale();
  const [tickets, setTickets] = useState<StaffTicket[] | null>(null);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ open: 0, in_progress: 0, waiting_on_user: 0 });
  const [denied, setDenied] = useState(false);
  const [status, setStatus] = useState<string>(ALL);
  const [priority, setPriority] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (status !== ALL) params.set("status", status);
      if (priority !== ALL) params.set("priority", priority);
      if (category !== ALL) params.set("category", category);
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/support/admin/tickets?${params.toString()}`);
      if (res.status === 403) {
        setDenied(true);
        setTickets([]);
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(data.tickets ?? []);
      setTotal(data.total ?? 0);
      if (data.counts) setCounts(data.counts);
    } catch {
      setTickets([]);
    }
  }, [status, priority, category, query]);

  // Debounce search so typing doesn't hammer the API.
  useEffect(() => {
    const handle = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, query]);

  if (denied) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-background p-8 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{t("staffOnlyTitle")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("staffOnlyDesc")}</p>
      </div>
    );
  }

  // Whole-queue counts from the server (not just the loaded page).
  const openCount = counts.open;
  const progressCount = counts.in_progress;
  const waitingCount = counts.waiting_on_user;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t("queueTitle")}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {t("queueDesc", { total })}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        {(
          [
            { label: t("filter.open"), value: openCount },
            { label: t("filter.inProgress"), value: progressCount },
            { label: t("filter.waiting"), value: waitingCount },
          ] as const
        ).map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-background p-3">
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filter.allStatuses")}</SelectItem>
            {SUPPORT_TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => setPriority(v ?? ALL)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filter.allPriorities")}</SelectItem>
            {SUPPORT_TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`priority.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => setCategory(v ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filter.allCategories")}</SelectItem>
            {SUPPORT_TICKET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`category.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Queue list */}
      {tickets === null ? (
        <div className="mt-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("loading")}
        </div>
      ) : tickets.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">{t("queueEmpty")}</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/support/admin/${ticket.id}`}
                className={cn(
                  "group flex items-start gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5",
                  ticket.priority === "urgent" && "border-red-500/30",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                      {ticket.tracking_id}
                    </code>
                    <StatusBadge status={ticket.status} />
                    <PriorityBadge priority={ticket.priority} />
                    <CategoryBadge category={ticket.category} />
                  </div>
                  <p className="mt-1.5 truncate text-sm font-semibold text-foreground group-hover:text-primary">
                    {ticket.subject}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {ticket.account?.name ?? "—"} · {formatDate(ticket.updated_at, locale)}
                  </p>
                </div>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
