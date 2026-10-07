"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FileClock } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "./skeleton";
import { cn } from "@/lib/utils";

/**
 * Reports card — the dashboard home for the audit log (formerly the
 * sidebar's REPORTS section, which held a single Audit link).
 *
 * Admin+ only (same gate the sidebar section used); renders nothing
 * for agents/viewers. Shows 7-day + 30-day audit-event counts and a
 * link into the full /audit log.
 */
export function ReportsCard() {
  const t = useTranslations("Dashboard.reports");
  const canViewAudit = useCan("view-audit");
  const { accountId } = useAuth();
  const [counts, setCounts] = useState<{ d7: number; d30: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!canViewAudit || !accountId) return;
    let cancelled = false;
    (async () => {
      const db = createClient();
      const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
      try {
        const [week, month] = await Promise.all([
          db
            .from("audit_events")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId)
            .gte("created_at", since7),
          db
            .from("audit_events")
            .select("id", { count: "exact", head: true })
            .eq("account_id", accountId)
            .gte("created_at", since30),
        ]);
        if (!cancelled) {
          setCounts({ d7: week.count ?? 0, d30: month.count ?? 0 });
        }
      } catch (err) {
        console.error("[reports-card] audit counts failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewAudit, accountId]);

  // Same gate the old sidebar section used — hide entirely for agents/viewers.
  if (!canViewAudit) return null;

  return (
    <section className="rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <FileClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </header>

      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        {loading || !counts ? (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:max-w-md">
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-xl font-bold tabular-nums text-foreground">
                {counts.d7.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("last7Days")}
              </p>
            </div>
            <div className="rounded-lg bg-muted/50 px-4 py-3">
              <p className="text-xl font-bold tabular-nums text-foreground">
                {counts.d30.toLocaleString()}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("last30Days")}
              </p>
            </div>
          </div>
        )}

        <Link
          href="/audit"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full justify-center sm:w-auto",
          )}
        >
          {t("openAuditLog")}
          <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
