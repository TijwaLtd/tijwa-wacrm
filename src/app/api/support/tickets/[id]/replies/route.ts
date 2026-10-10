import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'

// Add a reply to the caller's own ticket. RLS insert policy
// (support_ticket_replies_insert_member) both verifies the caller is
// a member of the ticket's account and stamps the scope — no extra
// lookup needed. Status is never changed by user replies.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let ctx
  try {
    ctx = await getCurrentAccount()
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 })
  if (text.length > 5000) {
    return NextResponse.json({ error: 'body must be at most 5000 characters' }, { status: 400 })
  }

  // Confirm the ticket exists in this account before inserting (a
  // foreign ticket id would fail the RLS insert anyway, but a clean
  // 404 beats a policy error message).
  const { data: ticket } = await ctx.supabase
    .from('support_tickets')
    .select('id, account_id')
    .eq('id', id)
    .maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const { data: reply, error } = await ctx.supabase
    .from('support_ticket_replies')
    .insert({
      ticket_id: id,
      account_id: ctx.accountId,
      author_user_id: ctx.userId,
      author_role: 'user',
      body: text,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await AuditService.record({
    eventType: AuditEventType.SUPPORT_TICKET_REPLIED,
    accountId: ctx.accountId,
    actorUserId: ctx.userId,
    metadata: { ticket_id: id, author_role: 'user' },
  })

  return NextResponse.json({ reply }, { status: 201 })
}
