// ============================================================
// Report PDF document — cover with headline KPIs, conversation
// intelligence page, business-family deep dive, definitions.
// Pure react-pdf; reuses the ReportBundle produced by
// buildReportBundle (or restored from business_reports.metrics).
// ============================================================

import React from 'react'
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer'
import {
  deltaLabel,
  formatKpiValue,
} from '../metrics'
import type {
  DeepDive,
  HeadlineKpi,
  KpiValue,
  ReportBundle,
} from '../types'
import {
  CHART_COLORS,
  HBarChart,
  LineChart,
  StackedBar,
} from './charts'

const accent = (bundle: ReportBundle) => bundle.accentColor || '#2563eb'

const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40 },
  headerBar: { height: 6, marginBottom: 18 },
  brand: { fontSize: 11, color: '#6b7280', marginBottom: 4 },
  h1: { fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  h2: { fontSize: 14, fontWeight: 'bold', color: '#111827', marginTop: 14, marginBottom: 8 },
  h3: { fontSize: 11, fontWeight: 'bold', color: '#111827', marginTop: 10, marginBottom: 6 },
  sub: { fontSize: 10, color: '#6b7280', marginBottom: 14 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 8 },
  kpiCard: {
    width: '32%',
    marginRight: '2%',
    marginBottom: 10,
    padding: 8,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
  },
  kpiLabel: { fontSize: 8, color: '#6b7280', marginBottom: 3 },
  kpiValue: { fontSize: 15, fontWeight: 'bold', color: '#111827', marginBottom: 2 },
  kpiDeltaUp: { fontSize: 8, color: '#059669' },
  kpiDeltaDown: { fontSize: 8, color: '#dc2626' },
  kpiDeltaFlat: { fontSize: 8, color: '#6b7280' },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  stat: { width: '48%', marginRight: '2%', marginBottom: 6 },
  statLabel: { fontSize: 8.5, color: '#6b7280' },
  statValue: { fontSize: 11, fontWeight: 'bold', color: '#111827' },
  defs: {
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: '#e5e7eb',
    fontSize: 7.5,
    color: '#9ca3af',
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    color: '#9ca3af',
  },
})

function DeltaText({ kpi }: { kpi: KpiValue }) {
  const label = deltaLabel(kpi.deltaPct)
  const cls =
    kpi.deltaPct === null || kpi.deltaPct === 0
      ? s.kpiDeltaFlat
      : kpi.deltaPct > 0
        ? s.kpiDeltaUp
        : s.kpiDeltaDown
  return (
    <Text style={cls}>
      {label} vs prev period ({formatKpiValue({ current: kpi.previous }, 'number', 'USD')})
    </Text>
  )
}

function KpiCard({ kpi, currency }: { kpi: HeadlineKpi; currency: string }) {
  return (
    <View style={s.kpiCard} wrap={false}>
      <Text style={s.kpiLabel}>{kpi.label}</Text>
      <Text style={s.kpiValue}>{formatKpiValue(kpi.value, kpi.format, currency)}</Text>
      <DeltaText kpi={kpi.value} />
    </View>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.stat} wrap={false}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  )
}

function PageFooter({ bundle }: { bundle: ReportBundle }) {
  return (
    <View style={s.footer} fixed>
      <Text>{bundle.businessName} · Business report</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
    </View>
  )
}

function dailyLabel(day: string): string {
  // "2026-10-01" → "Oct 1"
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const [, m, d] = day.split('-')
  return `${months[Number(m) - 1]} ${Number(d)}`
}

// ------------------------------------------------------------
// Conversation intelligence page
// ------------------------------------------------------------

function ChatPage({ bundle }: { bundle: ReportBundle }) {
  const { chat, currency } = bundle
  return (
    <Page size="A4" style={s.page}>
      <View style={[s.headerBar, { backgroundColor: accent(bundle) }]} />
      <Text style={s.h2}>Conversation intelligence</Text>
      <Text style={s.sub}>
        What customers said and how the team (and AI) responded · {bundle.period.label}
      </Text>

      <LineChart
        title="Daily messages"
        series={[
          {
            name: 'Received from customers',
            color: CHART_COLORS.primary,
            points: chat.daily.map((d) => ({ label: dailyLabel(d.day), value: d.incoming })),
          },
          {
            name: 'Sent (AI + team)',
            color: CHART_COLORS.accent,
            points: chat.daily.map((d) => ({ label: dailyLabel(d.day), value: d.outgoing })),
          },
        ]}
      />

      <StackedBar
        title="Who replied to customers"
        segments={[
          { label: 'AI bot', value: chat.botReplies.current, color: CHART_COLORS.bot },
          { label: 'Human team', value: chat.humanReplies.current, color: CHART_COLORS.human },
        ]}
      />

      <Text style={s.h3}>Response health</Text>
      <View style={s.statRow}>
        <Stat
          label="Avg first response"
          value={formatKpiValue(chat.firstResponseAvgSeconds, 'duration', currency)}
        />
        <Stat
          label="Bot share of replies"
          value={`${chat.botSharePct}%`}
        />
        <Stat
          label="Conversations opened"
          value={formatKpiValue(chat.conversationsOpened, 'number', currency)}
        />
        <Stat
          label="Conversations closed"
          value={formatKpiValue(chat.conversationsClosed, 'number', currency)}
        />
        <Stat
          label="Messages received"
          value={formatKpiValue(chat.incoming, 'number', currency)}
        />
        <Stat
          label="Messages sent"
          value={formatKpiValue(chat.outgoing, 'number', currency)}
        />
      </View>

      <PageFooter bundle={bundle} />
    </Page>
  )
}

