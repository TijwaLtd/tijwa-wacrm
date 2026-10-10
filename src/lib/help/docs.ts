// ============================================================
// Help documentation loader.
//
// Docs live as markdown with YAML front-matter under content/help/,
// split by locale (content/help/en, content/help/ko). Locale files
// fall back to English so an untranslated page never 404s. Edit the
// markdown — this loader never needs touching.
// ============================================================

import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const CONTENT_ROOT = path.join(process.cwd(), 'content', 'help')

export interface HelpDocFrontmatter {
  title: string
  description: string
  order: number
}

export interface HelpDoc {
  slug: string
  frontmatter: HelpDocFrontmatter
  content: string
}

/** Top-level doc slugs, in the order they appear in the nav/home. */
export const HELP_DOC_SLUGS = [
  'getting-started',
  'business-types',
  'quick-replies',
  'faq',
  'billing-and-plans',
] as const
export type HelpDocSlug = (typeof HELP_DOC_SLUGS)[number]

function readDocFile(localePath: string, slugPath: string): string | null {
  const file = path.join(CONTENT_ROOT, localePath, `${slugPath}.md`)
  if (!fs.existsSync(file)) return null
  return fs.readFileSync(file, 'utf8')
}

function parseDoc(slug: string, raw: string): HelpDoc {
  const { data, content } = matter(raw)
  return {
    slug,
    frontmatter: {
      title: typeof data.title === 'string' ? data.title : slug,
      description: typeof data.description === 'string' ? data.description : '',
      order: typeof data.order === 'number' ? data.order : 99,
    },
    content: content.trim(),
  }
}

/**
 * Load a top-level help doc for the given locale, falling back to
 * English when the locale file doesn't exist yet.
 */
export function loadHelpDoc(slug: string, locale: string): HelpDoc | null {
  const raw = readDocFile(locale, slug) ?? readDocFile('en', slug)
  if (!raw) return null
  return parseDoc(slug, raw)
}

/** All top-level docs for a locale (English fallback applied), ordered. */
export function listHelpDocs(locale: string): HelpDoc[] {
  return HELP_DOC_SLUGS.map((slug) => loadHelpDoc(slug, locale))
    .filter((doc): doc is HelpDoc => doc !== null)
    .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
}

/**
 * The business-types section intro (business-types/_index.md).
 */
export function loadBusinessTypesIntro(locale: string): HelpDoc | null {
  const raw = readDocFile(locale, 'business-types/_index') ?? readDocFile('en', 'business-types/_index')
  if (!raw) return null
  return parseDoc('business-types', raw)
}

/**
 * Optional prose for one business type. Returns null when no file
 * exists — the page then renders the generated capabilities section
 * with only the type's standard label/description.
 */
export function loadBusinessTypeDoc(type: string, locale: string): HelpDoc | null {
  // Guard against path traversal — type must be a plain slug.
  if (!/^[a-z0-9_]+$/.test(type)) return null
  const raw = readDocFile(locale, `business-types/${type}`) ?? readDocFile('en', `business-types/${type}`)
  if (!raw) return null
  return parseDoc(type, raw)
}
