import { describe, expect, it } from 'vitest'
import { renderReportPdf, reportPdfFilename } from './render'
import type { ReportBundle } from '../types'

const NOW = new Date('2026-10-07T15:30:00Z')

function fixtureBundle(): ReportBundle {
  return {
    accountId: 'acct-1',
    businessName: 'Acme Traders',
    businessType: 'retailer',
    family: 'commerce',
    currency: 'KES',
    accentColor: '#2563eb',
    period: {
      kind: 'weekly',
      from: '2026-09-30T00:00:00.000Z',
      to: '2026-10-07T00:00:00.000Z',
      label: 'Sep 30 – Oct 6, 2026',
    },
    chat: {
      incoming: { current: 120, previous: 100, deltaPct: 20 },
      outgoing: { current: 100, previous: 90, deltaPct: 11.1 },
      botReplies: { current: 70, previous: 50, deltaPct: 40 },
      humanReplies: { current: 30, previous: 40, deltaPct: -25 },
      conversationsOpened: { current: 40, previous: 35, deltaPct: 14.3 },
      conversationsClosed: { current: 30, previous: 20, deltaPct: 50 },
      firstResponseAvgSeconds: { current: 65, previous: 90, deltaPct: -27.8 },
      botSharePct: 70,
      daily: [
        { day: '2026-10-01', incoming: 10, outgoing: 8 },
        { day: '2026-10-02', incoming: 20, outgoing: 15 },
      ],
    },
    deepDive: {
      family: 'commerce',
      orders: { current: 25, previous: 20, deltaPct: 25 },
      revenue: { current: 5000, previous: 4000, deltaPct: 25 },
      aov: { current: 200, previous: 200, deltaPct: 0 },
      itemsSold: { current: 80, previous: 60, deltaPct: 33.3 },
      awaitingConfirmation: { current: 3, previous: 2, deltaPct: 50 },
      cancellations: { current: 1, previous: 0, deltaPct: null },
      pendingInquiries: { current: 12, previous: 8, deltaPct: 50 },
      repeatOrderPct: { current: 40, previous: 30, deltaPct: 33.3 },
      topItems: [{ name: 'Maize 2kg', quantity: 40, revenue: 2000 }],
      daily: Array.from({ length: 7 }, (_, i) => ({
        day: `2026-10-0${i + 1}`,
        value: i,
      })),
    },
    headlineKpis: [
      { label: 'New conversations', value: { current: 40, previous: 35, deltaPct: 14.3 }, format: 'number' },
      { label: 'Revenue', value: { current: 5000, previous: 4000, deltaPct: 25 }, format: 'currency' },
      { label: 'Avg first response', value: { current: 65, previous: 90, deltaPct: -27.8 }, format: 'duration' },
    ],
    generatedAt: NOW.toISOString(),
  }
}

describe('renderReportPdf', () => {
  it('renders a non-empty PDF buffer', async () => {
    const buffer = await renderReportPdf(fixtureBundle())
    expect(buffer.length).toBeGreaterThan(1000)
    expect(buffer.subarray(0, 5).toString('utf8')).toBe('%PDF-')
  }, 30_000)

  it('filename is slugified', () => {
    expect(reportPdfFilename(fixtureBundle())).toBe(
      'acme-traders-report-weekly-2026-09-30.pdf',
    )
  })
})
