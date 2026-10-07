import { describe, it, expect } from 'vitest'
import {
  clampTitle,
  clampBody,
  formatPriceLabel,
  buildListRow,
  clampListSection,
  listCtaFor,
  LIST_ROW_TITLE_MAX,
  LIST_ROW_DESC_MAX,
  LIST_ROWS_MAX,
  LIST_BODY_MAX,
} from './list-format'

describe('clampTitle', () => {
  it('keeps short titles as-is', () => {
    expect(clampTitle('Billionaire 500 WP')).toBe('Billionaire 500 WP')
  })

  it('collapses whitespace', () => {
    expect(clampTitle('  4BR   Maisonette \n ')).toBe('4BR Maisonette')
  })

  it('truncates to 24 chars with ellipsis (Meta cap)', () => {
    const out = clampTitle('Classic Cotton T-Shirt With Long Brand Name')
    expect(out.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('clampBody', () => {
  it('preserves newlines but caps at 1024', () => {
    const out = clampBody('line\n'.repeat(400))
    expect(out.length).toBeLessThanOrEqual(LIST_BODY_MAX)
    expect(out).toContain('\n')
  })
})

describe('formatPriceLabel', () => {
  it('formats with thousands separator', () => {
    expect(formatPriceLabel('KES', 12500000)).toBe('KES 12,500,000')
  })

  it('appends a suffix when provided', () => {
    expect(formatPriceLabel('KES', 4500, 'night')).toBe('KES 4,500/night')
  })

  it('returns Price on request for null/undefined (agriculture contact-for-price)', () => {
    expect(formatPriceLabel('KES', null)).toBe('Price on request')
    expect(formatPriceLabel('KES', undefined)).toBe('Price on request')
    expect(formatPriceLabel(null, null)).toBe('Price on request')
  })

  it('never renders "KES null"', () => {
    expect(formatPriceLabel('KES', null)).not.toContain('null')
  })
})

describe('buildListRow', () => {
  it('puts the name in the title and price/details in the description', () => {
    const row = buildListRow('property_select_x_1', '2BR Apartment Kilimani', ['KES 45,000', 'rent', '2 bed'])
    expect(row.title.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX)
    expect(row.description).toBe('KES 45,000 · rent · 2 bed')
    expect(row.description!.length).toBeLessThanOrEqual(LIST_ROW_DESC_MAX)
  })

  it('clamps a long name in the title', () => {
    const row = buildListRow('id', '4BR Maisonette — Lavington — KES 12,500,000', ['KES 12,500,000'])
    expect(row.title.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX)
    expect(row.title).not.toContain('KES 12,500,000')
  })

  it('clamps a long description to 72 chars', () => {
    const row = buildListRow('id', 'Item', ['x'.repeat(200)])
    expect(row.description!.length).toBeLessThanOrEqual(LIST_ROW_DESC_MAX)
  })

  it('skips empty description parts', () => {
    const row = buildListRow('id', 'Item', [null, undefined, ''])
    expect(row.description).toBeUndefined()
  })
})

describe('clampListSection', () => {
  it('returns null for empty/missing sections', () => {
    expect(clampListSection(null)).toBeNull()
    expect(clampListSection({ rows: [] })).toBeNull()
    expect(clampListSection(undefined)).toBeNull()
  })

  it('clamps oversized rows that would make sendInteractiveList throw', () => {
    const section = clampListSection({
      title: 'Properties',
      rows: [{ id: 'property_select_1_1', title: '4BR Maisonette — Lavington — KES 12,500,000', description: 'A very long description '.repeat(10) }],
    })!
    expect(section.rows[0].title.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX)
    expect(section.rows[0].description!.length).toBeLessThanOrEqual(LIST_ROW_DESC_MAX)
  })

  it('drops duplicate row ids', () => {
    const section = clampListSection({
      rows: [
        { id: 'a', title: 'One' },
        { id: 'a', title: 'One again' },
        { id: 'b', title: 'Two' },
      ],
    })!
    expect(section.rows).toHaveLength(2)
  })

  it('caps at 10 rows (Meta total limit)', () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }))
    const section = clampListSection({ rows })!
    expect(section.rows).toHaveLength(LIST_ROWS_MAX)
  })

  it('drops rows with empty titles', () => {
    const section = clampListSection({
      rows: [
        { id: 'a', title: '   ' },
        { id: 'b', title: 'Valid' },
      ],
    })!
    expect(section.rows).toHaveLength(1)
    expect(section.rows[0].id).toBe('b')
  })
})

describe('listCtaFor', () => {
  const cta = (id: string) => listCtaFor({ rows: [{ id, title: 'x' }] })

  it('property lists get property wording', () => {
    const out = cta('property_select_abc_1')
    expect(out.buttonLabel).toBe('View Properties')
    expect(out.fallbackBody).toContain('viewing')
  })

  it('product lists get browse wording', () => {
    expect(cta('product_add_abc_100').buttonLabel).toBe('Browse Products')
    expect(cta('price_enquire_abc').buttonLabel).toBe('Browse Products')
  })

  it('menu lists get menu wording', () => {
    expect(cta('menu_add_abc_500').buttonLabel).toBe('View Menu')
  })

  it('unknown prefixes fall back to generic wording', () => {
    expect(cta('offering_select_abc').buttonLabel).toBe('View Options')
  })
})

describe('realistic rows fit Meta caps', () => {
  it('a seeded property row passes all limits', () => {
    const row = buildListRow(
      'property_select_0d4d5e69-46b7-4224-963b-4ce627128d11_12500000',
      '4BR Maisonette With Garden — Lavington',
      ['KES 12,500,000', 'sale', '4 bed', 'Lavington'],
    )
    const section = clampListSection({ title: 'Properties', rows: [row] })!
    const rows = section.rows
    expect(rows[0].title.length).toBeLessThanOrEqual(LIST_ROW_TITLE_MAX)
    expect(rows[0].description!.length).toBeLessThanOrEqual(LIST_ROW_DESC_MAX)
  })

  it('an agriculture contact-for-price row has no null price', () => {
    const row = buildListRow('price_enquire_x', 'Billionaire 500 WP', [formatPriceLabel('KES', null), 'Insecticide'])
    expect(row.title).toBe('Billionaire 500 WP')
    expect(row.description).toContain('Price on request')
    expect(row.description).not.toContain('null')
  })
})
