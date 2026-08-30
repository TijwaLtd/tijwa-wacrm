'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { Loader2, ArrowLeft, Calendar } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { type Booking, BOOKING_STATUSES, formatCurrency } from '@/lib/business/orders';

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { activeAccountId } = useAuth();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/bookings/${id}`)
      .then(res => res.json())
      .then(data => {
        if (data.booking) setBooking(data.booking);
      })
      .catch(err => console.error('Failed to fetch booking:', err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="space-y-4">
        <Link href="/bookings" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Bookings
        </Link>
        <div className="flex flex-col items-center justify-center rounded-lg border border-border py-12">
          <Calendar className="h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Booking not found</p>
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
      <Link href="/bookings" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to Bookings
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{booking.booking_number}</h1>
          <p className="text-sm text-muted-foreground">
            Created {new Date(booking.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-xs font-medium', statusMeta?.color)}>
          {statusMeta?.label}
        </span>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Check-in</p>
          <p className="text-sm font-medium text-foreground mt-1">{formatDate(booking.start_date)}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Check-out</p>
          <p className="text-sm font-medium text-foreground mt-1">{formatDate(booking.end_date)}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Guests</p>
          <p className="text-lg font-medium text-foreground mt-1">{booking.guests}</p>
        </div>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-lg font-bold text-foreground mt-1">{formatCurrency(booking.total, booking.currency)}</p>
        </div>
      </div>

      {/* Offering */}
      {offeringName && (
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">Booked Offering</p>
          <p className="text-sm font-medium text-foreground">{offeringName}</p>
          {offeringType && (
            <p className="text-xs text-muted-foreground mt-1">{offeringType}</p>
          )}
        </div>
      )}

      {/* Notes */}
      {booking.notes && (
        <div className="rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium text-foreground mb-2">Notes</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{booking.notes}</p>
        </div>
      )}
    </div>
  );
}
