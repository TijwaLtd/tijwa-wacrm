"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { Home, MessageSquare } from "lucide-react";

// Bottom navigation — the two primary destinations on mobile, surfaced as a
// persistent tab bar. Everything else lives behind the header's "more" menu
// or the hamburger drawer, keeping the phone screen uncluttered (mobile-app
// feel). Desktop shows the full sidebar instead, so this is lg:hidden.
const items = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/inbox", label: "Inbox", icon: MessageSquare },
];

export function MobileBottomNav() {
  const pathname = usePathname();
  const totalUnread = useTotalUnread();

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
