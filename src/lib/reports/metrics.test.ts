import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildReportBundle, deltaLabel, formatKpiValue } from './metrics'

const ACCOUNT_ID = 'acct-1'
const NOW = new Date('2026-10-07T15:30:00Z')

function makeDb(opts: {
  businessType?: string
  chat?: Record<string, unknown>
  commerce?: Record<string, unknown>
} = {}): SupabaseClient {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'report_chat_metrics') {
      return {
        data: opts.chat ?? {
          current: {
            incoming: 120,
            outgoing: 100,
            bot_replies: 70,
            human_replies: 30,
            conversations_opened: 40,
            conversations_closed: 30,
            first_response_avg_seconds: 65,
          },
          previous: {
            incoming: 100,
            outgoing: 90,
            bot_replies: 50,
            human_replies: 40,
            conversations_opened: 35,
            conversations_closed: 20,
            first_response_avg_seconds: 90,
          },
          daily: [{ day: '2026-10-01', incoming: 10, outgoing: 8 }],
        },
        error: null,
      }
    }
    if (fn === 'report_commerce_metrics') {
      return {
        data: opts.commerce ?? {
          current: {
            orders: 25,
            revenue: 5000,
            aov: 200,
            items_sold: 80,
            awaiting_confirmation: 3,
            cancellations: 1,
            pending_inquiries: 12,
            repeat_order_pct: 40,
          },
          previous: {
            orders: 20,
            revenue: 4000,
            aov: 200,
            items_sold: 60,
            awaiting_confirmation: 2,
            cancellations: 0,
            pending_inquiries: 8,
            repeat_order_pct: 30,
          },
          top_items: [{ name: 'Maize 2kg', quantity: 40, revenue: 2000 }],
          daily: [{ day: '2026-10-01', orders: 3, revenue: 600 }],
        },
        error: null,
      }
    }
    return { data: {}, error: null }
  })

  const from = vi.fn((table: string) => {
    if (table === 'accounts') {
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                id: ACCOUNT_ID,
                name: 'Acme Traders',
                business_type: opts.businessType ?? 'retailer',
                default_currency: 'KES',
              },
              error: null,
            }),
          }),
        }),
      }
    }
    if (table === 'tenant_settings') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { accent_color: '#123456' }, error: null }),
          }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })

  return { from, rpc } as unknown as SupabaseClient
}

describe('buildReportBundle', () => {
  it('assembles bundle with commerce headline KPIs and deltas', async () => {
    const bundle = await buildReportBundle(makeDb(), ACCOUNT_ID, {
      kind: 'weekly',
      now: NOW,
    })

    expect(bundle.businessName).toBe('Acme Traders')
    expect(bundle.family).toBe('commerce')
    expect(bundle.currency).toBe('KES')
    expect(bundle.accentColor).toBe('#123456')
    expect(bundle.period.kind).toBe('weekly')
    expect(bundle.period.from).toBe('2026-09-30T00:00:00.000Z')

    // Chat KPIs
    expect(bundle.chat.incoming).toEqual({ current: 120, previous: 100, deltaPct: 20 })
    expect(bundle.chat.botSharePct).toBe(70)

    // Deep dive
    expect(bundle.deepDive?.family).toBe('commerce')
    if (bundle.deepDive?.family === 'commerce') {
      expect(bundle.deepDive.orders.deltaPct).toBe(25)
      expect(bundle.deepDive.revenue.deltaPct).toBe(25)
      // daily filled: Sep 30 .. Oct 6 (7 days), only Oct 1 has data
      expect(bundle.deepDive.daily).toHaveLength(7)
      expect(bundle.deepDive.daily.find((d) => d.day === '2026-10-01')?.value).toBe(3)
      expect(bundle.deepDive.daily.find((d) => d.day === '2026-10-02')?.value).toBe(0)
      expect(bundle.deepDive.topItems[0]?.name).toBe('Maize 2kg')
    }

    // Headline strip includes universal + commerce KPIs
    const labels = bundle.headlineKpis.map((k) => k.label)
    expect(labels).toContain('New conversations')
    expect(labels).toContain('Revenue')
    expect(labels).toContain('Order inquiries')
    expect(labels).toContain('Avg first response')
  })

  it('maps business types to families', async () => {
    const cases: [string, string][] = [
      ['hotel', 'hospitality'],
      ['restaurant', 'food'],
      ['ngo_nonprofit', 'ngo'],
      ['property_real_estate', 'property'],
      ['service_business', 'services'],
      ['unknown_thing', 'commerce'],
    ]
    for (const [bt, family] of cases) {
      const bundle = await buildReportBundle(makeDb({ businessType: bt }), ACCOUNT_ID, {
        kind: 'daily',
        now: NOW,
      })
      expect(bundle.family).toBe(family)
    }
  })

  it('throws on missing account', async () => {
    const db = {
      from: (table: string) => {
        if (table === 'accounts') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: { message: 'not found' } }),
              }),
            }),
          }
        }
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: {}, error: null }) }),
          }),
        }
      },
      rpc: async () => ({ data: {}, error: null }),
    } as unknown as SupabaseClient
    await expect(
      buildReportBundle(db, ACCOUNT_ID, { kind: 'weekly', now: NOW }),
    ).rejects.toThrow(/account lookup failed/)
  })
})

describe('format helpers', () => {
  it('formatKpiValue currency KES', () => {
    expect(formatKpiValue({ current: 5000 }, 'currency', 'KES')).toBe('KSh5,000')
    expect(formatKpiValue({ current: 2_500_000 }, 'currency', 'KES')).toBe('KSh2.5M')
  })
  it('formatKpiValue duration', () => {
    expect(formatKpiValue({ current: 65 }, 'duration', 'KES')).toBe('1:05')
  })
  it('deltaLabel', () => {
    expect(deltaLabel(null)).toBe('new')
    expect(deltaLabel(0)).toBe('±0%')
    expect(deltaLabel(12.5)).toBe('+12.5%')
    expect(deltaLabel(-8)).toBe('-8%')
  })
})
