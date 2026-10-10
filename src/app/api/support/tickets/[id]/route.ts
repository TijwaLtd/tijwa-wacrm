import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

// One ticket with its ordered replies. RLS scopes the read to the
// caller's account — a ticket id from another account simply 404s.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  try {
    const { supabase } = await getCurrentAccount()

    const { data: ticket, error } = await supabase
      .from('support_tickets')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const { data: replies, error: repliesErr } = await supabase
      .from('support_ticket_replies')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true })
    if (repliesErr) {
      return NextResponse.json({ error: repliesErr.message }, { status: 500 })
    }

    return NextResponse.json({ ticket: { ...ticket, replies: replies ?? [] } })
  } catch (err) {
    return toErrorResponse(err)
  }
}
