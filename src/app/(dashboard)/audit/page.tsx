"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-can";
import { useRouter } from "next/navigation";
import { StatsCards } from "@/components/audit/stats-cards";
import { ActivityTable } from "@/components/audit/activity-table";
import { AuditFilters } from "@/components/audit/filters";
import { Loader2 } from "lucide-react";

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

export default function AuditPage() {
  const { accountRole } = useAuth();
  const canAccess = useCan("view-audit");
  const router = useRouter();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    user: "",
    event_type: "",
    date_from: "",
    date_to: "",
  });

  // Redirect if not admin
  useEffect(() => {
    if (!accountRole) return; // still loading
    if (!canAccess) {
      router.push("/dashboard");
    }
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
      if (!res.ok) return;

      const data = await res.json();
      setEvents((prev) => (reset ? data.data : [...prev, ...data.data]));
      setNextCursor(data.meta.next_cursor);
    },
    [canAccess, filters],
  );

  const fetchStats = useCallback(async () => {
    if (!canAccess) return;
    const res = await fetch("/api/audit/stats");
    if (res.ok) {
      setStats(await res.json());
    }
  }, [canAccess]);

  // Initial load
  useEffect(() => {
    if (!canAccess) return;
    setLoading(true);
    Promise.all([fetchEvents(undefined, true), fetchStats()]).then(() =>
      setLoading(false),
    );
  }, [canAccess, fetchEvents, fetchStats]);

  // Refetch on filter change
  useEffect(() => {
    if (!canAccess) return;
    setLoading(true);
    fetchEvents(undefined, true).then(() => setLoading(false));
  }, [filters, canAccess, fetchEvents]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    await fetchEvents(nextCursor);
    setLoadingMore(false);
  };

  if (!canAccess) {
    return null;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground sm:text-2xl">
          Audit & Customer Access
        </h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Track who accessed customer information, what actions were performed, and when.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading audit data...
        </div>
      ) : (
        <>
          {stats && <StatsCards stats={stats} />}

          <div className="mt-6">
            <AuditFilters filters={filters} onChange={setFilters} />
          </div>

          <div className="mt-4">
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
