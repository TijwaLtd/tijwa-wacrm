"use client";

// ============================================================
// /support/admin/[id] — staff thread view across any account.
// Reply as staff (auto-bumps open → in_progress server-side) and
// update status/priority/category via immediate PATCHes.
// ============================================================

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { use, useEffect, useState, type FormEvent } from "react";
import { Loader2, Send, ArrowLeft, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
} from "@/components/support/status-badge";
import {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_PRIORITIES,
  SUPPORT_TICKET_CATEGORIES,
  type SupportTicketWithReplies,
  type SupportTicketReply,
  type SupportTicketStatus,
  type SupportTicketPriority,
  type SupportTicketCategory,
} from "@/lib/support/types";

type StaffTicketDetail = SupportTicketWithReplies & { account?: { name: string } | null };

function formatDateTime(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

export default function SupportAdminDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = useTranslations("Support");
  const locale = useLocale();
  const { id } = use(params);
  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // Deferred past the synchronous effect body so
  // react-hooks/set-state-in-effect stays quiet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const res = await fetch(`/api/support/admin/tickets/${id}`);
        if (cancelled) return;
        if (res.status === 403) {
          setDenied(true);
          return;
        }
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setTicket(data.ticket);
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function patchField(field: "status" | "priority" | "category", value: string) {
    if (!ticket) return;
    const previous = ticket;
    setTicket({ ...ticket, [field]: value });
    try {
      const res = await fetch(`/api/support/admin/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setTicket(previous); // revert on failure
    }
  }

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/admin/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReply("");
      setTicket((prev) =>
        prev
          ? {
              ...prev,
              replies: [...prev.replies, data.reply],
              status: data.status ?? prev.status,
            }
          : prev,
      );
    } catch {
      /* keep draft for retry */
    } finally {
      setSending(false);
    }
  }

  if (denied) {
    return (
      <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-3 rounded-xl border border-border bg-background p-8 text-center">
        <ShieldAlert className="size-8 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">{t("staffOnlyTitle")}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("staffOnlyDesc")}</p>
      </div>
    );
  }

  if (notFound) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{t("ticketNotFound")}</p>;
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("loading")}
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/support/admin"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("queueTitle")}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 font-mono text-sm font-bold tracking-wider">
          {ticket.tracking_id}
        </code>
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        <CategoryBadge category={ticket.category} />
      </div>
      <h1 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">{ticket.subject}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {ticket.account?.name ?? "—"} · {t("openedAt", { date: formatDateTime(ticket.created_at, locale) })}
      </p>

      {/* Lifecycle controls */}
      <div className="mt-5 flex flex-wrap gap-2 rounded-xl border border-border bg-muted/30 p-3">
        <Select value={ticket.status} onValueChange={(v) => void patchField("status", v as SupportTicketStatus)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_TICKET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ticket.priority} onValueChange={(v) => void patchField("priority", v as SupportTicketPriority)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                {t(`priority.${p}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ticket.category} onValueChange={(v) => void patchField("category", v as SupportTicketCategory)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORT_TICKET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t(`category.${c}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Original message */}
      <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
          {t("customer")} · {ticket.account?.name ?? "—"}
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{ticket.body}</p>
      </div>

      {/* Thread */}
      {ticket.replies.length > 0 && (
        <div className="mt-5 space-y-3">
          {ticket.replies.map((r: SupportTicketReply) => (
            <div
              key={r.id}
              className={`flex ${r.author_role === "staff" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-xl border p-3 sm:max-w-[75%] ${
                  r.author_role === "staff"
                    ? "border-primary/30 bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                  <span>{r.author_role === "staff" ? t("staffLabel") : t("customer")}</span>
                  <span aria-hidden>·</span>
                  <span className="font-normal">{formatDateTime(r.created_at, locale)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Staff reply */}
      <form onSubmit={handleReply} className="mt-8 border-t border-border pt-5">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder={t("staffReplyPlaceholder")}
          className="resize-y"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("staffReplyHint")}</p>
          <Button type="submit" disabled={sending || !reply.trim()} size="sm" className="gap-1.5">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("sendReply")}
          </Button>
        </div>
      </form>
    </div>
  );
}
