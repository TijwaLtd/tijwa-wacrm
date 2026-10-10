import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { isSupportStaff } from '@/lib/support/staff'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'

// Staff reply on any account's ticket. A staff reply on a still-open
// ticket bumps it to in_progress — the status should reflect that
// someone is actually working on it, not that a message landed.

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
  if (!(await isSupportStaff(ctx))) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (!text) return NextResponse.json({ error: 'body is required' }, { status: 400 })
  if (text.length > 5000) {
    return NextResponse.json({ error: 'body must be at most 5000 characters' }, { status: 400 })
  }

  const { data: ticket } = await ctx.serviceClient
    .from('support_tickets')
    .select('id, account_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const { data: reply, error } = await ctx.serviceClient
    .from('support_ticket_replies')
    .insert({
      ticket_id: id,
      account_id: ticket.account_id,
      author_user_id: ctx.userId,
      author_role: 'staff',
      body: text,
    })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let status = ticket.status
  if (ticket.status === 'open') {
    const { data: updated } = await ctx.serviceClient
      .from('support_tickets')
      .update({ status: 'in_progress' })
      .eq('id', id)
      .select('status')
      .single()
    if (updated) status = updated.status
  }

  await AuditService.record({
    eventType: AuditEventType.SUPPORT_TICKET_REPLIED,
    accountId: ticket.account_id,
    actorUserId: ctx.userId,
    metadata: { ticket_id: id, author_role: 'staff' },
  })

  return NextResponse.json({ reply, status }, { status: 201 })
}
