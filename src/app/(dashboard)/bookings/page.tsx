'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Calendar, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
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

const PAGE_SIZE = 25;

export default function BookingsPage() {
  const { activeAccountId } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchBookings = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        account_id: activeAccountId,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/bookings?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings || []);
        setTotal(data.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch bookings:', err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, page, statusFilter]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

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
      fetchBookings();
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
      fetchBookings();
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
          <p className="text-sm text-muted-foreground">Manage reservations and bookings</p>
        </div>
        <Button onClick={() => openForm()} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Booking</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as BookingStatus | ''); setPage(0); }}
          className="border-border bg-muted text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(BOOKING_STATUSES).map(([value, meta]) => (
            <option key={value} value={value}>{meta.label}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">No bookings yet</p>
          <Button variant="outline" onClick={() => openForm()} className="mt-4 border-border">
            <Plus className="h-4 w-4 mr-2" />
            Create First Booking
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden overflow-hidden rounded-lg border border-border md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Booking #</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider md:table-cell">Dates</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider lg:table-cell">Guests</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider lg:table-cell">Total</th>
                  <th className="hidden px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider sm:table-cell">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookings.map((booking) => {
                  const statusMeta = BOOKING_STATUSES[booking.status];
                  // @ts-expect-error offering is joined from API
                  const offeringName = booking.offering?.name;
                  return (
                    <tr key={booking.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link href={`/bookings/${booking.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                          {booking.booking_number}
                        </Link>
                        {offeringName && (
                          <p className="text-xs text-muted-foreground">{offeringName}</p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span className="text-sm text-muted-foreground">
                          {formatDateRange(booking.start_date, booking.end_date)}
                        </span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-sm text-muted-foreground">{booking.guests}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <span className="text-sm text-foreground">{formatCurrency(booking.total, booking.currency)}</span>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className={cn('inline-flex items-center rounded-full px-2 py-1 text-xs font-medium', statusMeta?.color)}>
                          {statusMeta?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus:outline-none">
                            <MoreHorizontal className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openForm(booking)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteConfirm(booking)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="divide-y divide-border rounded-lg border border-border md:hidden">
            {bookings.map((booking) => {
              const statusMeta = BOOKING_STATUSES[booking.status];
              return (
                <div key={booking.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <Link href={`/bookings/${booking.id}`} className="text-sm font-medium text-foreground hover:text-primary">
                      {booking.booking_number}
                    </Link>
                    <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', statusMeta?.color)}>
                      {statusMeta?.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDateRange(booking.start_date, booking.end_date)}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{booking.guests} guest{booking.guests !== 1 ? 's' : ''}</span>
                    <span className="text-foreground font-medium">{formatCurrency(booking.total, booking.currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="border-border">
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="border-border">
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create/Edit Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBooking ? `Edit ${editingBooking.booking_number}` : 'New Booking'}</DialogTitle>
            <DialogDescription>
              {editingBooking ? 'Update booking details' : 'Create a new reservation'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Start Date</Label>
                <Input
                  type="datetime-local"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">End Date</Label>
                <Input
                  type="datetime-local"
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="border-border bg-muted"
                />
              </div>
            </div>

            {/* Guests & Total */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Guests</Label>
                <Input
                  type="number"
                  min="1"
                  value={formGuests}
                  onChange={(e) => setFormGuests(e.target.value)}
                  className="border-border bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Total Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formTotal}
                  onChange={(e) => setFormTotal(e.target.value)}
                  placeholder="0.00"
                  className="border-border bg-muted"
                />
              </div>
            </div>

            {/* Status (edit only) */}
            {editingBooking && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Status</Label>
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
            <div className="space-y-2">
              <Label className="text-muted-foreground">Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Booking notes..."
                rows={2}
                className="border-border bg-muted"
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editingBooking ? 'Update' : 'Create'}
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
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
