"use client";

// ============================================================
// /support/new — raise a ticket. Category, subject, description.
// On success the tracking ID gets its own confirmation state so
// the user can copy it before navigating into the thread.
// ============================================================

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2, Copy, ArrowRight, LifeBuoy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  SUPPORT_TICKET_CATEGORIES,
  type SupportTicket,
  type SupportTicketCategory,
} from "@/lib/support/types";

const SUBJECT_MAX = 200;
const BODY_MAX = 5000;

export default function NewTicketPage() {
  const t = useTranslations("Support");
  const [category, setCategory] = useState<SupportTicketCategory>("question");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SupportTicket | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (subject.trim().length < 3) {
      setError(t("subjectTooShort"));
      return;
    }
    if (body.trim().length < 10) {
      setError(t("bodyTooShort"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), category }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("createError"));
      setCreated(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-8 text-center">
          <CheckCircle2 className="size-10 text-emerald-600 dark:text-emerald-400" />
          <h1 className="text-xl font-bold text-foreground">{t("createdTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("createdDesc")}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(created.tracking_id);
              toast.success(t("trackingCopied"));
            }}
            className="group flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-mono text-lg font-bold tracking-widest text-foreground transition-colors hover:border-primary/40"
          >
            {created.tracking_id}
            <Copy className="size-4 text-muted-foreground group-hover:text-primary" />
          </button>
          <div className="mt-2 flex gap-2">
            <Link
              href="/support"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              {t("backToTickets")}
            </Link>
            <Link
              href={`/support/tickets/${created.id}`}
              className={cn(buttonVariants({ size: "sm" }), "gap-1")}
            >
              {t("openTicket")} <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LifeBuoy className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">{t("newTicket")}</h1>
          <p className="text-sm text-muted-foreground">{t("newTicketDesc")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="category">{t("categoryLabel")}</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as SupportTicketCategory)}>
            <SelectTrigger id="category" className="w-full">
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

        <div className="space-y-2">
          <Label htmlFor="subject">{t("subjectLabel")}</Label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={SUBJECT_MAX}
            placeholder={t("subjectPlaceholder")}
            required
          />
          <p className="text-right text-[11px] text-muted-foreground">
            {subject.length}/{SUBJECT_MAX}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="body">{t("bodyLabel")}</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={BODY_MAX}
            rows={8}
            placeholder={t("bodyPlaceholder")}
            required
            className="resize-y"
          />
          <p className="text-right text-[11px] text-muted-foreground">
            {body.length}/{BODY_MAX}
          </p>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{t("formHint")}</p>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
          {submitting ? t("submitting") : t("submit")}
        </Button>
      </form>
    </div>
  );
}
