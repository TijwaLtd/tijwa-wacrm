import type { SupabaseClient } from '@supabase/supabase-js'
import {
  daysAgoStart,
  lastNDayKeys,
  localDayKey,
  startOfLocalDay,
} from './date-utils'
import type {
  ConversationsSeriesPoint,
  MetricsBundle,
} from './types'

// ------------------------------------------------------------
// All client-side aggregation. Each query is scoped to the
// active account via accountId parameter. RLS provides an
// additional safety layer but we always filter explicitly.
// Perf is acceptable for the current scale (low thousands of
// messages) — if a tenant's dataset outgrows this, we'd migrate
// the heavy aggregations to SQL RPCs. Noted in the PR.
// ------------------------------------------------------------

type DB = SupabaseClient

// --- 1. Metric cards ---------------------------------------------------

export async function loadMetrics(db: DB, accountId: string): Promise<MetricsBundle> {
  const todayStart = startOfLocalDay().toISOString()
  const yesterdayStart = daysAgoStart(1).toISOString()

  // Get conversation IDs for this account first (messages don't have account_id)
  const { data: convIds } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
  const conversationIds = (convIds ?? []).map((c: { id: string }) => c.id)

  const [
    openConvCur,
    newConvToday,
    newConvYesterday,
    newContactsToday,
    newContactsYesterday,
    messagesToday,
    messagesYesterday,
  ] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('account_id', accountId).eq('status', 'open'),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'open')
      .gte('created_at', todayStart),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('status', 'open')
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('account_id', accountId).gte('created_at', todayStart),
    db
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .gte('created_at', yesterdayStart)
      .lt('created_at', todayStart),
    // Messages don't have account_id — scope through conversations
    conversationIds.length > 0
      ? db
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_type', 'agent')
          .gte('created_at', todayStart)
          .in('conversation_id', conversationIds)
      : Promise.resolve({ count: 0, data: [], error: null }),
    conversationIds.length > 0
      ? db
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender_type', 'agent')
          .gte('created_at', yesterdayStart)
          .lt('created_at', todayStart)
          .in('conversation_id', conversationIds)
      : Promise.resolve({ count: 0, data: [], error: null }),
  ])

  return {
    activeConversations: {
      current: openConvCur.count ?? 0,
      // "vs yesterday" on a current-state count has no clean answer
      // without snapshots — we show the delta in NEW open conversations
      // today vs yesterday. That's the business-meaningful daily signal.
      previous: (newConvToday.count ?? 0) - (newConvYesterday.count ?? 0),
    },
    newContactsToday: {
      current: newContactsToday.count ?? 0,
      previous: newContactsYesterday.count ?? 0,
    },
    messagesSentToday: {
      current: messagesToday.count ?? 0,
      previous: messagesYesterday.count ?? 0,
    },
  }
}

// --- 2. Conversations over time ---------------------------------------

export async function loadConversationsSeries(
  db: DB,
  accountId: string,
  rangeDays: number,
): Promise<ConversationsSeriesPoint[]> {
  const start = daysAgoStart(rangeDays - 1).toISOString()

  // First get conversation IDs for this account
  const { data: convIds, error: convErr } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
  if (convErr) throw convErr

  const conversationIds = (convIds ?? []).map((c: { id: string }) => c.id)
  if (conversationIds.length === 0) {
    return lastNDayKeys(rangeDays).map((day) => ({ day, incoming: 0, outgoing: 0 }))
  }

  const { data, error } = await db
    .from('messages')
    .select('created_at, sender_type')
    .in('conversation_id', conversationIds)
    .gte('created_at', start)
    .order('created_at', { ascending: true })
  if (error) throw error

  const keys = lastNDayKeys(rangeDays)
  const buckets = new Map<string, { incoming: number; outgoing: number }>()
  for (const k of keys) buckets.set(k, { incoming: 0, outgoing: 0 })

  for (const row of (data ?? []) as { created_at: string; sender_type: string }[]) {
    const key = localDayKey(row.created_at)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (row.sender_type === 'customer') bucket.incoming += 1
    else bucket.outgoing += 1 // agent + bot both count as outgoing
  }

  return keys.map((day) => ({ day, ...(buckets.get(day) ?? { incoming: 0, outgoing: 0 }) }))
}
