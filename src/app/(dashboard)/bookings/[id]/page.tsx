'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Calendar, CheckCircle2, UserCheck, LogOut, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Booking, type BookingStatus, BOOKING_STATUSES, formatCurrency } from '@/lib/business/orders';

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeAccountId } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchBooking = () => {
    if (!id) return;
    fetch(`/api/bookings/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.booking) setBooking(data.booking);
      })
      .catch(err => console.error('Failed to fetch booking:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBooking();
  }, [id]);

  const handleUpdateStatus = async (newStatus: BookingStatus) => {
    if (!booking || !activeAccountId) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account_id: activeAccountId,
          status: newStatus,
        }),
      });

      if (!res.ok) throw new Error('Failed to update status');

      toast.success(`Booking marked as ${BOOKING_STATUSES[newStatus]?.label}`);
      fetchBooking();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="space-y-4">
        <Link href="/bookings" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Bookings
        </Link>
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center bg-card">
          <Calendar className="h-12 w-12 text-muted-foreground/60" />
          <p className="mt-4 text-sm font-semibold text-foreground">Booking not found</p>
        </div>
      </div>
    );
  }

  const statusMeta = BOOKING_STATUSES[booking.status];

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  // @ts-expect-error offering is joined from API
  const offeringName = booking.offering?.name;
  // @ts-expect-error offering is joined from API
  const offeringType = booking.offering?.type;

  return (
    <div className="space-y-6">
      <Link href="/bookings" className="text-xs sm:text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Bookings
      </Link>

      {/* Top Header Card */}
      <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold font-mono text-foreground">{booking.booking_number}</h1>
              <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider', statusMeta?.color)}>
                {statusMeta?.label}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Created on {new Date(booking.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>

          {/* Quick Status Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 sm:pt-0">
            {booking.status === 'pending' && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('confirmed')}
                className="h-8 text-xs gap-1 border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirm Booking
              </Button>
            )}

            {(booking.status === 'confirmed' || booking.status === 'pending') && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('checked_in')}
                className="h-8 text-xs gap-1 border-blue-500/30 text-blue-600 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950/40"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Check In Guest
              </Button>
            )}

            {booking.status === 'checked_in' && (
              <Button
                size="sm"
                variant="outline"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('checked_out')}
                className="h-8 text-xs gap-1 border-purple-500/30 text-purple-600 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950/40"
              >
                <LogOut className="h-3.5 w-3.5" />
                Check Out Guest
              </Button>
            )}

            {booking.status !== 'cancelled' && booking.status !== 'checked_out' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={updatingStatus}
                onClick={() => handleUpdateStatus('cancelled')}
                className="h-8 text-xs gap-1 text-destructive hover:bg-destructive/10"
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Start Date / Check-in</p>
          <p className="text-xs sm:text-sm font-semibold text-foreground font-mono mt-1">{formatDate(booking.start_date)}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">End Date / Check-out</p>
          <p className="text-xs sm:text-sm font-semibold text-foreground font-mono mt-1">{formatDate(booking.end_date)}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-card p-3.5 shadow-xs">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Guests</p>
          <p className="text-base sm:text-lg font-semibold text-foreground mt-1">{booking.guests} guest{booking.guests !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3.5 shadow-xs">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-wider">Total Amount</p>
          <p className="text-lg sm:text-xl font-bold text-foreground font-mono mt-1">{formatCurrency(booking.total, booking.currency)}</p>
        </div>
      </div>

      {/* Offering Details */}
      {offeringName && (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Booked Offering</h2>
          <div className="bg-muted/30 p-3 rounded-lg border border-border/40">
            <p className="text-sm font-semibold text-foreground">{offeringName}</p>
            {offeringType && <p className="text-xs text-muted-foreground mt-0.5 font-medium uppercase tracking-wide">{offeringType}</p>}
          </div>
        </div>
      )}

      {/* Notes */}
      {booking.notes && (
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Booking Notes</h2>
          <p className="text-xs sm:text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/40">
            {booking.notes}
          </p>
        </div>
      )}
    </div>
  );
}
