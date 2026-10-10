// ============================================================
// Report types — shared by the metrics engine, PDF renderer and
// the /reports page. One ReportBundle is the single source of
// truth for a generated report (emailed or viewed in-app).
// ============================================================

export type ReportPeriodKind = 'weekly' | 'monthly' | 'daily' | 'custom'

export type ReportFamily =
  | 'commerce'
  | 'food'
  | 'hospitality'
  | 'property'
  | 'ngo'
  | 'services'

export type KpiFormat = 'number' | 'currency' | 'percent' | 'duration'

/** Current vs previous period value + percent delta (null when previous is 0). */
export interface KpiValue {
  current: number
  previous: number
  deltaPct: number | null
}

export interface DailyPoint {
  day: string // YYYY-MM-DD (UTC)
  value: number
}

export interface ChatDailyPoint {
  day: string
  incoming: number
  outgoing: number
}

export interface ChatMetrics {
  incoming: KpiValue
  outgoing: KpiValue
  botReplies: KpiValue
  humanReplies: KpiValue
  conversationsOpened: KpiValue
  conversationsClosed: KpiValue
  firstResponseAvgSeconds: KpiValue
  /** bot replies as % of all replies in the period (0-100) */
  botSharePct: number
  daily: ChatDailyPoint[]
}

export interface NamedItemMetric {
  name: string
  quantity: number
  revenue: number
}

export interface CommerceDeepDive {
  family: 'commerce'
  orders: KpiValue
  revenue: KpiValue
  aov: KpiValue
  itemsSold: KpiValue
  awaitingConfirmation: KpiValue
  cancellations: KpiValue
  pendingInquiries: KpiValue
  repeatOrderPct: KpiValue
  topItems: NamedItemMetric[]
  daily: DailyPoint[]
}

export interface FoodDeepDive {
  family: 'food'
  orders: KpiValue
  revenue: KpiValue
  avgTicket: KpiValue
  reservations: KpiValue
  pendingInquiries: KpiValue
  topItems: NamedItemMetric[]
  peakHours: { hour: number; orders: number }[]
  daily: DailyPoint[]
}

export interface HospitalityDeepDive {
  family: 'hospitality'
  bookings: KpiValue
  revenue: KpiValue
  roomNights: KpiValue
  adr: KpiValue
  occupancyPct: KpiValue
  cancellations: KpiValue
  pendingInquiries: KpiValue
  daily: DailyPoint[]
}

export interface PropertyDeepDive {
  family: 'property'
  newInquiries: KpiValue
  convertedInquiries: KpiValue
  viewings: KpiValue
  offers: KpiValue
  activeListings: KpiValue
  daily: DailyPoint[]
}

export interface NgoDeepDive {
  family: 'ngo'
  applications: KpiValue
  approvedApplications: KpiValue
  enrollments: KpiValue
  donations: KpiValue
  donationAmount: KpiValue
  activePrograms: KpiValue
  daily: DailyPoint[]
}

export interface ServicesDeepDive {
  family: 'services'
  bookings: KpiValue
  revenue: KpiValue
  pendingInquiries: KpiValue
  topItems: NamedItemMetric[]
  daily: DailyPoint[]
}

export type DeepDive =
  | CommerceDeepDive
  | FoodDeepDive
  | HospitalityDeepDive
  | PropertyDeepDive
  | NgoDeepDive
  | ServicesDeepDive

export interface HeadlineKpi {
  label: string
  value: KpiValue
  format: KpiFormat
}

export interface ReportPeriodInfo {
  kind: ReportPeriodKind
  from: string // ISO instant (inclusive)
  to: string // ISO instant (exclusive)
  label: string
}

export interface ReportBundle {
  accountId: string
  businessName: string
  businessType: string
  family: ReportFamily
  currency: string
  accentColor: string | null
  period: ReportPeriodInfo
  chat: ChatMetrics
  deepDive: DeepDive | null
  headlineKpis: HeadlineKpi[]
  generatedAt: string
}

/** Raw shape returned by every report_* RPC. */
export interface ReportRpcResult {
  current: Record<string, number>
  previous: Record<string, number>
  daily?: DailyPoint[] | ChatDailyPoint[]
  top_items?: NamedItemMetric[]
  top_services?: NamedItemMetric[]
  peak_hours?: { hour: number; orders: number }[]
}
