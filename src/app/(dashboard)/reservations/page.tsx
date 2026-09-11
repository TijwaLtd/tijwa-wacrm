'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, CalendarCheck, Clock, Users, CheckCircle2, XCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

const RESERVATION_STATUSES: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  confirmed: { label: 'Confirmed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  seated: { label: 'Seated', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'Cancelled', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  no_show: { label: 'No Show', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
};

type ReservationStatus = keyof typeof RESERVATION_STATUSES;

interface Reservation {
  id: string;
  booking_number: string;
  status: ReservationStatus;
  guest_name: string;
  party_size: number;
  reservation_date: string;
  reservation_time: string;
  duration_minutes: number;
  special_requests: string | null;
  created_at: string;
}

export default function ReservationsPage() {
  const { activeAccountId } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReservationStatus | ''>('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchReservations = useCallback(async (isLoadMore = false) => {
    if (!activeAccountId) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isLoadMore ? page + 1 : 0;
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/reservations?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newReservations = data.reservations || [];
        setTotal(data.total || 0);

        if (isLoadMore) {
          setReservations((prev) => [...prev, ...newReservations]);
          setPage(currentPage);
        } else {
          setReservations(newReservations);
          setPage(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch reservations:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchReservations(false);
  }, [activeAccountId, statusFilter]);

  const filteredReservations = reservations.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.booking_number.toLowerCase().includes(q) ||
      r.guest_name.toLowerCase().includes(q)
    );
  });

  const columns: ColumnDef<Reservation>[] = [
    {
      header: 'Reservation #',
      cell: (r) => (
        <span className="text-sm font-semibold text-foreground font-mono">{r.booking_number}</span>
      ),
    },
    {
      header: 'Guest',
      cell: (r) => (
        <div>
          <p className="text-sm font-medium">{r.guest_name}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3" /> {r.party_size} guest{r.party_size !== 1 ? 's' : ''}
          </p>
        </div>
      ),
    },
    {
      header: 'Date & Time',
      cell: (r) => (
        <div>
          <p className="text-sm">{r.reservation_date}</p>
          <p className="text-xs text-muted-foreground">{r.reservation_time}</p>
        </div>
      ),
    },
    {
      header: 'Duration',
      cell: (r) => (
        <span className="text-sm text-muted-foreground">{r.duration_minutes} min</span>
      ),
    },
    {
      header: 'Status',
      cell: (r) => {
        const status = RESERVATION_STATUSES[r.status] || RESERVATION_STATUSES.pending;
        return (
          <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', status.color)}>
            {status.label}
          </span>
        );
      },
    },
    {
      header: 'Requests',
      cell: (r) => (
        <span className="text-xs text-muted-foreground max-w-[150px] truncate block">
          {r.special_requests || '—'}
        </span>
      ),
    },
  ];

  const cardMapper: CardMapper<Reservation> = {
    id: (r) => r.id,
    title: (r) => r.booking_number,
    subtitle: (r) => `${r.guest_name} • ${r.party_size} guests`,
    fallbackIcon: () => <CalendarCheck className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (r) => {
      const status = RESERVATION_STATUSES[r.status] || RESERVATION_STATUSES.pending;
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', status.color)}>
          {status.label}
        </span>
      );
    },
    detailFields: (r) => [
      { icon: Clock, label: 'Time', value: `${r.reservation_date} at ${r.reservation_time}` },
      { icon: Users, label: 'Party', value: `${r.party_size} guests` },
    ],
    detailHref: (r) => `/bookings/${r.id}`,
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total</span>
            <CalendarCheck className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{total}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Pending</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {reservations.filter(r => r.status === 'pending').length}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Confirmed</span>
            <CheckCircle2 className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {reservations.filter(r => r.status === 'confirmed').length}
          </p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">No Shows</span>
            <XCircle className="h-4 w-4 text-red-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">
            {reservations.filter(r => r.status === 'no_show').length}
          </p>
        </div>
      </div>

      {/* Data Listing */}
      <ResponsiveDataListing<Reservation>
        title="Reservations"
        description="Manage table reservations"
        items={filteredReservations}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search reservation number or guest name..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: (val) => setStatusFilter(val as ReservationStatus | ''),
            options: Object.entries(RESERVATION_STATUSES).map(([value, meta]) => ({
              label: meta.label,
              value,
            })),
          },
        ]}
        emptyState={{
          icon: CalendarCheck,
          title: 'No reservations',
          description: statusFilter
            ? 'Try adjusting your status filter'
            : 'Reservations from WhatsApp will appear here',
        }}
        hasMore={reservations.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchReservations(true)}
        rowKey={(r) => r.id}
      />
    </div>
  );
}
