'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Calendar, MoreHorizontal, Pencil, Trash2, Clock, CheckCircle2, UserCheck, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Booking, type BookingStatus, BOOKING_STATUSES, formatCurrency } from '@/lib/business/orders';
import { ResponsiveDataListing, type ColumnDef, type CardMapper } from '@/components/shared/responsive-data-listing';

const PAGE_SIZE = 25;

export default function BookingsPage() {
  const { activeAccountId } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | ''>('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Booking | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formGuests, setFormGuests] = useState('1');
  const [formTotal, setFormTotal] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<BookingStatus>('pending');
  const [saving, setSaving] = useState(false);

  const fetchBookings = useCallback(async (isLoadMore = false) => {
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

      const res = await fetch(`/api/bookings?${params}`);
      if (res.ok) {
        const data = await res.json();
        const newBookings = data.bookings || [];
        setTotal(data.total || 0);

        if (isLoadMore) {
          setBookings((prev) => [...prev, ...newBookings]);
          setPage(currentPage);
        } else {
          setBookings(newBookings);
          setPage(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchBookings(false);
  }, [activeAccountId, statusFilter]);

  const filteredBookings = bookings.filter((bk) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    // @ts-expect-error offering is joined from API
    const offeringName = bk.offering?.name?.toLowerCase() || '';
    return (
      bk.booking_number.toLowerCase().includes(q) ||
      offeringName.includes(q) ||
      (bk.notes && bk.notes.toLowerCase().includes(q))
    );
  });

  const openForm = (booking?: Booking) => {
    if (booking) {
      setEditingBooking(booking);
      setFormStartDate(booking.start_date ? new Date(booking.start_date).toISOString().slice(0, 16) : '');
      setFormEndDate(booking.end_date ? new Date(booking.end_date).toISOString().slice(0, 16) : '');
      setFormGuests(String(booking.guests));
      setFormTotal(String(booking.total));
      setFormNotes(booking.notes || '');
      setFormStatus(booking.status);
    } else {
      setEditingBooking(null);
      setFormStartDate('');
      setFormEndDate('');
      setFormGuests('1');
      setFormTotal('');
      setFormNotes('');
      setFormStatus('pending');
    }
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (!activeAccountId) return;
    setSaving(true);
    try {
      const body = {
        account_id: activeAccountId,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
        guests: parseInt(formGuests) || 1,
        total: parseFloat(formTotal) || 0,
        notes: formNotes.trim() || null,
        status: editingBooking ? formStatus : undefined,
      };

      let res;
      if (editingBooking) {
        res = await fetch(`/api/bookings/${editingBooking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      toast.success(editingBooking ? 'Booking updated' : 'Booking created');
      setFormOpen(false);
      fetchBookings(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bookings/${deleteConfirm.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Booking deleted');
      setDeleteConfirm(null);
      fetchBookings(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDateRange = (start: string | null, end: string | null) => {
    if (!start) return 'Dates TBD';
    const s = formatDate(start);
    if (!end) return s;
    return `${s} — ${formatDate(end)}`;
  };

  // Overview stats
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;
  const confirmedCount = bookings.filter((b) => b.status === 'confirmed').length;
  const checkedInCount = bookings.filter((b) => b.status === 'checked_in').length;

  // Table Columns Definition
  const columns: ColumnDef<Booking>[] = [
    {
      header: 'Booking #',
      cell: (booking) => {
        // @ts-expect-error offering is joined from API
        const offeringName = booking.offering?.name;
        return (
          <div>
            <Link
              href={`/bookings/${booking.id}`}
              className="text-sm font-semibold text-foreground hover:text-primary transition-colors font-mono"
            >
              {booking.booking_number}
            </Link>
            {offeringName && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{offeringName}</p>}
          </div>
        );
      },
    },
    {
      header: 'Dates',
      cell: (booking) => (
        <span className="text-sm text-muted-foreground font-mono">
          {formatDateRange(booking.start_date, booking.end_date)}
        </span>
      ),
    },
    {
      header: 'Guests',
      cell: (booking) => (
        <span className="text-sm text-muted-foreground">{booking.guests} guest{booking.guests !== 1 ? 's' : ''}</span>
      ),
    },
    {
      header: 'Total Amount',
      cell: (booking) => (
        <span className="text-sm font-semibold text-foreground font-mono">
          {formatCurrency(booking.total, booking.currency)}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (booking) => {
        const statusMeta = BOOKING_STATUSES[booking.status];
        return (
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', statusMeta?.color)}>
            {statusMeta?.label || booking.status}
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
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem>
              <Link href={`/bookings/${booking.id}`} className="flex items-center w-full">
                <Eye className="h-4 w-4 mr-2" /> View Details
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openForm(booking)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit Booking
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleteConfirm(booking)} className="text-destructive">
              <Trash2 className="h-4 w-4 mr-2" /> Delete Booking
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Mobile App Card Mapper
  const cardMapper: CardMapper<Booking> = {
    id: (booking) => booking.id,
    title: (booking) => booking.booking_number,
    // @ts-expect-error offering is joined from API
    subtitle: (booking) => booking.offering?.name || formatDateRange(booking.start_date, booking.end_date),
    fallbackIcon: () => <Calendar className="h-6 w-6 text-muted-foreground" />,
    statusBadge: (booking) => {
      const statusMeta = BOOKING_STATUSES[booking.status];
      return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', statusMeta?.color)}>
          {statusMeta?.label}
        </span>
      );
    },
    amount: (booking) => formatCurrency(booking.total, booking.currency),
    detailFields: (booking) => [
      { label: 'Date Range', value: formatDateRange(booking.start_date, booking.end_date), fullWidth: true },
      { label: 'Guests', value: `${booking.guests} guest${booking.guests !== 1 ? 's' : ''}` },
      // @ts-expect-error offering is joined from API
      ...(booking.offering?.name ? [{ label: 'Booked Offering', value: booking.offering.name }] : []),
    ],
    description: (booking) => booking.notes,
    detailHref: (booking) => `/bookings/${booking.id}`,
    actions: (booking) => [
      {
        label: 'Edit',
        icon: Pencil,
        variant: 'outline',
        onClick: () => openForm(booking),
      },
      {
        label: 'Delete',
        icon: Trash2,
        variant: 'destructive',
        onClick: () => setDeleteConfirm(booking),
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Top Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Total Bookings</span>
            <Calendar className="h-4 w-4 text-primary" />
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
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{confirmedCount}</p>
        </div>

        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Checked In</span>
            <UserCheck className="h-4 w-4 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-foreground mt-1.5">{checkedInCount}</p>
        </div>
      </div>

      {/* Main Responsive Data Listing */}
      <ResponsiveDataListing<Booking>
        title="Bookings"
        description="Manage room reservations, appointment bookings, and guest check-ins"
        items={filteredBookings}
        columns={columns}
        cardMapper={cardMapper}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search booking number, offering, notes..."
        filters={[
          {
            key: 'status',
            label: 'Status',
            value: statusFilter,
            onChange: (val) => setStatusFilter(val as BookingStatus | ''),
            options: Object.entries(BOOKING_STATUSES).map(([value, meta]) => ({
              label: meta.label,
              value,
            })),
          },
        ]}
        primaryAction={{
          label: 'New Booking',
          icon: Plus,
          onClick: () => openForm(),
        }}
        emptyState={{
          icon: Calendar,
          title: 'No bookings found',
          description: searchQuery || statusFilter
            ? 'Try adjusting your search query or status filter'
            : 'Create your first reservation or appointment booking to get started',
          actionLabel: 'Create First Booking',
          onAction: () => openForm(),
        }}
        hasMore={bookings.length < total}
        isLoadingMore={isLoadingMore}
        onLoadMore={() => fetchBookings(true)}
        rowKey={(b) => b.id}
      />

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBooking ? `Edit ${editingBooking.booking_number}` : 'New Booking'}</DialogTitle>
            <DialogDescription>
              {editingBooking ? 'Update reservation details' : 'Create a new reservation or booking'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Start Date / Check-in</Label>
                <Input
                  type="datetime-local"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="border-border bg-muted text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">End Date / Check-out</Label>
                <Input
                  type="datetime-local"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="border-border bg-muted text-sm"
                />
              </div>
            </div>

            {/* Guests & Total */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Guests</Label>
                <Input
                  type="number"
                  min="1"
                  value={formGuests}
                  onChange={(e) => setFormGuests(e.target.value)}
                  placeholder="1"
                  className="border-border bg-muted text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Total Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formTotal}
                  onChange={(e) => setFormTotal(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted text-sm"
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {editingBooking && (
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Booking Status</Label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as BookingStatus)}
                  className="w-full border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
                >
                  {Object.entries(BOOKING_STATUSES).map(([value, meta]) => (
                    <option key={value} value={value}>{meta.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Booking Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Guest preferences, special requests, or instructions..."
                rows={2}
                className="border-border bg-muted text-sm"
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingBooking ? 'Update Booking' : 'Create Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Booking?</DialogTitle>
            <DialogDescription>
              This will permanently delete booking &ldquo;{deleteConfirm?.booking_number}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete Booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
