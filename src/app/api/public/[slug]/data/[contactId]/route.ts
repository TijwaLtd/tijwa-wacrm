// ============================================================
// /api/public/[slug]/data/[contactId] — unauthenticated
// data-rights API (capability URL: slug + contact UUID).
//
// GET  → JSON export of everything we hold about this customer
//        (profile, message history, orders, bookings) as a
//        downloadable file — GDPR Art. 15/20 access + portability.
//
// POST → delete request. The LAW decides the mode:
//        • customer has orders/bookings (records a business must
//          retain for tax/accounting law) → ANONYMISE: all PII and
//          message content removed, financial records kept with
//          every personal field stripped → lawful to retain.
//        • nothing that must be retained → FULL ERASE: everything
//          deleted, contact row removed.
//        Returns the mode applied so the page can explain it.
// ============================================================

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'
import { resolveAccountBySlug, resolveContact } from '@/lib/public/customer'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

interface Params {
  params: Promise<{ slug: string; contactId: string }>
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

const PENDING_TABLES = [
  'pending_orders',
  'pending_food_orders',
  'pending_product_orders',
  'pending_service_bookings',
  'pending_property_inquiries',
  'pending_bookings',
  'pending_reservations',
] as const

const PII_METADATA_KEYS = [
  'customer_name',
  'customer_phone',
  'customer_email',
  'guest_name',
  'guest_phone',
  'contact_name',
  'contact_email',
  'contact_phone',
]

function stripPiiMetadata(metadata: unknown): Record<string, unknown> {
  const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>
  const out = { ...meta }
  for (const key of PII_METADATA_KEYS) delete out[key]
  return out
}

// ── GET: export ──────────────────────────────────────────────
export async function GET(request: Request, { params }: Params) {
  const limit = checkRateLimit(`publicForm:${clientIp(request)}`, RATE_LIMITS.publicForm)
  if (!limit.success) return rateLimitResponse(limit)

  const { slug, contactId } = await params
  const account = await resolveAccountBySlug(slug)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const contact = await resolveContact(account.id, contactId)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const db = createAdminClient()

  // Conversations + their messages (inbound + outbound)
  const { data: conversations } = await db
    .from('conversations')
    .select('id, status, created_at, updated_at, messages(id, sender_type, content_type, content_text, created_at)')
    .eq('account_id', account.id)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })

  // Orders + bookings
  const [{ data: orders }, { data: bookings }] = await Promise.all([
    db
      .from('orders')
      .select('id, order_number, status, currency, subtotal, total, notes, metadata, created_at')
      .eq('account_id', account.id)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true }),
    db
      .from('bookings')
      .select('id, booking_number, status, currency, total, start_date, end_date, guests, notes, metadata, created_at')
      .eq('account_id', account.id)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true }),
  ])

  const payload = {
    exported_at: new Date().toISOString(),
    business: account.display_name || account.name,
    profile: {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
    },
    consent: {
      terms_version: contact.consent_tos_version,
    },
    conversations: (conversations || []).map((c) => ({
      status: c.status,
      started_at: c.created_at,
      messages: ((c.messages as Array<Record<string, unknown>>) || []).map((m) => ({
        direction: m.sender_type === 'customer' ? 'you' : m.sender_type,
        type: m.content_type,
        text: m.content_text,
        at: m.created_at,
      })),
    })),
    orders: orders || [],
    bookings: bookings || [],
  }

  try {
    await AuditService.record({
      eventType: AuditEventType.CONTACT_EXPORT_REQUESTED,
      accountId: account.id,
      actorUserId: account.owner_user_id,
      contactId,
      metadata: { initiator: 'contact_form' },
    })
  } catch (auditErr) {
    console.error('[public data export] audit error:', auditErr)
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="my-data-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}

// ── POST: delete (anonymise if law allows, else erase) ───────
export async function POST(request: Request, { params }: Params) {
  const limit = checkRateLimit(`publicForm:${clientIp(request)}`, RATE_LIMITS.publicForm)
  if (!limit.success) return rateLimitResponse(limit)

  const { slug, contactId } = await params
  const account = await resolveAccountBySlug(slug)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const contact = await resolveContact(account.id, contactId)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (body?.action !== 'delete') {
    return NextResponse.json({ error: 'action must be "delete"' }, { status: 400 })
  }

  const db = createAdminClient()

  // Does accounting/tax law force retention? Orders or bookings = yes.
  const [{ count: orderCount }, { count: bookingCount }] = await Promise.all([
    db.from('orders').select('id', { count: 'exact', head: true }).eq('account_id', account.id).eq('contact_id', contactId),
    db.from('bookings').select('id', { count: 'exact', head: true }).eq('account_id', account.id).eq('contact_id', contactId),
  ])
  const mustRetain = (orderCount ?? 0) > 0 || (bookingCount ?? 0) > 0
  const mode: 'anonymised' | 'erased' = mustRetain ? 'anonymised' : 'erased'

  try {
    await AuditService.record({
      eventType: AuditEventType.DATA_DELETION_REQUESTED,
      accountId: account.id,
      actorUserId: account.owner_user_id,
      contactId,
      metadata: { initiator: 'contact_form', decided_mode: mode },
    })
  } catch (auditErr) {
    console.error('[public data delete] audit error:', auditErr)
  }

  // 1. Conversations + messages (message text is personal data)
  await db
    .from('conversations')
    .delete()
    .eq('account_id', account.id)
    .eq('contact_id', contactId)

  // 2. Pending (unconfirmed) drafts containing their details
  for (const table of PENDING_TABLES) {
    const { error } = await db.from(table).delete().eq('account_id', account.id).eq('contact_id', contactId)
    if (error) console.error(`[public data delete] ${table}:`, error.message)
  }

  if (mustRetain) {
    // 3a. Retained financial records — strip every personal field
    const [{ data: orders }, { data: bookings }] = await Promise.all([
      db.from('orders').select('id, metadata, notes').eq('account_id', account.id).eq('contact_id', contactId),
      db.from('bookings').select('id, metadata, notes').eq('account_id', account.id).eq('contact_id', contactId),
    ])
    for (const o of orders || []) {
      await db.from('orders').update({ contact_id: null, metadata: stripPiiMetadata(o.metadata), notes: null }).eq('id', o.id)
    }
    for (const b of bookings || []) {
      await db.from('bookings').update({ contact_id: null, metadata: stripPiiMetadata(b.metadata), notes: null }).eq('id', b.id)
    }

    // 4a. Keep the contact row as an anonymous shell (so the tenant's
    //     lead counts stay truthful) with zero PII. contacts.phone is
    //     NOT NULL, so it becomes an opaque placeholder.
    await db
      .from('contacts')
      .update({
        name: 'Deleted customer',
        email: null,
        phone: `deleted_${contactId}`,
        wa_id: null,
        bsuid: null,
        company: null,
        avatar_url: null,
        anonymised_at: new Date().toISOString(),
        consent_tos_version: null,
        consent_tos_accepted_at: null,
      })
      .eq('account_id', account.id)
      .eq('id', contactId)
  } else {
    // 3b. Nothing must be retained → full erase (conversations already
    //     deleted above; contact row delete cascades anything left).
    const { error } = await db.from('contacts').delete().eq('account_id', account.id).eq('id', contactId)
    if (error) {
      console.error('[public data delete] contact erase error:', error)
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
    }
  }

  try {
    await AuditService.record({
      eventType: AuditEventType.DATA_ANONYMISED,
      accountId: account.id,
      actorUserId: account.owner_user_id,
      metadata: { initiator: 'contact_form', mode },
    })
  } catch (auditErr) {
    console.error('[public data delete] audit error:', auditErr)
  }

  return NextResponse.json({ ok: true, mode })
}
