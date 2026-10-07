"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useAuth } from "@/hooks/use-auth";
import { hasMinRole } from "@/lib/auth/roles";
import {
  BookOpen,
  Home,
  MessageSquare,
  Package,
  Warehouse,
  ShoppingCart,
  UtensilsCrossed,
  Bed,
  Calendar,
  CalendarCheck,
  ConciergeBell,
  Wrench,
  Clock,
  GraduationCap,
  Heart,
  HandHelping,
  Library,
  HandCoins,
  CalendarDays,
  Truck,
  CreditCard,
  Settings,
  Users,
  UsersRound,
  MoreHorizontal,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const CAPABILITY_ICONS: Record<string, LucideIcon> = {
  Package,
  Warehouse,
  ShoppingCart,
  UtensilsCrossed,
  Bed,
  Calendar,
  CalendarCheck,
  ConciergeBell,
  Wrench,
  Clock,
  GraduationCap,
  Heart,
  HandHelping,
  Library,
  HandCoins,
  CalendarDays,
  Truck,
};

/** Primary tabs (the remaining slot is always the "More" sheet). */
const MAX_VISIBLE = 4;

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  key: string;
  minRole?: "admin" | "owner";
}

/**
 * Bottom navigation — primary destinations on mobile, surfaced as a
 * persistent tab bar. Capability-aware: shows catalog/operations
 * capabilities as tabs. The "More" slot is always present: it holds
 * any tab overflow plus the secondary destinations (Contacts,
 * Knowledge, Billing, Settings) so everything in the sidebar is
 * reachable from one thumb-sized sheet. Broadcasts/Automations live
 * in the Chats list header's more menu instead.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnread();
  const { capabilities, accountRole } = useAuth();
  const t = useTranslations("Sidebar");
  const [moreOpen, setMoreOpen] = useState(false);

  // Build capability nav entries (same filter as sidebar)
  const catalogItems: NavEntry[] = capabilities
    .filter((cap) => cap.is_enabled && cap.navigation?.section === "catalog")
    .map((cap) => ({
      href: cap.navigation!.route,
      label: cap.navigation!.label || cap.name,
      icon: CAPABILITY_ICONS[cap.navigation!.icon] || Package,
      key: cap.key,
    }));

  const operationsItems: NavEntry[] = capabilities
    .filter((cap) => cap.is_enabled && cap.navigation?.section === "operations")
    .map((cap) => ({
      href: cap.navigation!.route,
      label: cap.navigation!.label || cap.name,
      icon: CAPABILITY_ICONS[cap.navigation!.icon] || Wrench,
      key: cap.key,
    }));

  // Always-visible base items — Chats is the default home; dashboard
  // lives in the More sheet above Billing (mirrors the sidebar).
  const baseItems: NavEntry[] = [
    { href: "/inbox", label: t("inbox"), icon: MessageSquare, key: "inbox" },
  ];

  // Secondary destinations — always in the More sheet, role-filtered.
  const secondaryItems: NavEntry[] = [
    { href: "/contacts", label: t("contacts"), icon: Users, key: "contacts" },
    { href: "/team", label: t("team"), icon: UsersRound, key: "team", minRole: "admin" },
    { href: "/knowledge", label: t("knowledge"), icon: BookOpen, key: "knowledge" },
    { href: "/dashboard", label: t("dashboard"), icon: Home, key: "dashboard" },
    { href: "/billing", label: t("billing"), icon: CreditCard, key: "billing", minRole: "owner" },
    { href: "/settings", label: t("settings"), icon: Settings, key: "settings" },
  ];

  // Full ordered list: base → catalog → operations
  const allItems = [...baseItems, ...catalogItems, ...operationsItems];

  const visible = allItems.slice(0, MAX_VISIBLE);
  const overflow = allItems.slice(MAX_VISIBLE);
  const moreItems = [
    ...overflow,
    ...secondaryItems.filter(
      (item) =>
        !item.minRole ||
        (accountRole && hasMinRole(accountRole, item.minRole))
    ),
  ];

  const isActivePath = (href: string) =>
    pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  // The More tab highlights whenever any entry inside the sheet is active.
  const moreActive = moreItems.some((item) => isActivePath(item.href));

  return (
    <nav className="border-border/60 bg-card/95 supports-[backdrop-filter]:bg-card/80 flex h-16 shrink-0 items-stretch border-t backdrop-blur lg:hidden">
      {visible.map((item) => {
        const isActive = isActivePath(item.href);
        const showUnread =
          item.href === "/inbox" && totalUnread > 0 && !isActive;

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "relative flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                isActive ? "bg-primary/10" : "transparent"
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {showUnread && (
                <span className="bg-primary absolute -top-0.5 -right-1 h-2 w-2 rounded-full ring-2 ring-background" />
              )}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}

      {/* More tab — always present, opens the secondary/overflow sheet */}
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors",
          moreActive ? "text-primary" : "text-muted-foreground"
        )}
      >
        <span
          className={cn(
            "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
            moreActive ? "bg-primary/10" : "transparent"
          )}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </span>
        <span className="text-[10px] font-medium">{t("more")}</span>
      </button>

      {/* More sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          <div className="bg-background border-border relative w-full max-w-lg rounded-t-3xl border-t p-4 pb-8 shadow-2xl">
            <div className="bg-muted mx-auto mb-3 h-1 w-9 rounded-full" />
            <div className="mb-3 flex items-center justify-between px-1">
              <h3 className="text-foreground text-sm font-semibold">
                {t("more")}
              </h3>
              <button
                type="button"
                aria-label={t("closeMenu")}
                onClick={() => setMoreOpen(false)}
                className="text-muted-foreground hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-1.5">
              {moreItems.map((item) => {
                const isActive = isActivePath(item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                          isActive
                            ? "bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30"
                            : "bg-muted/70 text-muted-foreground group-hover:bg-muted"
                        )}
                      >
                        <item.icon className="size-4" />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </nav>
  );
}
