import { describe, expect, it } from 'vitest'
import {
  computeDelta,
  fillDailySeries,
  formatDuration,
  formatPeriodLabel,
  periodWindow,
  startOfUtcDay,
  toKpi,
} from './period'

const NOW = new Date('2026-10-07T15:30:00Z')

describe('periodWindow', () => {
  it('weekly: last 7 complete days ending yesterday', () => {
    const w = periodWindow('weekly', NOW)
    expect(w.to.toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(w.from.toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(w.prevTo.toISOString()).toBe('2026-09-30T00:00:00.000Z')
    expect(w.prevFrom.toISOString()).toBe('2026-09-23T00:00:00.000Z')
  })

  it('monthly: last 30 complete days ending yesterday', () => {
    const w = periodWindow('monthly', NOW)
    expect(w.to.toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(w.from.toISOString()).toBe('2026-09-07T00:00:00.000Z')
  })

  it('daily: today so far', () => {
    const w = periodWindow('daily', NOW)
    expect(w.from.toISOString()).toBe('2026-10-07T00:00:00.000Z')
    expect(w.to.toISOString()).toBe(NOW.toISOString())
  })

  it('custom: uses provided window and mirrors previous', () => {
    const from = new Date('2026-01-01T00:00:00Z')
    const to = new Date('2026-01-08T00:00:00Z')
    const w = periodWindow('custom', NOW, { from, to })
    expect(w.from).toBe(from)
    expect(w.to).toBe(to)
    expect(w.prevFrom.toISOString()).toBe('2025-12-25T00:00:00.000Z')
    expect(w.prevTo).toBe(from)
  })
})

describe('computeDelta', () => {
  it('positive change', () => {
    expect(computeDelta(150, 100)).toBe(50)
  })
  it('negative change', () => {
    expect(computeDelta(50, 100)).toBe(-50)
  })
  it('null when no baseline', () => {
    expect(computeDelta(10, 0)).toBeNull()
  })
  it('rounds to 1 decimal', () => {
    expect(computeDelta(1, 3)).toBe(-66.7)
  })
})

describe('toKpi', () => {
  it('shapes current/previous/delta', () => {
    expect(toKpi(12, 10)).toEqual({ current: 12, previous: 10, deltaPct: 20 })
  })
  it('treats null as zero', () => {
    expect(toKpi(null, undefined)).toEqual({ current: 0, previous: 0, deltaPct: null })
  })
})

describe('fillDailySeries', () => {
  it('fills gaps between from and to with empty points', () => {
    const from = new Date('2026-10-01T00:00:00Z')
    const to = new Date('2026-10-05T00:00:00Z') // exclusive → last day = Oct 4
    const filled = fillDailySeries(
      [{ day: '2026-10-02', value: 5 }],
      from,
      to,
      (day) => ({ day, value: 0 }),
    )
    expect(filled.map((p) => p.day)).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
    expect(filled[0].value).toBe(0)
    expect(filled[1].value).toBe(5)
    expect(filled[3].value).toBe(0)
  })
})

describe('formatPeriodLabel', () => {
  it('weekly same-year range', () => {
    const w = periodWindow('weekly', NOW)
    expect(formatPeriodLabel('weekly', w.from, w.to)).toBe('Sep 30 – Oct 6, 2026')
  })
  it('daily label mentions today', () => {
    const w = periodWindow('daily', NOW)
    expect(formatPeriodLabel('daily', w.from, w.to)).toContain('Oct 7, 2026')
  })
})

describe('formatDuration', () => {
  it('m:ss', () => {
    expect(formatDuration(65)).toBe('1:05')
  })
  it('hours', () => {
    expect(formatDuration(3720)).toBe('1h 2m')
  })
  it('invalid → dash', () => {
    expect(formatDuration(NaN)).toBe('—')
  })
})

describe('startOfUtcDay', () => {
  it('zeroes time in UTC', () => {
    expect(startOfUtcDay(new Date('2026-10-07T15:30:00Z')).toISOString()).toBe(
      '2026-10-07T00:00:00.000Z',
    )
  })
})
