"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useAuth } from "@/hooks/use-auth";
import {
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

const MAX_VISIBLE = 5;

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
  key: string;
}

/**
 * Bottom navigation — primary destinations on mobile, surfaced as a
 * persistent tab bar. Capability-aware: shows all catalog and operations
 * capabilities. When total items exceed MAX_VISIBLE, overflow goes into
 * a "More" dropdown.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnread();
  const { capabilities } = useAuth();
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

  // Always-visible base items
  const baseItems: NavEntry[] = [
    { href: "/dashboard", label: t("dashboard"), icon: Home, key: "dashboard" },
    { href: "/inbox", label: t("inbox"), icon: MessageSquare, key: "inbox" },
  ];

  // Full ordered list: base → catalog → operations
  const allItems = [...baseItems, ...catalogItems, ...operationsItems];

  const visible = allItems.slice(0, MAX_VISIBLE);
  const overflow = allItems.slice(MAX_VISIBLE);
  const hasOverflow = overflow.length > 0;

  // Check if any overflow item is active (so the More tab highlights)
  const overflowActive = overflow.some(
    (item) =>
      pathname === item.href ||
      (item.href !== "/dashboard" && pathname.startsWith(item.href))
  );

  return (
    <nav className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 flex h-16 shrink-0 items-stretch border-t backdrop-blur lg:hidden">
      {visible.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const showUnread = item.href === "/inbox" && totalUnread > 0 && !isActive;

        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span className="relative">
              <item.icon className="h-5 w-5" />
              {showUnread && (
                <span className="bg-primary absolute -top-1 -right-1.5 h-2 w-2 rounded-full" />
              )}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}

      {/* More tab — shows overflow items in a popover sheet */}
      {hasOverflow && (
        <>
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1 transition-colors",
              overflowActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium">{t("more")}</span>
          </button>

          {/* Overlay */}
          {moreOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              />
              <div className="bg-background border-border relative w-full max-w-lg rounded-t-2xl border-t p-4 pb-8 shadow-lg">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-foreground text-sm font-semibold">
                    {t("operations")}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <ul className="flex flex-col gap-1">
                  {overflow.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        pathname.startsWith(item.href));
                    return (
                      <li key={item.key}>
                        <Link
                          href={item.href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
    </nav>
  );
}
