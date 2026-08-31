"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useAuth } from "@/hooks/use-auth";
import { Home, MessageSquare, Package } from "lucide-react";

// Icon mapping for capability navigation
import {
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
};

// Base items always shown
const baseItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
];

/**
 * Bottom navigation — primary destinations on mobile, surfaced as a
 * persistent tab bar. Capability-aware: shows a Catalog tab when the
 * account has catalogue capabilities enabled, linking to the first
 * available catalogue route.
 */
export function MobileBottomNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnread();
  const { capabilities } = useAuth();

  // Find first catalogue capability with navigation
  const catalogueNav = capabilities
    .filter((cap) => cap.is_enabled && cap.navigation?.section === "catalog")
    .map((cap) => cap.navigation!)
    [0] ?? null;

  const items = [
    ...baseItems,
    ...(catalogueNav
      ? [
          {
            href: catalogueNav.route,
            label: catalogueNav.label || "Catalog",
            icon: CAPABILITY_ICONS[catalogueNav.icon] || Package,
          },
        ]
      : []),
  ];

  return (
    <nav className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 flex h-16 shrink-0 items-stretch border-t backdrop-blur lg:hidden">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        const showUnread = item.href === "/inbox" && totalUnread > 0 && !isActive;

        return (
          <Link
            key={item.href}
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
    </nav>
  );
}
