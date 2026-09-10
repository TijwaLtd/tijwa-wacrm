"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";

interface SubscriptionGateProps {
  children: React.ReactNode;
}

const PUBLIC_ROUTES = ["/billing", "/settings", "/ai-test"];

/**
 * Gates the dashboard: if no active plan, redirects to /billing.
 * /billing and /settings are always accessible.
 */
export function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { activeWorkspace } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const subscriptionStatus = activeWorkspace?.subscription_status;
  const hasActivePlan = ["active", "trial"].includes(subscriptionStatus ?? "");
  const isPublicRoute = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

  useEffect(() => {
    if (!hasActivePlan && !isPublicRoute) {
      router.replace("/billing");
    }
  }, [hasActivePlan, isPublicRoute, router]);

  if (!hasActivePlan && !isPublicRoute) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Redirecting to billing...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
