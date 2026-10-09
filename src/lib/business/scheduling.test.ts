import { describe, it, expect } from 'vitest'
import {
  SCHEDULE_MAX_ROWS,
  attachScheduleContext,
  contextSlotId,
  parseContextSlotId,
  parseStayLengthId,
  stayLengthId,
  stayLengthSection,
  SCHEDULE_SLOTS,
  buildScheduleListSection,
  formatSlotLabel,
  isFutureDate,
  isFutureSlot,
  parseScheduleSlotId,
  scheduleSlotId,
} from './scheduling'
import { listCtaFor } from '@/lib/ai/tools/list-format'

const NOW = new Date('2026-10-07T09:00:00') // Wednesday

describe('scheduleSlotId / parseScheduleSlotId', () => {
  it('round-trips date + time', () => {
    const id = scheduleSlotId('2026-10-12', '10:00')
    expect(id).toBe('slot_2026-10-12_1000')
    expect(parseScheduleSlotId(id)).toEqual({ date: '2026-10-12', time: '10:00' })
  })

  it('round-trips date-only rows', () => {
    expect(parseScheduleSlotId(scheduleSlotId('2026-10-12'))).toEqual({ date: '2026-10-12', time: null })
  })

  it('rejects foreign ids', () => {
    expect(parseScheduleSlotId('product_add_x_10')).toBeNull()
  })
})

describe('formatSlotLabel', () => {
  it('is the day, date and time the customer taps', () => {
    expect(formatSlotLabel('2026-10-12', '10:00')).toBe('Mon 12 Oct · 10:00')
    expect(formatSlotLabel('2026-10-12')).toBe('Mon 12 Oct')
  })
})

describe('future checks', () => {
  it('accepts future dates and slots only', () => {
    expect(isFutureDate('2026-10-08', NOW)).toBe(true)
    expect(isFutureDate('2026-10-07', NOW)).toBe(true) // today
    expect(isFutureDate('2026-10-06', NOW)).toBe(false)
    expect(isFutureSlot('2026-10-07', '10:00', NOW)).toBe(true)
    expect(isFutureSlot('2026-10-07', '08:00', NOW)).toBe(false) // today, past
    expect(isFutureSlot('2026-10-06', '23:00', NOW)).toBe(false)
  })
})

describe('buildScheduleListSection', () => {
  it('returns day/date/time rows within Meta limits, past times skipped', () => {
    const { response, list_section } = buildScheduleListSection({ now: NOW })
    expect(list_section).not.toBeNull()
    const rows = list_section!.rows
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThanOrEqual(SCHEDULE_MAX_ROWS)
    expect(rows[0].title).toMatch(/^[A-Za-z]{3} \d{1,2} [A-Za-z]{3} · \d{2}:\d{2}$/)
    for (const row of rows) {
      const parsed = parseScheduleSlotId(row.id)
      expect(parsed).not.toBeNull()
      expect(isFutureSlot(parsed!.date, parsed!.time, NOW)).toBe(true)
      expect(row.title.length).toBeLessThanOrEqual(24)
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
    expect(response).toContain('Next week')
  })

  it('page=1 jumps a week ahead', () => {
    const page0 = buildScheduleListSection({ now: NOW })
    const page1 = buildScheduleListSection({ now: NOW, page: 1 })
    expect(page1.list_section!.rows[0].id).toContain('2026-10-14') // 07 + 7
    expect(page0.list_section!.rows[0].id).not.toContain('2026-10-14')
  })

  it('mode=dates returns one row per day, no times', () => {
    const { list_section } = buildScheduleListSection({ mode: 'dates', now: NOW })
    for (const row of list_section!.rows) {
      expect(row.title).not.toContain('·')
      expect(row.id.split('_')).toHaveLength(2)
    }
  })

  it('a specific date shows only that day', () => {
    const { list_section } = buildScheduleListSection({ date: '2026-10-20', now: NOW })
    for (const row of list_section!.rows) {
      expect(row.id).toContain('slot_2026-10-20')
    }
  })

  it('never offers past slots', () => {
    const lateNow = new Date('2026-10-07T18:00:00') // after every default slot
    const { list_section } = buildScheduleListSection({ now: lateNow })
    for (const row of list_section!.rows) {
      const parsed = parseScheduleSlotId(row.id)!
      expect(isFutureSlot(parsed.date, parsed.time, lateNow)).toBe(true)
    }
  })

  it('honours a custom slot set', () => {
    const { list_section } = buildScheduleListSection({ slots: ['11:00'], now: NOW })
    expect(list_section!.rows[0].title).toContain('11:00')
    expect(SCHEDULE_SLOTS).toContain('10:00')
  })
})

describe('listCtaFor for schedule rows', () => {
  it('gives the list a Next week button', () => {
    const { list_section } = buildScheduleListSection({ now: NOW })
    const cta = listCtaFor(list_section!)
    expect(cta.buttonLabel).toBe('Next week →')
    expect(cta.fallbackBody).toContain('Next week')
  })
})

describe('direct (no-AI) schedule context ids', () => {
  it('round-trips pending context through a row id', () => {
    const pendingId = 'a384a3f8-0000-4000-8000-000000000001'
    const id = contextSlotId('property', pendingId, '2026-10-12', '10:00')
    expect(id).toBe(`slot_pp_2026-10-12_1000_${pendingId}`)
    expect(parseContextSlotId(id)).toEqual({
      kind: 'property',
      pendingId,
      date: '2026-10-12',
      time: '10:00',
    })
  })

  it('date-only rows (rooms) round-trip with a null time', () => {
    const pendingId = 'a384a3f8-0000-4000-8000-000000000002'
    const id = contextSlotId('room', pendingId, '2026-10-14')
    expect(parseContextSlotId(id)).toEqual({ kind: 'room', pendingId, date: '2026-10-14', time: null })
  })

  it('never mistakes a plain AI slot for a context tap', () => {
    expect(parseContextSlotId('slot_2026-10-12_1000')).toBeNull()
    expect(parseContextSlotId('product_add_x_10')).toBeNull()
  })

  it('attachScheduleContext re-tags every row', () => {
    const pendingId = 'a384a3f8-0000-4000-8000-000000000003'
    const { list_section } = buildScheduleListSection({ now: NOW })
    const tagged = attachScheduleContext(list_section!, 'service', pendingId)
    for (const row of tagged.rows) {
      const parsed = parseContextSlotId(row.id)
      expect(parsed).toMatchObject({ kind: 'service', pendingId })
      expect(parsed!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(tagged.rows.length).toBe(list_section!.rows.length)
  })
})

describe('stay length rows', () => {
  it('round-trips pending + check-in + nights', () => {
    const pendingId = 'a384a3f8-0000-4000-8000-000000000004'
    const id = stayLengthId(pendingId, '2026-10-14', 3)
    expect(parseStayLengthId(id)).toEqual({ pendingId, checkIn: '2026-10-14', nights: 3 })
    expect(parseStayLengthId('slot_pp_2026-10-12_1000_x')).toBeNull()
  })

  it('offers night choices with checkout dates', () => {
    const section = stayLengthSection('a384a3f8-0000-4000-8000-000000000005', '2026-10-14')
    expect(section.rows.length).toBeGreaterThanOrEqual(7)
    expect(section.rows[0].title).toBe('1 night')
    expect(section.rows[0].description).toContain('Thu 15 Oct')
    for (const row of section.rows) expect(parseStayLengthId(row.id)).not.toBeNull()
  })
})
