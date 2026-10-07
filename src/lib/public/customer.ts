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

/** Resolve a tenant slug to its account (with branding) or null. */
export async function resolveAccountBySlug(slug: string): Promise<PublicAccount | null> {
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
}

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

export interface LegalUrls {
  terms: string
  privacy: string
}

/** Versioned legal pages for a tenant. */
export function legalUrls(slug: string): LegalUrls {
  return {
    terms: `${appOrigin()}/${slug}/legal/terms`,
    privacy: `${appOrigin()}/${slug}/legal/privacy`,
  }
}

/** Current Terms/Privacy version recorded on every consent. */
export const CONSENT_VERSION = 'ke-eu-v1'

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)
}
