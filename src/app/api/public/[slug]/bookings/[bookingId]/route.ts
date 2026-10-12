// ============================================================
// /api/public/[slug]/bookings/[bookingId] — unauthenticated
// appointment-detail API (capability URL: slug + booking UUID).
//
// GET → the booking's details for the customer-facing page.
//       The id is the booking's UUID (opaque), never the
//       enumerable BK- number, so links can't be guessed.
//
// Every query is account-scoped first — a wrong slug can never
// reach another tenant's booking.
// ============================================================

import { NextResponse } from 'next/server'
import { resolveAccountBySlug, resolveBooking } from '@/lib/public/customer'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

interface Params {
  params: Promise<{ slug: string; bookingId: string }>
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

export async function GET(request: Request, { params }: Params) {
  const limit = checkRateLimit(`publicBooking:${clientIp(request)}`, RATE_LIMITS.publicForm)
  if (!limit.success) return rateLimitResponse(limit)

  const { slug, bookingId } = await params
  const account = await resolveAccountBySlug(slug)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const booking = await resolveBooking(account.id, bookingId)
  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    account: {
      name: account.display_name || account.name,
      logo_url: account.logo_url,
    },
    booking: {
      booking_number: booking.booking_number,
      status: booking.status,
      service_name: booking.service_name,
      start_date: booking.start_date,
      end_date: booking.end_date,
      total: booking.total,
      currency: booking.currency,
    },
  })
}
