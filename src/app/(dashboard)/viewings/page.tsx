'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Clock,
  CalendarCheck,
  CheckCircle,
  Calendar,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  type Booking,
  type BookingStatus,
  BOOKING_STATUSES,
} from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

// Viewing lifecycle labels (mapped onto booking statuses)
const VIEWING_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: BOOKING_STATUSES.pending.color },
  confirmed: { label: 'Confirmed', color: BOOKING_STATUSES.confirmed.color },
  checked_in: { label: 'Viewed', color: BOOKING_STATUSES.checked_in.color },
  checked_out: { label: 'Completed', color: BOOKING_STATUSES.checked_out.color },
  cancelled: { label: 'Cancelled', color: BOOKING_STATUSES.cancelled.color },
};

const VIEWING_STATUS_OPTIONS: BookingStatus[] = [
  'pending',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
];

type ViewingMeta = {
  inquiry_type?: string;
  property_name?: string;
  customer_name?: string;
  customer_phone?: string;
  preferred_date?: string;
  preferred_time?: string;
  budget?: number;
};

function getMeta(booking: Booking): ViewingMeta {
  return (booking.metadata || {}) as ViewingMeta;
}

function formatPreferred(booking: Booking): string {
  const meta = getMeta(booking);
  const date = meta.preferred_date || booking.start_date;
  if (!date) return '—';
  let formatted = date;
  try {
    formatted = new Date(date).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    // keep raw
  }
  return meta.preferred_time ? `${formatted} · ${meta.preferred_time}` : formatted;
}

export default function ViewingsPage() {
  const { activeAccountId } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchViewings = useCallback(async (isLoadMore = false) => {
    if (!activeAccountId) return;
    if (isLoadMore) setIsLoadingMore(true);
    else setLoading(true);

    try {
      const currentPage = isLoadMore ? page + 1 : 0;
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
        meta_type: 'property_inquiry',
        inquiry_type: 'viewing',
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/bookings?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newItems: Booking[] = data.bookings || [];
        setTotal(data.total || 0);

        if (isLoadMore) {
          setBookings((prev) => [...prev, ...newItems]);
          setPage(currentPage);
        } else {
          setBookings(newItems);
          setPage(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch viewings:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchViewings(false);
  }, [activeAccountId, statusFilter]);

  const changeStatus = async (booking: Booking, status: BookingStatus) => {
    const previous = booking.status;
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status } : b)));
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      toast.success(`Viewing marked as ${VIEWING_STATUS_META[status]?.label || status}`);
    } catch (err) {
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: previous } : b)));
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  // Client-side search filter
  const query = searchQuery.trim().toLowerCase();
  const items = bookings.filter((b) => {
    if (!query) return true;
    const meta = getMeta(b);
    const haystack = [
      meta.property_name,
      meta.customer_name,
      meta.customer_phone,
      b.booking_number,
      b.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });

  const pendingCount = bookings.filter((b) => b.status === 'pending').length;
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;
  const viewedCount = bookings.filter((b) => b.status === 'checked_in' || b.status === 'checked_out').length;

  const columns: ColumnDef<Booking>[] = [
    {
      header: 'Property',
      cell: (booking) => {
        const meta = getMeta(booking);
        // @ts-expect-error offering is joined from API
        const offeringName = booking.offering?.name;
        return (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {meta.property_name || offeringName || '—'}
            </p>
            <p className="text-xs text-muted-foreground truncate">{booking.booking_number}</p>
          </div>
        );
      },
    },
    {
      header: 'Customer',
      cell: (booking) => {
        const meta = getMeta(booking);
        return (
          <div className="min-w-0">
            <p className="text-sm text-foreground truncate">{meta.customer_name || '—'}</p>
            {meta.customer_phone && (
              <p className="text-xs text-muted-foreground truncate">{meta.customer_phone}</p>
            )}
          </div>
        );
      },
    },
    {
      header: 'Preferred Date',
      cell: (booking) => (
        <span className="text-sm text-foreground">{formatPreferred(booking)}</span>
      ),
    },
    {
      header: 'Status',
      cell: (booking) => {
        const statusMeta = VIEWING_STATUS_META[booking.status] || VIEWING_STATUS_META.pending;
        return (
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', statusMeta.color)}>
            {statusMeta.label}
          </span>
        );
      },
    },
    {
      header: 'Actions',
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (booking) => (
        <DropdownMenu>
          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus:outline-none ml-auto">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            {VIEWING_STATUS_OPTIONS.filter((s) => s !== booking.status).map((s) => (
              <DropdownMenuItem key={s} onClick={() => changeStatus(booking, s)}>
                Mark as {VIEWING_STATUS_META[s]?.label || s}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => { window.location.href = `/bookings/${booking.id}`; }}>
              <Eye className="h-4 w-4 mr-2" />
              View Booking
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const cardMapper: CardMapper<Booking> = {
    id: (booking) => booking.id,
    title: (booking) => getMeta(booking).property_name || booking.booking_number,
    subtitle: (booking) => getMeta(booking).customer_name,
    fallbackIcon: () => <Eye className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (booking) => {
      const statusMeta = VIEWING_STATUS_META[booking.status] || VIEWING_STATUS_META.pending;
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusMeta.color)}>
          {statusMeta.label}
        </span>
      );
    },
    detailFields: (booking) => [
      { label: 'Preferred', value: formatPreferred(booking), fullWidth: true },
      { label: 'Status', value: (VIEWING_STATUS_META[booking.status] || VIEWING_STATUS_META.pending).label },
      ...(getMeta(booking).customer_phone
        ? [{ label: 'Phone', value: getMeta(booking).customer_phone as string }]
        : []),
    ],
    description: (booking) => booking.notes,
    detailHref: (booking) => `/bookings/${booking.id}`,
    actions: (booking) =>
      VIEWING_STATUS_OPTIONS.filter((s) => s !== booking.status).slice(0, 3).map((s) => ({
        label: `Mark ${VIEWING_STATUS_META[s]?.label || s}`,
        variant: 'outline' as const,
        onClick: () => changeStatus(booking, s),
      })),
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Viewings</span>
            <Eye className="h-4 w-4 text-primary" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{total}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Pending</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{pendingCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Confirmed</span>
            <CalendarCheck className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{confirmedCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Viewed</span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{viewedCount}</p>
        </div>
      </div>

      {/* Main Responsive Data Listing */}
      <ResponsiveDataListing<Booking>
        title="Viewings"
        description="Property viewing requests submitted by customers on WhatsApp"
        items={items}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by property or customer..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: VIEWING_STATUS_OPTIONS.map((s) => ({
              label: VIEWING_STATUS_META[s]?.label || s,
              value: s,
            })),
          },
        ]}
        emptyState={{
          icon: Calendar,
          title: 'No viewings scheduled',
          description: searchQuery || statusFilter
            ? 'Try adjusting your search query or active filters'
            : 'Viewing requests from WhatsApp will appear here',
        }}
        hasMore={bookings.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchViewings(true)}
        rowKey={(b) => b.id}
      />
    </div>
  );
}
