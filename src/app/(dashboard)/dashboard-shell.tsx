"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth, type InitialSubscription } from "@/hooks/use-auth";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { NetworkStatusBanner } from "@/components/layout/network-status-banner";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { SubscriptionGate } from "@/components/subscription-gate";
import { HeaderProvider, useHideDefaultHeader } from "@/components/layout/header-context";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { headerHidden, bottomNavHidden } = useHideDefaultHeader();
  const { online, checking, retry } = useNetworkStatus();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Offline: the inbox is the only screen that works (IndexedDB cache +
  // message outbox). Bounce every other route there so users don't land
  // on pages that can only render empty-state errors without a network.
  useEffect(() => {
    if (loading || !user) return;
    if (!online && pathname !== "/inbox") {
      router.replace("/inbox");
    }
  }, [online, pathname, loading, user, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    // Desktop: a soft canvas with the sidebar and content panel floating
    // as rounded "islands". Mobile stays edge-to-edge (no gap/padding).
    <div className="flex h-[100dvh] overflow-hidden bg-muted/40 lg:gap-3 lg:p-3">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="border-border/70 bg-card flex flex-1 flex-col overflow-hidden shadow-sm lg:rounded-2xl lg:border">
        {!headerHidden && <Header onMenuClick={() => setSidebarOpen(true)} />}
        {/* Global connectivity strip: amber while offline (Retry probes
            /api/health), green flash on recovery. */}
        <NetworkStatusBanner online={online} checking={checking} onRetry={retry} />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 [scrollbar-width:thin] sm:p-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/70">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          <SubscriptionGate>{children}</SubscriptionGate>
        </main>
        {/* Mobile bottom tab bar — hidden on desktop where the sidebar
            carries primary navigation. */}
        {!bottomNavHidden && <MobileBottomNav />}
      </div>
    </div>
  );
}

export function DashboardShell({
  children,
  initialSubscription = null,
}: {
  children: React.ReactNode;
  initialSubscription?: InitialSubscription | null;
}) {
  return (
    <AuthProvider initialSubscription={initialSubscription}>
      <HeaderProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
      </HeaderProvider>
    </AuthProvider>
  );
}