// ------------------------------------------------------------
// Deep dive pages per family
// ------------------------------------------------------------

function DeepDiveStats({ deepDive, currency }: { deepDive: DeepDive; currency: string }) {
  switch (deepDive.family) {
    case 'commerce':
      return (
        <View style={s.statRow}>
          <Stat label="Orders" value={String(deepDive.orders.current)} />
          <Stat label="Revenue" value={formatKpiValue(deepDive.revenue, 'currency', currency)} />
          <Stat label="Avg order value" value={formatKpiValue(deepDive.aov, 'currency', currency)} />
          <Stat label="Items sold" value={String(deepDive.itemsSold.current)} />
          <Stat label="Awaiting confirmation" value={String(deepDive.awaitingConfirmation.current)} />
          <Stat label="Cancellations" value={String(deepDive.cancellations.current)} />
          <Stat label="Order inquiries (chat)" value={String(deepDive.pendingInquiries.current)} />
          <Stat label="Repeat order rate" value={`${deepDive.repeatOrderPct.current}%`} />
        </View>
      )
    case 'food':
      return (
        <View style={s.statRow}>
          <Stat label="Food orders" value={String(deepDive.orders.current)} />
          <Stat label="Revenue" value={formatKpiValue(deepDive.revenue, 'currency', currency)} />
          <Stat label="Avg ticket" value={formatKpiValue(deepDive.avgTicket, 'currency', currency)} />
          <Stat label="Reservations" value={String(deepDive.reservations.current)} />
          <Stat label="Order inquiries (chat)" value={String(deepDive.pendingInquiries.current)} />
        </View>
      )
    case 'hospitality':
      return (
        <View style={s.statRow}>
          <Stat label="Bookings" value={String(deepDive.bookings.current)} />
          <Stat label="Revenue" value={formatKpiValue(deepDive.revenue, 'currency', currency)} />
          <Stat label="Room-nights" value={String(deepDive.roomNights.current)} />
          <Stat label="Avg daily rate" value={formatKpiValue(deepDive.adr, 'currency', currency)} />
          <Stat label="Occupancy" value={`${deepDive.occupancyPct.current}%`} />
          <Stat label="Cancellations" value={String(deepDive.cancellations.current)} />
          <Stat label="Booking inquiries (chat)" value={String(deepDive.pendingInquiries.current)} />
        </View>
      )
    case 'property':
      return (
        <View style={s.statRow}>
          <Stat label="New inquiries" value={String(deepDive.newInquiries.current)} />
          <Stat label="Converted inquiries" value={String(deepDive.convertedInquiries.current)} />
          <Stat label="Viewings" value={String(deepDive.viewings.current)} />
          <Stat label="Offers" value={String(deepDive.offers.current)} />
          <Stat label="Active listings" value={String(deepDive.activeListings.current)} />
        </View>
      )
    case 'ngo':
      return (
        <View style={s.statRow}>
          <Stat label="Applications" value={String(deepDive.applications.current)} />
          <Stat label="Approved" value={String(deepDive.approvedApplications.current)} />
          <Stat label="Enrollments" value={String(deepDive.enrollments.current)} />
          <Stat label="Donations" value={String(deepDive.donations.current)} />
          <Stat
            label="Donation amount"
            value={formatKpiValue(deepDive.donationAmount, 'currency', currency)}
          />
          <Stat label="Active programs" value={String(deepDive.activePrograms.current)} />
        </View>
      )
    case 'services':
      return (
        <View style={s.statRow}>
          <Stat label="Bookings" value={String(deepDive.bookings.current)} />
          <Stat label="Revenue" value={formatKpiValue(deepDive.revenue, 'currency', currency)} />
          <Stat label="Service inquiries (chat)" value={String(deepDive.pendingInquiries.current)} />
        </View>
      )
  }
}

