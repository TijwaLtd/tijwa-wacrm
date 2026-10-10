import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { isSupportStaff } from '@/lib/support/staff'

// Staff console: every account's tickets. Reads through the service
// role (RLS has no staff concept) only after the SUPPORT_STAFF_EMAILS
// allowlist check passes. Filters: status, priority, category, q
// (tracking id or subject search), limit/offset.

export async function GET(request: Request) {
  let ctx
  try {
    ctx = await getCurrentAccount()
  } catch (err) {
    return toErrorResponse(err)
  }
  if (!(await isSupportStaff(ctx))) {
    return NextResponse.json({ error: 'Staff access required' }, { status: 403 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const priority = url.searchParams.get('priority')
  const category = url.searchParams.get('category')
  // PostgREST .or() parses commas/parens as filter syntax — strip them
  // so a subject search containing "," can't break (or widen) the query.
  const q = url.searchParams
    .get('q')
    ?.trim()
    .replace(/[(),]/g, ' ')
    .slice(0, 100)
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 200)
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)

  // Unfiltered status counts for the queue's stats strip — computed
  // separately so the numbers reflect the whole queue, not the page
  // currently loaded in the list.
  const countFor = async (s: string) => {
    const { count } = await ctx.serviceClient
      .from('support_tickets')
      .select('id', { count: 'exact', head: true })
      .eq('status', s)
    return count ?? 0
  }
  const [openCount, inProgressCount, waitingCount] = await Promise.all([
    countFor('open'),
    countFor('in_progress'),
    countFor('waiting_on_user'),
  ])

  let query = ctx.serviceClient
    .from('support_tickets')
    .select('*, account:accounts(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status) query = query.eq('status', status)
  if (priority) query = query.eq('priority', priority)
  if (category) query = query.eq('category', category)
  if (q) {
    query = query.or(`tracking_id.ilike.%${q}%,subject.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    tickets: data ?? [],
    total: count ?? 0,
    limit,
    offset,
    counts: {
      open: openCount,
      in_progress: inProgressCount,
      waiting_on_user: waitingCount,
    },
  })
}
