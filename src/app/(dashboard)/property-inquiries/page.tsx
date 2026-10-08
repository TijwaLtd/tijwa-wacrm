'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  HelpCircle,
  MessageCircle,
  BadgePercent,
  Clock,
  Eye,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import {
  type Booking,
  type BookingStatus,
  formatCurrency,
} from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';
import { StatCard, STAT_GRID_CLASS } from '@/components/shared/stat-card';

const PAGE_SIZE = 25;

// Inquiry lifecycle labels (mapped onto booking statuses)
const INQUIRY_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: 'New', color: 'bg-yellow-500/10 text-yellow-500' },
  confirmed: { label: 'Contacted', color: 'bg-blue-500/10 text-blue-500' },
  cancelled: { label: 'Closed', color: 'bg-red-500/10 text-red-500' },
};

const INQUIRY_STATUS_OPTIONS: BookingStatus[] = ['pending', 'confirmed', 'cancelled'];

const INQUIRY_TYPE_META: Record<string, { label: string; color: string }> = {
  inquiry: { label: 'Inquiry', color: 'bg-violet-500/10 text-violet-500' },
  offer: { label: 'Offer', color: 'bg-emerald-500/10 text-emerald-500' },
};

type InquiryMeta = {
  inquiry_type?: string;
  property_name?: string;
  customer_name?: string;
  customer_phone?: string;
  budget?: number;
};

function getMeta(booking: Booking): InquiryMeta {
  return (booking.metadata || {}) as InquiryMeta;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

export default function PropertyInquiriesPage() {
  const { activeAccountId } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  const fetchInquiries = useCallback(async (isLoadMore = false) => {
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
        inquiry_type: 'inquiry,offer',
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
      console.error('Failed to fetch property inquiries:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchInquiries(false);
  }, [activeAccountId, statusFilter]);

  const changeStatus = async (booking: Booking, status: BookingStatus) => {
    const previous = booking.status;
    // optimistic update
    setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status } : b)));
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      toast.success(`Inquiry marked as ${INQUIRY_STATUS_META[status]?.label || status}`);
    } catch (err) {
      setBookings((prev) => prev.map((b) => (b.id === booking.id ? { ...b, status: previous } : b)));
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    }
  };

  // Client-side type + search filters
  const query = searchQuery.trim().toLowerCase();
  const items = bookings.filter((b) => {
    if (typeFilter && getMeta(b).inquiry_type !== typeFilter) return false;
    if (query) {
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
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const newCount = bookings.filter((b) => b.status === 'pending').length;
  const contactedCount = bookings.filter((b) => b.status === 'confirmed').length;
  const offerCount = bookings.filter((b) => getMeta(b).inquiry_type === 'offer').length;

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
      header: 'Type',
      cell: (booking) => {
        const typeMeta = INQUIRY_TYPE_META[getMeta(booking).inquiry_type || 'inquiry'];
        return (
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', typeMeta.color)}>
            {typeMeta.label}
          </span>
        );
      },
    },
    {
      header: 'Budget',
      cell: (booking) => (
        <span className="text-sm font-semibold text-foreground font-mono">
          {booking.total > 0 ? formatCurrency(booking.total, booking.currency) : '—'}
        </span>
      ),
    },
    {
      header: 'Received',
      cell: (booking) => (
        <span className="text-sm text-muted-foreground">{formatDate(booking.created_at)}</span>
      ),
    },
    {
      header: 'Status',
      cell: (booking) => {
        const statusMeta = INQUIRY_STATUS_META[booking.status] || INQUIRY_STATUS_META.pending;
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
          <DropdownMenuContent align="end" className="w-40">
            {INQUIRY_STATUS_OPTIONS.filter((s) => s !== booking.status).map((s) => (
              <DropdownMenuItem key={s} onClick={() => changeStatus(booking, s)}>
                Mark as {INQUIRY_STATUS_META[s]?.label || s}
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
    fallbackIcon: () => <HelpCircle className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (booking) => {
      const typeMeta = INQUIRY_TYPE_META[getMeta(booking).inquiry_type || 'inquiry'];
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', typeMeta.color)}>
          {typeMeta.label}
        </span>
      );
    },
    amount: (booking) => (booking.total > 0 ? formatCurrency(booking.total, booking.currency) : undefined),
    detailFields: (booking) => {
      const meta = getMeta(booking);
      return [
        { label: 'Status', value: (INQUIRY_STATUS_META[booking.status] || INQUIRY_STATUS_META.pending).label },
        { label: 'Received', value: formatDate(booking.created_at) },
        ...(meta.customer_phone ? [{ label: 'Phone', value: meta.customer_phone }] : []),
      ];
    },
    description: (booking) => booking.notes,
    detailHref: (booking) => `/bookings/${booking.id}`,
    actions: (booking) =>
      INQUIRY_STATUS_OPTIONS.filter((s) => s !== booking.status).map((s) => ({
        label: `Mark ${INQUIRY_STATUS_META[s]?.label || s}`,
        variant: 'outline' as const,
        onClick: () => changeStatus(booking, s),
      })),
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Metric Cards */}
      <div className={STAT_GRID_CLASS}>
        <StatCard title="Total Inquiries" value={total} icon={HelpCircle} iconClassName="text-primary" />
        <StatCard title="New" value={newCount} icon={Clock} iconClassName="text-amber-500" />
        <StatCard title="Contacted" value={contactedCount} icon={MessageCircle} iconClassName="text-blue-500" />
        <StatCard title="Offers" value={offerCount} icon={BadgePercent} iconClassName="text-emerald-500" />
      </div>

      {/* Main Responsive Data Listing */}
      <ResponsiveDataListing<Booking>
        title="Property Inquiries"
        description="Inquiries and offers submitted by customers on WhatsApp"
        items={items}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by property or customer..."
        filters={[
          {
            key: 'type',
            label: 'Type',
            value: typeFilter,
            onChange: setTypeFilter,
            options: [
              { label: 'Inquiries', value: 'inquiry' },
              { label: 'Offers', value: 'offer' },
            ],
          },
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: setStatusFilter,
            options: INQUIRY_STATUS_OPTIONS.map((s) => ({
              label: INQUIRY_STATUS_META[s]?.label || s,
              value: s,
            })),
          },
        ]}
        emptyState={{
          icon: HelpCircle,
          title: 'No property inquiries',
          description: searchQuery || statusFilter || typeFilter
            ? 'Try adjusting your search query or active filters'
            : 'Customer inquiries from WhatsApp will appear here',
        }}
        hasMore={bookings.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchInquiries(true)}
        rowKey={(b) => b.id}
      />
    </div>
  );
}
