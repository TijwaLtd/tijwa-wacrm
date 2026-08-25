import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

/**
 * GET /api/whatsapp/templates
 *
 * Lists message templates for the active account.
 * Uses requireRole('viewer') to bypass RLS issues — the client-side
 * Supabase query goes through RLS which can silently return empty
 * when profiles.account_id is out of sync with account_memberships.
 */
export async function GET() {
  try {
    const ctx = await requireRole('viewer')

    const { data: templates, error } = await ctx.supabase
      .from('message_templates')
      .select('*')
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[whatsapp/templates GET] DB error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch templates' },
        { status: 500 }
      )
    }

    return NextResponse.json(templates || [])
  } catch (error) {
    return toErrorResponse(error)
  }
}
