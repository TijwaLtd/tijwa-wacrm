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
 * Two traps this used to fall into:
 *  1. `activeWorkspace` is null on every cold load (the workspaces RPC
 *     resolves after the session), so the gate saw "no plan", flashed
 *     "Redirecting to billing…" and router.replace'd to /billing before
 *     subscription_status='active' ever arrived — a race that fired
 *     "under special circumstances" (login, hard refresh, slow network).
 *  2. Sending non-owners there loops: the billing page redirects
 *     non-owners to /dashboard, which the gate then redirects back.
 *     Only owners can change plans, so only owners are redirected;
 *     server-side checks (requireActiveSubscription) still enforce the
 *     expired state for everyone else.
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { activeWorkspace, profileLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const subscriptionStatus = activeWorkspace?.subscription_status;
  const hasActivePlan = ["active", "trial"].includes(subscriptionStatus ?? "");
  const isPublicRoute = PUBLIC_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
  const isOwner = activeWorkspace?.role === "owner";

  // Workspace/subscription data not resolved yet → judge nothing,
  // redirect nothing. Show a neutral loader instead of the billing one.
  const stillResolving = profileLoading && !isPublicRoute;
  const shouldRedirect =
    !profileLoading && !isPublicRoute && !hasActivePlan && isOwner;

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
