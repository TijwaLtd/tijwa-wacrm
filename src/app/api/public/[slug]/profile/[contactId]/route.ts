// ============================================================
// /api/public/[slug]/profile/[contactId] — unauthenticated
// customer profile form API (capability URL: slug + contact UUID).
//
// GET    → account branding + contact fields for the form
// PATCH  → update name/email (+ optional phone); marks
//          profile_completed_at once name AND email are present.
//
// Every query is account-scoped first — a wrong slug can never
// reach another tenant's contact.
// ============================================================

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AuditService } from '@/lib/audit/service'
import { AuditEventType } from '@/lib/audit/events'
import { encryptPhi } from '@/lib/security/phi'
import {
  resolveAccountBySlug,
  resolveContact,
  isValidEmail,
} from '@/lib/public/customer'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'

interface Params {
  params: Promise<{ slug: string; contactId: string }>
}

function clientIp(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'
}

export async function GET(request: Request, { params }: Params) {
  const limit = checkRateLimit(`publicForm:${clientIp(request)}`, RATE_LIMITS.publicForm)
  if (!limit.success) return rateLimitResponse(limit)

  const { slug, contactId } = await params
  const account = await resolveAccountBySlug(slug)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const contact = await resolveContact(account.id, contactId)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // HIPAA carve-out — surface the flag so the form can show the optional
  // (encrypted-at-rest) health-notes field. Never returns the notes value.
  const db = createAdminClient()
  const { data: tenantSettings } = await db
    .from('tenant_settings')
    .select('hipaa_mode')
    .eq('account_id', account.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    account: {
      name: account.display_name || account.name,
      logo_url: account.logo_url,
    },
    contact: {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      profile_completed: !!contact.profile_completed_at,
      consent_accepted: !!contact.consent_tos_version,
    },
    hipaa_mode: tenantSettings?.hipaa_mode === true,
  })
}

export async function PATCH(request: Request, { params }: Params) {
  const limit = checkRateLimit(`publicForm:${clientIp(request)}`, RATE_LIMITS.publicForm)
  if (!limit.success) return rateLimitResponse(limit)

  const { slug, contactId } = await params
  const account = await resolveAccountBySlug(slug)
  if (!account) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const contact = await resolveContact(account.id, contactId)
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : contact.name
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : contact.email
  const bodyPhone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 30) : ''
  // contacts.phone is NOT NULL — never blank it, fall back to current value.
  const phone = bodyPhone || contact.phone || ''

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (email && !isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const profileCompleted = !!(name && email)
  const db = createAdminClient()

  // Optional health notes (HIPAA carve-out) — encrypted at rest with
  // AES-256-GCM before storage. An empty string clears the field. This
  // value is never returned to the client and never sent over WhatsApp.
  const healthNotes =
    typeof body.health_notes === 'string' ? body.health_notes.trim().slice(0, 2000) : null
  const phiUpdate: Record<string, unknown> = {}
  if (healthNotes !== null && healthNotes !== '') {
    phiUpdate.phi_notes_encrypted = encryptPhi(healthNotes)
  } else if (body.health_notes === '') {
    phiUpdate.phi_notes_encrypted = null
  }

  const { error } = await db
    .from('contacts')
    .update({
      name,
      email: email || null,
      phone: phone || null,
      ...phiUpdate,
      ...(profileCompleted ? { profile_completed_at: new Date().toISOString() } : {}),
    })
    .eq('account_id', account.id)
    .eq('id', contactId)

  if (error) {
    console.error('[public profile] update error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  try {
    await AuditService.record({
      eventType: AuditEventType.CONTACT_UPDATED,
      accountId: account.id,
      actorUserId: account.owner_user_id,
      contactId,
      metadata: {
        initiator: 'contact_form',
        fields: phiUpdate.phi_notes_encrypted
          ? ['name', 'email', 'phone', 'health_notes']
          : ['name', 'email', 'phone'],
      },
    })
  } catch (auditErr) {
    console.error('[public profile] audit error:', auditErr)
  }

  return NextResponse.json({ ok: true, profile_completed: profileCompleted })
}
