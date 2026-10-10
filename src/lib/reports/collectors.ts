// ============================================================
// Collectors — thin wrappers over the report_* RPCs. Each takes
// the Supabase client, account id and a UTC window, and returns
// the shaped DeepDive (or ChatMetrics). All KpiValue deltas are
// computed here from the RPC's current/previous pair.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  toKpi,
  fillDailySeries,
} from './period'
import type {
  ChatMetrics,
  CommerceDeepDive,
  DailyPoint,
  DeepDive,
  FoodDeepDive,
  HospitalityDeepDive,
  NgoDeepDive,
  PropertyDeepDive,
  ReportFamily,
  ReportRpcResult,
  ServicesDeepDive,
} from './types'

type DB = SupabaseClient

export interface CollectorWindow {
  from: Date
  to: Date
}

const EMPTY_DAILY = (day: string): DailyPoint => ({ day, value: 0 })

async function callRpc(
  db: DB,
  fn: string,
  accountId: string,
  win: CollectorWindow,
): Promise<ReportRpcResult> {
  const { data, error } = await db.rpc(fn, {
    p_account_id: accountId,
    p_from: win.from.toISOString(),
    p_to: win.to.toISOString(),
  })
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  return (data ?? {}) as ReportRpcResult
}

function fillCountDaily(
  points: { day: string }[] | undefined,
  win: CollectorWindow,
  key: string,
): DailyPoint[] {
  const sparse = (points ?? []).map((p) => ({
    day: p.day,
    value: Number((p as Record<string, unknown>)[key]) || 0,
  }))
  return fillDailySeries(sparse, win.from, win.to, EMPTY_DAILY)
}

// ------------------------------------------------------------
// Chat (universal)
// ------------------------------------------------------------