const FAMILY_TITLES: Record<DeepDive['family'], string> = {
  commerce: 'Sales & orders',
  food: 'Kitchen & reservations',
  hospitality: 'Bookings & occupancy',
  property: 'Inquiries & viewings',
  ngo: 'Programs & giving',
  services: 'Bookings & services',
}

function DeepDivePage({ bundle }: { bundle: ReportBundle }) {
  const deepDive = bundle.deepDive
  if (!deepDive) return null
  const currency = bundle.currency

  const dailyKey: 'orders' | 'bookings' | 'applications' =
    deepDive.family === 'hospitality' || deepDive.family === 'services'
      ? 'bookings'
      : deepDive.family === 'ngo'
        ? 'applications'
        : 'orders'

  const dailyValues = deepDive.daily.map((d) => d.value)

  return (
    <Page size="A4" style={s.page}>
      <View style={[s.headerBar, { backgroundColor: accent(bundle) }]} />
      <Text style={s.h2}>{FAMILY_TITLES[deepDive.family]}</Text>
      <Text style={s.sub}>Business-type performance · {bundle.period.label}</Text>

      <DeepDiveStats deepDive={deepDive} currency={currency} />

      <LineChart
        title={`Daily ${dailyKey}`}
        series={[
          {
            name: dailyKey.charAt(0).toUpperCase() + dailyKey.slice(1),
            color: CHART_COLORS.primary,
            points: deepDive.daily.map((d, i) => ({
              label: dailyLabel(d.day),
              value: dailyValues[i] ?? 0,
            })),
          },
        ]}
      />

      {(deepDive.family === 'commerce' || deepDive.family === 'food') &&
        deepDive.topItems.length > 0 && (
          <HBarChart
            title="Top items"
            items={deepDive.topItems.map((i) => ({
              label: i.name,
              value: i.quantity,
              hint: `${i.quantity} sold · ${formatKpiValue({ current: i.revenue }, 'currency', currency)}`,
            }))}
          />
        )}

      {deepDive.family === 'food' && deepDive.peakHours.length > 0 && (
        <HBarChart
          title="Peak order hours (UTC)"
          color={CHART_COLORS.barAlt}
          items={deepDive.peakHours.map((h) => ({
            label: `${String(h.hour).padStart(2, '0')}:00`,
            value: h.orders,
          }))}
        />
      )}

      {deepDive.family === 'services' && deepDive.topItems.length > 0 && (
        <HBarChart
          title="Top services"
          items={deepDive.topItems.map((i) => ({
            label: i.name,
            value: i.quantity,
            hint: `${i.quantity} bookings`,
          }))}
        />
      )}

      <PageFooter bundle={bundle} />
    </Page>
  )
}

// ------------------------------------------------------------
// Cover page
// ------------------------------------------------------------

function CoverPage({ bundle }: { bundle: ReportBundle }) {
  return (
    <Page size="A4" style={s.page}>
      <View style={[s.headerBar, { backgroundColor: accent(bundle) }]} />
      <Text style={s.brand}>{bundle.businessName}</Text>
      <Text style={s.h1}>Business report</Text>
      <Text style={s.sub}>{bundle.period.label}</Text>

      <Text style={s.h3}>Headlines</Text>
      <View style={s.kpiGrid}>
        {bundle.headlineKpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} currency={bundle.currency} />
        ))}
      </View>

      <Text style={s.h3}>At a glance</Text>
      <View style={s.statRow}>
        <Stat label="Conversations opened" value={String(bundle.chat.conversationsOpened.current)} />
        <Stat label="Messages received" value={String(bundle.chat.incoming.current)} />
        <Stat
          label="Avg first response"
          value={formatKpiValue(bundle.chat.firstResponseAvgSeconds, 'duration', bundle.currency)}
        />
        <Stat label="AI share of replies" value={`${bundle.chat.botSharePct}%`} />
      </View>

      <Text style={s.defs}>
        Generated {new Date(bundle.generatedAt).toUTCString()}. Periods are UTC; weekly reports
        cover the last 7 complete days, monthly the last 30. Revenue and totals exclude
        cancelled records. “Order inquiries” counts conversations that started a checkout in
        chat but had not yet converted. Comparisons are against the immediately preceding
        period of equal length.
      </Text>

      <PageFooter bundle={bundle} />
    </Page>
  )
}

// ------------------------------------------------------------
// Document
// ------------------------------------------------------------

export function ReportDocument({ bundle }: { bundle: ReportBundle }) {
  return (
    <Document
      title={`${bundle.businessName} — Business report`}
      author="Tijwa"
      subject={bundle.period.label}
    >
      <CoverPage bundle={bundle} />
      <ChatPage bundle={bundle} />
      <DeepDivePage bundle={bundle} />
    </Document>
  )
}
