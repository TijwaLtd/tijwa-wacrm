import type { Metadata } from "next";
import { headers } from "next/headers";
import { DashboardShell } from "./dashboard-shell";
import type { InitialSubscription } from "@/hooks/use-auth";

// Server layout whose only job is to declare "do not index" metadata
// for the authed app. robots.ts already disallows these paths at the
// crawler-level and middleware redirects unauthenticated visitors, so
// this is belt-and-suspenders — but SEO-critical if a URL ever leaks
// via a link shared externally.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

/**
 * Plan status + role for the active account, carried by proxy.ts as
 * request headers from the get_user_accounts RPC it already runs on
 * every protected navigation. Surfaced to the client as
 * `initialSubscription` so SubscriptionGate can make its redirect
 * decision on the first render — no client fetch, no loading flash,
 * no race against the workspaces RPC.
 *
 * Absent (RPC error, unauthenticated, /onboarding) → null; the gate
 * then falls back to the live client-side workspace data.
 */
async function readInitialSubscription(): Promise<InitialSubscription | null> {
  const h = await headers();
  const accountId = h.get("x-wacrm-account-id");
  const status = h.get("x-wacrm-subscription-status");
  if (!accountId || !status) return null;
  return { accountId, status, role: h.get("x-wacrm-role") };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const initialSubscription = await readInitialSubscription();
  return (
    <DashboardShell initialSubscription={initialSubscription}>
      {children}
    </DashboardShell>
  );
}