export async function collectChatMetrics(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<ChatMetrics> {
  const raw = await callRpc(db, 'report_chat_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  const daily = (raw.daily as ChatMetrics['daily']) ?? []
  const bot = Number(c.bot_replies) || 0
  const human = Number(c.human_replies) || 0
  const totalReplies = bot + human
  return {
    incoming: toKpi(c.incoming, p.incoming),
    outgoing: toKpi(c.outgoing, p.outgoing),
    botReplies: toKpi(c.bot_replies, p.bot_replies),
    humanReplies: toKpi(c.human_replies, p.human_replies),
    conversationsOpened: toKpi(c.conversations_opened, p.conversations_opened),
    conversationsClosed: toKpi(c.conversations_closed, p.conversations_closed),
    firstResponseAvgSeconds: toKpi(c.first_response_avg_seconds, p.first_response_avg_seconds),
    botSharePct: totalReplies === 0 ? 0 : Math.round((bot / totalReplies) * 1000) / 10,
    daily: daily.map((d) => ({
      day: d.day,
      incoming: Number(d.incoming) || 0,
      outgoing: Number(d.outgoing) || 0,
    })),
  }
}

// ------------------------------------------------------------
// Commerce
// ------------------------------------------------------------

export async function collectCommerceDeepDive(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<CommerceDeepDive> {
  const raw = await callRpc(db, 'report_commerce_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  return {
    family: 'commerce',
    orders: toKpi(c.orders, p.orders),
    revenue: toKpi(c.revenue, p.revenue),
    aov: toKpi(c.aov, p.aov),
    itemsSold: toKpi(c.items_sold, p.items_sold),
    awaitingConfirmation: toKpi(c.awaiting_confirmation, p.awaiting_confirmation),
    cancellations: toKpi(c.cancellations, p.cancellations),
    pendingInquiries: toKpi(c.pending_inquiries, p.pending_inquiries),
    repeatOrderPct: toKpi(c.repeat_order_pct, p.repeat_order_pct),
    topItems: (raw.top_items ?? []).map((i) => ({
      name: i.name,
      quantity: Number(i.quantity) || 0,
      revenue: Number(i.revenue) || 0,
    })),
    daily: fillCountDaily(raw.daily, win, 'orders'),
  }
}

// ------------------------------------------------------------
// Food
// ------------------------------------------------------------

export async function collectFoodDeepDive(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<FoodDeepDive> {
  const raw = await callRpc(db, 'report_food_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  return {
    family: 'food',
    orders: toKpi(c.orders, p.orders),
    revenue: toKpi(c.revenue, p.revenue),
    avgTicket: toKpi(c.avg_ticket, p.avg_ticket),
    reservations: toKpi(c.reservations, p.reservations),
    pendingInquiries: toKpi(c.pending_inquiries, p.pending_inquiries),
    topItems: (raw.top_items ?? []).map((i) => ({
      name: i.name,
      quantity: Number(i.quantity) || 0,
      revenue: Number(i.revenue) || 0,
    })),
    peakHours: (raw.peak_hours ?? []).map((h) => ({
      hour: Number(h.hour) || 0,
      orders: Number(h.orders) || 0,
    })),
    daily: fillCountDaily(raw.daily, win, 'orders'),
  }
}

// ------------------------------------------------------------
// Hospitality
// ------------------------------------------------------------

export async function collectHospitalityDeepDive(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<HospitalityDeepDive> {
  const raw = await callRpc(db, 'report_hospitality_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  return {
    family: 'hospitality',
    bookings: toKpi(c.bookings, p.bookings),
    revenue: toKpi(c.revenue, p.revenue),
    roomNights: toKpi(c.room_nights, p.room_nights),
    adr: toKpi(c.adr, p.adr),
    occupancyPct: toKpi(c.occupancy_pct, p.occupancy_pct),
    cancellations: toKpi(c.cancellations, p.cancellations),
    pendingInquiries: toKpi(c.pending_inquiries, p.pending_inquiries),
    daily: fillCountDaily(raw.daily, win, 'bookings'),
  }
}

// ------------------------------------------------------------
// Property
// ------------------------------------------------------------

export async function collectPropertyDeepDive(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<PropertyDeepDive> {
  const raw = await callRpc(db, 'report_property_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  return {
    family: 'property',
    newInquiries: toKpi(c.new_inquiries, p.new_inquiries),
    convertedInquiries: toKpi(c.converted_inquiries, p.converted_inquiries),
    viewings: toKpi(c.viewings, p.viewings),
    offers: toKpi(c.offers, p.offers),
    activeListings: toKpi(c.active_listings, p.active_listings),
    daily: fillCountDaily(raw.daily, win, 'inquiries'),
  }
}

// ------------------------------------------------------------
// NGO
// ------------------------------------------------------------

export async function collectNgoDeepDive(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<NgoDeepDive> {
  const raw = await callRpc(db, 'report_ngo_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  return {
    family: 'ngo',
    applications: toKpi(c.applications, p.applications),
    approvedApplications: toKpi(c.approved_applications, p.approved_applications),
    enrollments: toKpi(c.enrollments, p.enrollments),
    donations: toKpi(c.donations, p.donations),
    donationAmount: toKpi(c.donation_amount, p.donation_amount),
    activePrograms: toKpi(c.active_programs, p.active_programs),
    daily: fillDailySeries(
      ((raw.daily as unknown as { day: string; applications: number }[]) ?? []).map((d) => ({
        day: d.day,
        value: Number(d.applications) || 0,
      })),
      win.from,
      win.to,
      EMPTY_DAILY,
    ),
  }
}

// ------------------------------------------------------------
// Services
// ------------------------------------------------------------

export async function collectServicesDeepDive(
  db: DB,
  accountId: string,
  win: CollectorWindow,
): Promise<ServicesDeepDive> {
  const raw = await callRpc(db, 'report_services_metrics', accountId, win)
  const c = raw.current ?? {}
  const p = raw.previous ?? {}
  return {
    family: 'services',
    bookings: toKpi(c.bookings, p.bookings),
    revenue: toKpi(c.revenue, p.revenue),
    pendingInquiries: toKpi(c.pending_inquiries, p.pending_inquiries),
    topItems: ((raw.top_items ?? raw.top_services ?? []) as {
      name: string
      quantity?: number
      bookings?: number
      revenue?: number
    }[]).map((i) => ({
      name: i.name,
      quantity: Number(i.quantity ?? i.bookings ?? 0) || 0,
      revenue: Number(i.revenue) || 0,
    })),
    daily: fillCountDaily(raw.daily, win, 'bookings'),
  }
}

// ------------------------------------------------------------
// Dispatcher
// ------------------------------------------------------------

export async function collectDeepDive(
  db: DB,
  accountId: string,
  family: ReportFamily,
  win: CollectorWindow,
): Promise<DeepDive | null> {
  switch (family) {
    case 'commerce':
      return collectCommerceDeepDive(db, accountId, win)
    case 'food':
      return collectFoodDeepDive(db, accountId, win)
    case 'hospitality':
      return collectHospitalityDeepDive(db, accountId, win)
    case 'property':
      return collectPropertyDeepDive(db, accountId, win)
    case 'ngo':
      return collectNgoDeepDive(db, accountId, win)
    case 'services':
      return collectServicesDeepDive(db, accountId, win)
  }
}
