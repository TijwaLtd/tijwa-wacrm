'use client';

// ============================================================
// /<slug>/b/<bookingId> — customer's appointment detail page.
//
// Public capability URL (tenant slug + booking UUID, no login):
// the link we send with an appointment confirmation. The id is
// the booking's UUID (opaque), never the enumerable BK- number.
//
// Read-only view for now — rescheduling and cancellation still
// happen over the conversation ("reply with a new date").
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CalendarDays, Clock, FileText, Loader2, Tag } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type PageParams = { slug: string; bookingId: string };

interface BookingResponse {
  ok: boolean;
  account: { name: string; logo_url: string | null };
  booking: {
    booking_number: string;
    status: string;
    service_name: string | null;
    start_date: string | null;
    end_date: string | null;
    total: number | null;
    currency: string | null;
  };
}

const STATUS_STYLES: Record<string, string> = {
  confirmed: 'border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  pending: 'border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-100',
  checked_in: 'border-sky-300 bg-sky-100 text-sky-700 hover:bg-sky-100',
  checked_out: 'border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  cancelled: 'border-red-300 bg-red-100 text-red-700 hover:bg-red-100',
};

function formatDateTime(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function AppointmentPage() {
  const params = useParams<PageParams>();
  const slug = params?.slug ?? '';
  const bookingId = params?.bookingId ?? '';
  const base = `/api/public/${slug}/bookings/${bookingId}`;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [brand, setBrand] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingResponse['booking'] | null>(null);

  useEffect(() => {
    if (!slug || !bookingId || !base) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(base, { cache: 'no-store' });
        if (cancelled) return;
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const data: BookingResponse = await res.json();
        if (cancelled) return;
        setBrand(data.account.name);
        setLogoUrl(data.account.logo_url);
        setBooking(data.booking);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, bookingId, base]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !booking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>Link not valid</CardTitle>
            <CardDescription>
              This appointment link is no longer valid or was mistyped. You can message the business
              directly on WhatsApp to get a new one.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const start = formatDateTime(booking.start_date);
  const end = formatDateTime(booking.end_date);
  const statusStyle = STATUS_STYLES[booking.status] ?? 'border-border text-muted-foreground';

  return (
    <div className="min-h-screen bg-muted/40">
      <div className="mx-auto max-w-md px-4 py-8 sm:py-14">
        <header className="mb-6 flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="size-10 rounded-lg object-cover" />
          ) : (
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground">
              {brand.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">{brand}</p>
            <p className="text-xs text-muted-foreground">Your appointment</p>
          </div>
        </header>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{booking.service_name || 'Appointment'}</CardTitle>
              <Badge className={statusStyle}>{booking.status.replace('_', ' ')}</Badge>
            </div>
            <CardDescription>
              Reference <span className="font-mono text-foreground">{booking.booking_number}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium text-foreground">{start || 'Date to be confirmed'}</p>
                {end && end !== start && (
                  <p className="text-xs text-muted-foreground">until {end}</p>
                )}
              </div>
            </div>
            {booking.total != null && (
              <div className="flex items-center gap-3">
                <Tag className="size-4 shrink-0 text-muted-foreground" />
                <p className="text-sm text-foreground">
                  {booking.currency || 'KES'} {booking.total}
                </p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                To change or cancel, reply in your WhatsApp chat — we&apos;ll sort it right away.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link
            href={`/${slug}/legal/terms`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <FileText className="size-3" /> Terms
          </Link>
          <Link
            href={`/${slug}/legal/privacy`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <FileText className="size-3" /> Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}
