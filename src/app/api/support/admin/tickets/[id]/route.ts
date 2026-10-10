import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { isSupportStaff } from '@/lib/support/staff'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'
import {
  isSupportTicketPriority,
  isSupportTicketStatus,
  isSupportTicketCategory,
} from '@/lib/support/types'

// Staff console: view a ticket from any account + update its
// lifecycle (status/priority/category). Users can never do this —
// their routes have no update path at all.

export async function GET(
  _request: Request,
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

  const { data: ticket, error } = await ctx.serviceClient
    .from('support_tickets')
    .select('*, account:accounts(name)')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  const { data: replies } = await ctx.serviceClient
    .from('support_ticket_replies')
    .select('*')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  return NextResponse.json({ ticket: { ...ticket, replies: replies ?? [] } })
}

export async function PATCH(
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

  const update: Record<string, unknown> = {}
  if ('status' in body) {
    if (!isSupportTicketStatus(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 })
    }
    update.status = body.status
  }
  if ('priority' in body) {
    if (!isSupportTicketPriority(body.priority)) {
      return NextResponse.json({ error: 'invalid priority' }, { status: 400 })
    }
    update.priority = body.priority
  }
  if ('category' in body) {
    if (!isSupportTicketCategory(body.category)) {
      return NextResponse.json({ error: 'invalid category' }, { status: 400 })
    }
    update.category = body.category
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { data: ticket, error } = await ctx.serviceClient
    .from('support_tickets')
    .update(update)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

  if ('status' in update) {
    await AuditService.record({
      eventType: AuditEventType.SUPPORT_TICKET_STATUS_CHANGED,
      accountId: ticket.account_id,
      actorUserId: ctx.userId,
      metadata: { ticket_id: id, status: update.status },
    })
  }

  return NextResponse.json({ ticket })
}
