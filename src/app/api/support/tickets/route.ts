import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'
import { generateTrackingId } from '@/lib/support/tracking-id'
import {
  isSupportTicketCategory,
  type SupportTicketCategory,
} from '@/lib/support/types'

// Support tickets raised by workspace members about the product
// itself. GET lists the caller account's tickets (RLS-scoped user
// client); POST creates one — open to ANY member including viewers,
// because billing/access problems hit viewers too. The tracking id
// is generated here (never from the client).

const MAX_CREATE_ATTEMPTS = 3

export async function GET(request: Request) {
  try {
    const { supabase } = await getCurrentAccount()

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

    // RLS (support_tickets_select_member) scopes to the caller's account.
    let query = supabase
      .from('support_tickets')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (status) query = query.eq('status', status)

    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ tickets: data ?? [], total: count ?? 0, limit, offset })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await getCurrentAccount()
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  const category: SupportTicketCategory = isSupportTicketCategory(body.category)
    ? body.category
    : 'question'

  if (subject.length < 3) {
    return NextResponse.json({ error: 'subject must be at least 3 characters' }, { status: 400 })
  }
  if (subject.length > 200) {
    return NextResponse.json({ error: 'subject must be at most 200 characters' }, { status: 400 })
  }
  if (text.length < 10) {
    return NextResponse.json({ error: 'body must be at least 10 characters' }, { status: 400 })
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: 'body must be at most 5000 characters' }, { status: 400 })
  }

  // Collision-retried tracking id: a UNIQUE clash is astronomically
  // unlikely but must never surface as a 500 to the user.
  let ticket = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const { data, error } = await supabaseAdmin()
      .from('support_tickets')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        tracking_id: generateTrackingId(),
        subject,
        body: text,
        category,
      })
      .select()
      .single()
    if (!error) {
      ticket = data
      break
    }
    lastError = error
    if (error.code !== '23505') break // not a unique violation — retrying is pointless
  }

  if (!ticket) {
    const message = lastError instanceof Error ? lastError.message : 'Failed to create ticket'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  await AuditService.record({
    eventType: AuditEventType.SUPPORT_TICKET_CREATED,
    accountId: ctx.accountId,
    actorUserId: ctx.userId,
    metadata: { ticket_id: ticket.id, tracking_id: ticket.tracking_id, category },
  })

  return NextResponse.json({ ticket }, { status: 201 })
}
