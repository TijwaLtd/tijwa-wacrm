"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { AccountAccessAlert } from "@/components/layout/account-access-alert";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { SubscriptionGate } from "@/components/subscription-gate";
import { HeaderProvider, useHideDefaultHeader } from "@/components/layout/header-context";
import { IdleTimeoutWarning } from "@/components/auth/idle-timeout-warning";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { headerHidden, bottomNavHidden } = useHideDefaultHeader();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

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
    <div className="flex h-[100dvh] overflow-hidden bg-background">
      <IdleTimeoutWarning />
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      <Sidebar open={sidebarOpen} onClose={closeSidebar} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {!headerHidden && <Header />}
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {/* Above every page: writes are being rejected and here's why.
              Renders nothing unless the account/role failed to resolve. */}
          <AccountAccessAlert />
          <SubscriptionGate>{children}</SubscriptionGate>
        </main>
        {/* Mobile bottom tab bar (Home, Inbox) — hidden on desktop where the
            sidebar carries primary navigation. */}
        {!bottomNavHidden && <MobileBottomNav />}
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <HeaderProvider>
        <DashboardShellInner>{children}</DashboardShellInner>
      </HeaderProvider>
    </AuthProvider>
  );
}
