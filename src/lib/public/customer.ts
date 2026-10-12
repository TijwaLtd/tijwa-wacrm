// ============================================================
// Public customer-facing helpers (no auth).
//
// Tenant is identified by the account slug (accounts.subdomain) in
// the URL; the customer by their contact UUID. Every query is
// account-scoped FIRST, so a wrong slug + right UUID (or vice
// versa) can never touch another tenant's data.
//
// Used by /api/public/[slug]/* and /[slug]/* pages.
// ============================================================

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'

export const SLUG_RE = /^[a-z0-9-]{2,64}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PublicAccount {
  id: string
  name: string
  subdomain: string
  owner_user_id: string
  logo_url: string | null
  display_name: string | null
}

export interface PublicContact {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  consent_tos_version: string | null
  profile_completed_at: string | null
}

/**
 * Resolve a tenant slug to its account (with branding) or null.
 * Wrapped in React cache() so the legal layout + pages share one
 * DB round-trip per request.
 */
export const resolveAccountBySlug = cache(
  async (slug: string): Promise<PublicAccount | null> => {
    if (!SLUG_RE.test(slug)) return null
    const db = createAdminClient()
    const { data, error } = await db
      .from('accounts')
      .select('id, name, subdomain, owner_user_id')
      .eq('subdomain', slug)
      .maybeSingle()
    if (error || !data) return null

    const { data: settings } = await db
      .from('tenant_settings')
      .select('display_name, logo_url')
      .eq('account_id', data.id)
      .maybeSingle()

    return {
      id: data.id,
      name: data.name,
      subdomain: data.subdomain,
      owner_user_id: data.owner_user_id,
      logo_url: settings?.logo_url || null,
      display_name: settings?.display_name || null,
    }
  },
)

/** Resolve a contact, always scoped to the resolved account. */
export async function resolveContact(accountId: string, contactId: string): Promise<PublicContact | null> {
  if (!UUID_RE.test(contactId)) return null
  const db = createAdminClient()
  const { data, error } = await db
    .from('contacts')
    .select('id, name, email, phone, consent_tos_version, profile_completed_at')
    .eq('account_id', accountId)
    .eq('id', contactId)
    .maybeSingle()
  if (error || !data) return null
  return {
    ...data,
    // Internal bsuid placeholders are never shown or exported.
    phone: data.phone && !data.phone.startsWith('bsuid_') ? data.phone : null,
  }
}

/** Public origin — NEXT_PUBLIC_SITE_URL (no trailing slash). */
export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')
}

/** Profile + data-rights page for a contact at a tenant. */
export function contactFormUrl(slug: string, contactId: string): string {
  return `${appOrigin()}/${slug}/c/${contactId}`
}

export interface PublicBooking {
  id: string
  booking_number: string
  status: string
  start_date: string | null
  end_date: string | null
  total: number | null
  currency: string | null
  service_name: string | null
  contact_name: string | null
  contact_phone: string | null
}

/**
 * Resolve a single booking, always scoped to the account. The id is the
 * booking's UUID (opaque — never the enumerable BK- number), so a link
 * can't be guessed or walked.
 */
export async function resolveBooking(
  accountId: string,
  bookingId: string,
): Promise<PublicBooking | null> {
  if (!UUID_RE.test(bookingId)) return null
  const db = createAdminClient()
  const { data, error } = await db
    .from('bookings')
    .select(
      'id, booking_number, status, start_date, end_date, total, currency, metadata, contact:contacts(name, phone)',
    )
    .eq('account_id', accountId)
    .eq('id', bookingId)
    .maybeSingle()
  if (error || !data) return null

  const meta = (data.metadata || {}) as Record<string, unknown>
  const contact = data.contact as { name?: string | null; phone?: string | null } | null
  const phone = contact?.phone || null
  return {
    id: data.id,
    booking_number: data.booking_number,
    status: data.status,
    start_date: data.start_date,
    end_date: data.end_date,
    total: data.total,
    currency: data.currency,
    service_name:
      (meta.service_name as string) || (meta.offering_name as string) || null,
    contact_name: contact?.name || null,
    // Internal bsuid placeholders are never shown.
    contact_phone: phone && !phone.startsWith('bsuid_') ? phone : null,
  }
}

/** Secure appointment-detail page for a booking at a tenant. */
export function bookingDetailUrl(slug: string, bookingId: string): string {
  return `${appOrigin()}/${slug}/b/${bookingId}`
}

export interface LegalUrls {
  terms: string
  privacy: string
  platform: string
}

/** Versioned legal pages for a tenant. */
export function legalUrls(slug: string): LegalUrls {
  return {
    terms: `${appOrigin()}/${slug}/legal/terms`,
    privacy: `${appOrigin()}/${slug}/legal/privacy`,
    platform: `${appOrigin()}/${slug}/legal/platform`,
  }
}

/** Current Terms/Privacy version recorded on every consent. */
export const CONSENT_VERSION = 'ke-eu-v1'

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}
