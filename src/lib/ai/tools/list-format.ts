// Shared formatting for WhatsApp interactive list rows.
// Meta hard-caps: row title 24 chars, row description 72 chars,
// body 1024 chars, button label 20 chars, 10 rows total — exceeding
// any of these makes sendInteractiveList() throw and the reply falls
// back to plain text. Everything that builds list rows must go
// through these helpers.

export const LIST_ROW_TITLE_MAX = 24
export const LIST_ROW_DESC_MAX = 72
export const LIST_BODY_MAX = 1024
export const LIST_ROWS_MAX = 10
export const LIST_BUTTON_LABEL_MAX = 20

/** Collapse whitespace and hard-truncate to fit Meta's cap. */
export function clampTitle(text: string, max = LIST_ROW_TITLE_MAX): string {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).trimEnd() + '…'
}

/** Same as clampTitle but keeps newlines (for list body text). */
export function clampBody(text: string, max = LIST_BODY_MAX): string {
  const clean = String(text ?? '').replace(/\r\n/g, '\n').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).trimEnd() + '…'
}

/** "KES 1,200" / "KES 1,200 per metre" — or "Price on request" when null. */
export function formatPriceLabel(
  currency: string | null | undefined,
  price: number | null | undefined,
  suffix?: string,
): string {
  if (price === null || price === undefined || !Number.isFinite(price)) {
    return 'Price on request'
  }
  const cur = currency || 'KES'
  const amount = Math.round(price).toLocaleString('en-US')
  return suffix ? `${cur} ${amount}/${suffix}` : `${cur} ${amount}`
}

export interface ListRow {
  id: string
  title: string
  description?: string
}

export interface ListSection {
  title?: string
  rows: ListRow[]
}

/** Build a Meta-compliant row: short title (name), details in description. */
export function buildListRow(
  id: string,
  name: string,
  descParts: Array<string | number | null | undefined>,
): ListRow {
  const title = clampTitle(name)
  const desc = clampTitle(
    descParts
      .filter((p) => p !== null && p !== undefined && String(p).length > 0)
      .map(String)
      .join(' · '),
    LIST_ROW_DESC_MAX,
  )
  return desc ? { id, title, description: desc } : { id, title }
}

/** Defensive pass before send: clamp lengths, drop dup/empty ids, cap at 10 rows. */
export function clampListSection(section: ListSection | null | undefined): ListSection | null {
  if (!section || !Array.isArray(section.rows) || section.rows.length === 0) return null
  const seen = new Set<string>()
  const rows: ListRow[] = []
  for (const row of section.rows) {
    if (!row?.id || seen.has(row.id)) continue
    seen.add(row.id)
    const title = clampTitle(row.title || '')
    if (!title) continue
    rows.push(row.description ? { id: row.id, title, description: clampTitle(row.description, LIST_ROW_DESC_MAX) } : { id: row.id, title })
    if (rows.length >= LIST_ROWS_MAX) break
  }
  if (rows.length === 0) return null
  return section.title ? { title: clampTitle(section.title), rows } : { rows }
}

/** CTA wording inferred from the row id prefix (product vs property vs menu…). */
export function listCtaFor(section: ListSection): { buttonLabel: string; fallbackBody: string } {
  const firstId = section.rows[0]?.id || ''
  if (firstId.startsWith('property_select_')) {
    return { buttonLabel: 'View Properties', fallbackBody: 'Tap a property to see details and book a viewing:' }
  }
  if (firstId.startsWith('room_select_')) {
    return { buttonLabel: 'View Rooms', fallbackBody: 'Tap a room to start your booking:' }
  }
  if (firstId.startsWith('menu_add_')) {
    return { buttonLabel: 'View Menu', fallbackBody: 'Tap an item to add it to your order:' }
  }
  if (firstId.startsWith('service_select_')) {
    return { buttonLabel: 'View Services', fallbackBody: 'Tap a service to see details and book:' }
  }
  if (firstId.startsWith('ngo_program_select_') || firstId.startsWith('ngo_course_select_')) {
    return { buttonLabel: 'View Details', fallbackBody: 'Tap a program to see details:' }
  }
  if (firstId.startsWith('product_add_') || firstId.startsWith('price_enquire_')) {
    return { buttonLabel: 'Browse Products', fallbackBody: 'Tap a product for details:' }
  }
  return { buttonLabel: 'View Options', fallbackBody: 'Tap an option below:' }
}
