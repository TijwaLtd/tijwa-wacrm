"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

const PUBLIC_ROUTES = ["/billing", "/settings", "/ai-test"];

/**
 * Gates the dashboard: owners without an active plan are sent to /billing.
 * /billing and /settings are always accessible.
 *
 * The plan status + role come from two sources, in order:
 *  1. `activeWorkspace` — live client data (wins once loaded, so
 *     workspace switches and post-upgrade refreshes are respected);
 *  2. `initialSubscription` — session state carried by proxy.ts as
 *     request headers (from the get_user_accounts RPC middleware already
 *     runs), read by the server layout. Available on the first render,
 *     so the redirect decision needs no client fetch at all.
 *
 * Only if BOTH are missing while profile data is still loading do we
 * show a neutral loader and wait — the old trap was judging on
 * `activeWorkspace` alone, which is null on every cold load: the gate
 * raced the workspaces RPC, flashed "Redirecting to billing…" and
 * bounced users whose plan was active all along.
 *
 * Only owners are redirected — non-owners would loop (the billing page
 * redirects them to /dashboard, which the gate would redirect back).
 * Server-side checks (requireActiveSubscription) still enforce the
 * expired state for everyone else.
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { activeWorkspace, profileLoading, initialSubscription } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const status =
    activeWorkspace?.subscription_status ?? initialSubscription?.status;
  const role = activeWorkspace?.role ?? initialSubscription?.role ?? undefined;

  const hasActivePlan = status === "active";
  const isOwner = role === "owner";
  const isPublicRoute = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );

  // No source available yet → judge nothing, redirect nothing.
  const stillResolving = status === undefined && profileLoading && !isPublicRoute;
  const shouldRedirect = !isPublicRoute && status !== undefined && !hasActivePlan && isOwner;

  useEffect(() => {
    if (shouldRedirect) {
      router.replace("/billing");
    }
  }, [shouldRedirect, router]);

  if (stillResolving || shouldRedirect) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">
            {shouldRedirect ? "Redirecting to billing..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
