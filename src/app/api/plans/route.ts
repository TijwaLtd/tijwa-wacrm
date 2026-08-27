// ============================================================
// GET /api/plans
//
// Returns plan features from the database (get_plan_features RPC).
// Used by billing page and any plan-gating UI.
// ============================================================

import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()

    const PLANS = ['starter', 'pro', 'enterprise'] as const

    const results = await Promise.all(
      PLANS.map(async (plan) => {
        const { data, error } = await supabase.rpc('get_plan_features', {
          p_plan: plan,
        })
        if (error) {
          console.error(`[plans] failed to fetch features for ${plan}:`, error)
          return { plan, features: null }
        }
        return { plan, features: data }
      }),
    )

    const plans = results.reduce(
      (acc, { plan, features }) => {
        acc[plan] = features
        return acc
      },
      {} as Record<string, unknown>,
    )

    return NextResponse.json({ plans })
  } catch (err) {
    return toErrorResponse(err)
  }
}
