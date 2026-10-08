import { NextResponse } from 'next/server';

// Lightweight connectivity probe for the offline banner's Retry button.
// No auth, no DB — it must answer even when Supabase is unreachable, so
// a 200 here means "the app server is back", not just "the socket is up".
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true });
}
