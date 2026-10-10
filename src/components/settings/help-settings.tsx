"use client";

// ============================================================
// Settings → Help & support. Entry points into the /help center
// and /support ticket pages (which live in their own chrome, like
// the legal section). Staff see a link to the /support/admin queue
// when their email is on the SUPPORT_STAFF_EMAILS allowlist.
// ============================================================

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  LifeBuoy,
  BookOpenText,
  Ticket,
  PlusCircle,
  ShieldAlert,
  ChevronRight,
  Rocket,
  MessageSquareText,
  CircleHelp,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpLink {
  href: string;
  icon: typeof Rocket;
  title: string;
  desc: string;
}

export function HelpSettings() {
  const t = useTranslations("Settings.help");
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/support/staff-status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.isStaff) setIsStaff(true);
      } catch {
        /* stay hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const links: HelpLink[] = [
    {
      href: "/help",
      icon: BookOpenText,
      title: t("helpCenter"),
      desc: t("helpCenterDesc"),
    },
    {
      href: "/help/getting-started",
      icon: Rocket,
      title: t("gettingStarted"),
      desc: t("gettingStartedDesc"),
    },
    {
      href: "/help/business-types",
      icon: MessageSquareText,
      title: t("businessTypes"),
      desc: t("businessTypesDesc"),
    },
    {
      href: "/help/quick-replies",
      icon: MessageSquareText,
      title: t("quickReplies"),
      desc: t("quickRepliesDesc"),
    },
    {
      href: "/help/faq",
      icon: CircleHelp,
      title: t("faq"),
      desc: t("faqDesc"),
    },
    {
      href: "/help/billing-and-plans",
      icon: CreditCard,
      title: t("billing"),
      desc: t("billingDesc"),
    },
    {
      href: "/support",
      icon: Ticket,
      title: t("myTickets"),
      desc: t("myTicketsDesc"),
    },
    {
      href: "/support/new",
      icon: PlusCircle,
      title: t("newTicket"),
      desc: t("newTicketDesc"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <LifeBuoy className="size-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{t("introTitle")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("introDesc")}</p>
        </div>
      </div>

      {isStaff && (
        <Link
          href="/support/admin"
          className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 transition-colors hover:bg-amber-500/10"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="size-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{t("staffQueue")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("staffQueueDesc")}</p>
            </div>
          </div>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group flex items-start gap-3 rounded-xl border border-border bg-background p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <link.icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold text-foreground group-hover:text-primary")}>
                {link.title}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{link.desc}</p>
            </div>
            <ChevronRight className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
