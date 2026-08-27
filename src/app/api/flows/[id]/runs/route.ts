import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * GET /api/flows/[id]/runs
 *
 * Newest-first list of flow runs for a single flow, with the latest
 * event timeline embedded for each. Used by the run-history viewer
 * page (`/flows/[id]/runs`) to give the owner end-to-end visibility
 * into what the bot did with each customer.
 *
 * Limited to the 50 most recent runs. Pagination can come later;
 * the dashboard surface here is for debugging, not heavy querying.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params

  let ctx
  try {
    ctx = await requireRole('viewer')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { supabase, accountId } = ctx

  // Confirm flow exists + belongs to active account.
  const { data: flow } = await supabase
    .from('flows')
    .select('id, name')
    .eq('id', id)
    .eq('account_id', accountId)
    .maybeSingle()
  if (!flow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Pull runs + each run's contact name + each run's events. Two
  // joined selects keep the round-trip count to the runs query + one
  // per-run events query.
  // Explicit account_id filter for defense-in-depth (RLS also enforces it).
  const { data: runs, error: runsErr } = await supabase
    .from('flow_runs')
    .select(
      'id, status, current_node_key, started_at, last_advanced_at, ended_at, end_reason, vars, reprompt_count, contact:contacts(id, name, phone)',
    )
    .eq('flow_id', id)
    .eq('account_id', accountId)
    .order('started_at', { ascending: false })
    .limit(50)
  if (runsErr) {
    return NextResponse.json({ error: runsErr.message }, { status: 500 })
  }

  const runIds = (runs ?? []).map((r) => (r as { id: string }).id)
  let events: Array<{
    flow_run_id: string
    event_type: string
    node_key: string | null
    payload: Record<string, unknown>
    created_at: string
  }> = []
  if (runIds.length > 0) {
    const { data: evs, error: evsErr } = await supabase
      .from('flow_run_events')
      .select('flow_run_id, event_type, node_key, payload, created_at')
      .in('flow_run_id', runIds)
      .order('created_at', { ascending: true })
    if (evsErr) {
      // Non-fatal — the page can still show runs without timelines.
      console.error('[flows-runs] events fetch failed:', evsErr.message)
    } else if (evs) {
      events = evs as typeof events
    }
  }

  return NextResponse.json({
    flow,
    runs: runs ?? [],
    events,
  })
}
