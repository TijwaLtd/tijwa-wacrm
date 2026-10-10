"use client";

// ============================================================
// HelpChrome — the shared frame for /help/* (docs mode) and
// /support/* (support mode), modeled on LegalChrome.
//
// Desktop: sticky left sidebar (Tijwa brand, section nav, support
// CTA) beside a single content column with the article card.
// Mobile: sticky brand bar + section nav, content below.
//
// Lives in each section's layout.tsx so every page gets the frame
// without repeating it — pages render only heading + body.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import {
  LifeBuoy,
  Rocket,
  LayoutGrid,
  MessageSquareText,
  CircleHelp,
  CreditCard,
  Ticket,
  PlusCircle,
  ShieldAlert,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type HelpChromeMode = "docs" | "support";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Rocket;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/help" || href === "/support") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function TijwaBrand({ subtitle }: { subtitle: string }) {
  return (
    <Link href="/help" className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <LifeBuoy className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">Tijwa</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}

function NavList({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <nav className="space-y-1">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function HelpChrome({
  mode,
  children,
}: {
  mode: HelpChromeMode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations("Help");
  const [isStaff, setIsStaff] = useState(false);

  // Staff section in the support sidebar — resolved from the env
  // allowlist endpoint; silently stays hidden on failure.
  useEffect(() => {
    if (mode !== "support") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/support/staff-status");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.isStaff) setIsStaff(true);
      } catch {
        /* hidden by default */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const items: NavItem[] =
    mode === "docs"
      ? [
          { href: "/help", label: t("nav.home"), icon: LayoutGrid },
          { href: "/help/getting-started", label: t("nav.gettingStarted"), icon: Rocket },
          { href: "/help/business-types", label: t("nav.businessTypes"), icon: MessageSquareText },
          { href: "/help/quick-replies", label: t("nav.quickReplies"), icon: MessageSquareText },
          { href: "/help/faq", label: t("nav.faq"), icon: CircleHelp },
          { href: "/help/billing-and-plans", label: t("nav.billing"), icon: CreditCard },
        ]
      : [
          { href: "/support", label: t("support.myTickets"), icon: Ticket },
          { href: "/support/new", label: t("support.newTicket"), icon: PlusCircle },
          { href: "/help/faq", label: t("support.faq"), icon: CircleHelp },
          ...(isStaff ? [{ href: "/support/admin", label: t("support.queue"), icon: ShieldAlert }] : []),
        ];

  const brandSubtitle = mode === "docs" ? t("docsSubtitle") : t("supportSubtitle");

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto flex w-full max-w-6xl gap-10 px-4 py-6 sm:px-6 lg:px-8 lg:py-12">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-10 space-y-6">
            <TijwaBrand subtitle={brandSubtitle} />
            <NavList items={items} pathname={pathname} />
            {mode === "docs" && (
              <Link
                href="/support"
                className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                {t("contactSupport")}
                <ChevronRight className="size-4" />
              </Link>
            )}
            {mode === "support" && (
              <Link
                href="/help"
                className="block rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                ← {t("backToHelp")}
              </Link>
            )}
          </div>
        </aside>

        {/* ── Content column ── */}
        <div className="min-w-0 flex-1">
          {/* Mobile: sticky brand bar + nav */}
          <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
            <div className="mb-3">
              <TijwaBrand subtitle={brandSubtitle} />
            </div>
            <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
              {items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </header>

          <article className="rounded-xl border border-border bg-card p-5 sm:p-8">{children}</article>

          <p className="mt-6 text-center text-xs text-muted-foreground">Tijwa · Help &amp; support</p>
        </div>
      </div>
    </div>
  );
}
