// ============================================================
// Legal document loader.
//
// Tenant docs live under content/legal/ (B2C — business → its
// WhatsApp customers). B2B docs live under content/b2b/legal/
// (Tijwa → business subscribers). Both are markdown with YAML
// front-matter, split by locale, with English fallback.
//
// The loader extracts <h2> headings from the markdown body to build
// the TOC, so section anchors stay in sync with content automatically.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'
import { getLocale } from 'next-intl/server'
import { resolveAccountBySlug, type PublicAccount } from '@/lib/public/customer'

const TENANT_ROOT = path.join(process.cwd(), 'content', 'legal')
const B2B_ROOT = path.join(process.cwd(), 'content', 'b2b', 'legal')

export interface LegalDocFrontmatter {
  title: string
  description: string
  order: number
  version: string
  effective: string
}

export interface LegalSection {
  id: string
  label: string
}

export interface LegalDoc {
  slug: string
  frontmatter: LegalDocFrontmatter
  content: string
  sections: LegalSection[]
}

/** Tenant legal doc slugs (B2C), in nav order. */
export const LEGAL_DOC_SLUGS = ['terms', 'privacy', 'platform'] as const
export type LegalDocSlug = (typeof LEGAL_DOC_SLUGS)[number]

/** B2B legal doc slugs (Tijwa ↔ business), in nav order. */
export const B2B_LEGAL_DOC_SLUGS = ['terms', 'privacy'] as const
export type B2bLegalDocSlug = (typeof B2B_LEGAL_DOC_SLUGS)[number]

/**
 * Current B2B Terms of Service version. Bump when the platform
 * Terms change materially — existing workspaces keep their accepted
 * version until they re-accept.
 */
export const B2B_TERMS_VERSION = 'b2b-v1'

/** Generate a URL-safe id from a heading label. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Extract h2 headings from markdown body for the sidebar TOC. */
function extractSections(content: string): LegalSection[] {
  const sections: LegalSection[] = []
  for (const line of content.split('\n')) {
    const match = line.match(/^##\s+(.+)$/)
    if (match) {
      const label = match[1].trim()
      sections.push({ id: slugifyHeading(label), label })
    }
  }
  return sections
}

function readDocFile(root: string, localePath: string, slug: string): string | null {
  const file = path.join(root, localePath, `${slug}.md`)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

function parseDoc(slug: string, raw: string): LegalDoc {
  const { data, content } = matter(raw)
  const body = content.trim()
  return {
    slug,
    frontmatter: {
      title: typeof data.title === 'string' ? data.title : slug,
      description: typeof data.description === 'string' ? data.description : '',
      order: typeof data.order === 'number' ? data.order : 99,
      version: typeof data.version === 'string' ? data.version : '',
      effective: typeof data.effective === 'string' ? data.effective : '',
    },
    content: body,
    sections: extractSections(body),
  }
}

/**
 * Replace template placeholders in the markdown body.
 * `{{business}}` → business display name; `{{slug}}` → tenant slug.
 */
function interpolate(doc: LegalDoc, businessName: string, slug: string): LegalDoc {
  return {
    ...doc,
    content: doc.content
      .replaceAll('{{business}}', businessName)
      .replaceAll('{{slug}}', slug),
  }
}

// ── Tenant (B2C) docs ──

/**
 * Load a tenant legal doc for the given locale, falling back to
 * English. Returns null when no file exists for any locale.
 */
export function loadLegalDoc(
  slug: string,
  locale: string,
  businessName: string,
  tenantSlug: string,
): LegalDoc | null {
  const raw = readDocFile(TENANT_ROOT, locale, slug) ?? readDocFile(TENANT_ROOT, 'en', slug)
  if (!raw) return null
  return interpolate(parseDoc(slug, raw), businessName, tenantSlug)
}

/** All tenant legal docs for a locale, ordered. */
export function listLegalDocs(
  locale: string,
  businessName: string,
  tenantSlug: string,
): LegalDoc[] {
  return LEGAL_DOC_SLUGS.map((slug) => loadLegalDoc(slug, locale, businessName, tenantSlug))
    .filter((doc): doc is LegalDoc => doc !== null)
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
}

/**
 * Convenience for a tenant legal page: resolve the account (cached
 * across layout + page per request), load the doc for the active
 * locale, or null → page calls notFound().
 */
export async function loadLegalDocForPage(
  slug: string,
  docSlug: string,
): Promise<{ doc: LegalDoc; account: PublicAccount } | null> {
  const account = await resolveAccountBySlug(slug)
  if (!account) return null
  const locale = await getLocale()
  const businessName = account.display_name || account.name
  const doc = loadLegalDoc(docSlug, locale, businessName, slug)
  if (!doc) return null
  return { doc, account }
}

// ── B2B docs (Tijwa ↔ business) ──

/** Load a B2B legal doc for the given locale, English fallback. */
export function loadB2bLegalDoc(slug: string, locale: string): LegalDoc | null {
  const raw = readDocFile(B2B_ROOT, locale, slug) ?? readDocFile(B2B_ROOT, 'en', slug)
  if (!raw) return null
  return parseDoc(slug, raw)
}

/** All B2B legal docs for a locale, ordered. */
export function listB2bLegalDocs(locale: string): LegalDoc[] {
  return B2B_LEGAL_DOC_SLUGS.map((slug) => loadB2bLegalDoc(slug, locale))
    .filter((doc): doc is LegalDoc => doc !== null)
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
}

/** Load a B2B doc for a page (resolves locale internally). */
export async function loadB2bLegalDocForPage(slug: string): Promise<LegalDoc | null> {
  const locale = await getLocale()
  return loadB2bLegalDoc(slug, locale)
}
