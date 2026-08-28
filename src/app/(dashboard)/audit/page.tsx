"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { useRouter } from "next/navigation";
import { StatsCards } from "@/components/audit/stats-cards";
import { ActivityTable, EVENT_LABELS } from "@/components/audit/activity-table";
import { AuditFilters } from "@/components/audit/filters";
import { maskPhoneNumber } from "@/lib/audit/masking";
import { Loader2, Download } from "lucide-react";
import { format } from "date-fns";

interface AuditEvent {
  id: string;
  actor_user_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  event_type: string;
  event_category: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor: { full_name: string | null; email: string } | null;
  contact: { name: string | null; phone: string } | null;
}

interface AuditStats {
  contactsViewed: number;
  phoneRevealed: number;
  phoneCopied: number;
  callActions: number;
  whatsappActions: number;
  contactsCreated: number;
  contactsUpdated: number;
  contactsDeleted: number;
  conversationsViewed: number;
}

interface Filters {
  user: string;
  event_type: string;
  date_from: string;
  date_to: string;
}

function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(",")).join("\n");
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const { accountRole } = useAuth();
  const canAccess = useCan("view-audit");
  const router = useRouter();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    user: "",
    event_type: "",
    date_from: "",
    date_to: "",
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Redirect if not admin
  useEffect(() => {
    if (!accountRole) return;
    if (!canAccess) router.push("/dashboard");
  }, [accountRole, canAccess, router]);

  const fetchEvents = useCallback(
    async (cursor?: string, reset = false) => {
      if (!canAccess) return;

      const params = new URLSearchParams();
      if (filters.user) params.set("user", filters.user);
      if (filters.event_type) params.set("event_type", filters.event_type);
      if (filters.date_from) params.set("date_from", filters.date_from);
      if (filters.date_to) params.set("date_to", filters.date_to);
      if (cursor) params.set("cursor", cursor);
      params.set("limit", "50");

      const res = await fetch(`/api/audit/events?${params.toString()}`);
      if (!res.ok || !mountedRef.current) return;

      const data = await res.json();
      setEvents((prev) => (reset ? data.data : [...prev, ...data.data]));
      setNextCursor(data.meta.next_cursor);
    },
    [canAccess, filters],
  );

  const fetchStats = useCallback(async () => {
    if (!canAccess) return;
    const res = await fetch("/api/audit/stats");
    if (res.ok && mountedRef.current) {
      setStats(await res.json());
    }
  }, [canAccess]);

  // Initial load
  useEffect(() => {
    if (!canAccess) return;
    setInitialLoading(true);
    Promise.all([fetchEvents(undefined, true), fetchStats()]).then(() => {
      if (mountedRef.current) setInitialLoading(false);
    });
  }, [canAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on filter change
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (!canAccess) return;
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setFilterLoading(true);
    fetchEvents(undefined, true).then(() => {
      if (mountedRef.current) setFilterLoading(false);
    });
  }, [filters, canAccess, fetchEvents]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    await fetchEvents(nextCursor);
    if (mountedRef.current) setLoadingMore(false);
  };

  // Export all matching events as CSV (fetches all pages)
  const handleExport = async () => {
    if (!canAccess || exporting) return;
    setExporting(true);

    try {
      const allEvents: AuditEvent[] = [];
      let cursor: string | null = null;
      let hasMore = true;

      while (hasMore) {
        const params = new URLSearchParams();
        if (filters.user) params.set("user", filters.user);
        if (filters.event_type) params.set("event_type", filters.event_type);
        if (filters.date_from) params.set("date_from", filters.date_from);
        if (filters.date_to) params.set("date_to", filters.date_to);
        if (cursor) params.set("cursor", cursor);
        params.set("limit", "100");

        const res = await fetch(`/api/audit/events?${params.toString()}`);
        if (!res.ok) break;

        const data = await res.json();
        allEvents.push(...data.data);
        cursor = data.meta.next_cursor;
        hasMore = !!cursor && data.data.length > 0;
      }

      if (allEvents.length === 0) return;

      // Build CSV
      const header = ["Time", "Employee", "Customer", "Phone", "Action", "Category"];
      const rows = allEvents.map((e) => [
        format(new Date(e.created_at), "yyyy-MM-dd HH:mm"),
        e.actor?.full_name ?? e.actor?.email ?? "Unknown",
        e.contact?.name ?? "Unknown",
        e.contact?.phone ?? "",
        EVENT_LABELS[e.event_type] ?? e.event_type,
        e.event_category,
      ]);

      const csv = toCsv([header, ...rows]);
      const timestamp = format(new Date(), "yyyy-MM-dd-HHmm");
      downloadBlob(`audit-report-${timestamp}.csv`, csv);
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  };

  if (!canAccess) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
            Audit & Customer Access
          </h1>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Track who accessed customer information, what actions were performed, and when.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || initialLoading}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:text-sm"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {exporting ? "Exporting..." : "Export CSV"}
          </span>
          <span className="sm:hidden">
            {exporting ? "Exporting..." : "Export"}
          </span>
        </button>
      </div>

      {initialLoading ? (
        <div className="flex items-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading audit data...
        </div>
      ) : (
        <>
          {stats && <StatsCards stats={stats} />}

          <div className="mt-6">
            <AuditFilters filters={filters} onChange={setFilters} />
          </div>

          <div className="relative mt-4">
            {filterLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            <ActivityTable events={events} />
          </div>

          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {loadingMore ? (
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                ) : null}
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
