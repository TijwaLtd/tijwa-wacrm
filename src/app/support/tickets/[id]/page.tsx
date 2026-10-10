"use client";

// ============================================================
// /support/tickets/[id] — the thread view: original ticket, all
// replies (user + staff), and a reply composer. Status is display-
// only here — only staff change it.
// ============================================================

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { use, useEffect, useState, type FormEvent } from "react";
import { Loader2, Send, ArrowLeft } from "lucide-react";
import { buttonVariants, Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, CategoryBadge } from "@/components/support/status-badge";
import type { SupportTicketWithReplies, SupportTicketReply } from "@/lib/support/types";

function formatDateTime(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(iso),
    );
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
}

function ReplyBubble({
  reply,
  isSelf,
  locale,
  youLabel,
  staffLabel,
}: {
  reply: SupportTicketReply;
  isSelf: boolean;
  locale: string;
  youLabel: string;
  staffLabel: string;
}) {
  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl border p-3 sm:max-w-[75%] ${
          reply.author_role === "staff"
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-background"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
          <span>{reply.author_role === "staff" ? staffLabel : youLabel}</span>
          <span aria-hidden>·</span>
          <span className="font-normal">{formatDateTime(reply.created_at, locale)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{reply.body}</p>
      </div>
    </div>
  );
}

export default function TicketThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = useTranslations("Support");
  const locale = useLocale();
  const { id } = use(params);
  const [ticket, setTicket] = useState<SupportTicketWithReplies | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
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
        const res = await fetch(`/api/support/tickets/${id}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) setTicket(data.ticket);
      } catch {
        if (!cancelled) setNotFoundState(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleReply(e: FormEvent) {
    e.preventDefault();
    if (!id || !reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReply("");
      setTicket((prev) => (prev ? { ...prev, replies: [...prev.replies, data.reply] } : prev));
    } catch {
      /* keep the draft — the user can retry */
    } finally {
      setSending(false);
    }
  }

  if (notFoundState) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm font-medium text-foreground">{t("ticketNotFound")}</p>
        <Link href="/support" className={buttonVariants({ size: "sm", variant: "outline" })}>
          {t("backToTickets")}
        </Link>
      </div>
    );
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
        href="/support"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> {t("backToTickets")}
      </Link>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded bg-muted px-2 py-1 font-mono text-sm font-bold tracking-wider text-foreground">
          {ticket.tracking_id}
        </code>
        <StatusBadge status={ticket.status} />
        <CategoryBadge category={ticket.category} />
      </div>
      <h1 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">{ticket.subject}</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("openedAt", { date: formatDateTime(ticket.created_at, locale) })}
      </p>

      {/* Original message */}
      <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
        <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{t("you")}</div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{ticket.body}</p>
      </div>

      {/* Replies */}
      {ticket.replies.length > 0 && (
        <div className="mt-5 space-y-3">
          {ticket.replies.map((r) => (
            <ReplyBubble
              key={r.id}
              reply={r}
              isSelf={r.author_role === "user"}
              locale={locale}
              youLabel={t("you")}
              staffLabel={t("staffLabel")}
            />
          ))}
        </div>
      )}

      {/* Reply composer */}
      <form onSubmit={handleReply} className="mt-8 border-t border-border pt-5">
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={4}
          placeholder={t("replyPlaceholder")}
          className="resize-y"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t("replyHint")}</p>
          <Button type="submit" disabled={sending || !reply.trim()} size="sm" className="gap-1.5">
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {t("sendReply")}
          </Button>
        </div>
      </form>
    </div>
  );
}
