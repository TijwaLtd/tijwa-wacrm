// ============================================================
// GET /api/plans
//
// Returns all plans with features from the DB (get_plan_features
// RPC) and display metadata. Single source of truth — client
// has zero hardcoded plan data.
// ============================================================

import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'

const PLAN_META = {
  starter: {
    name: 'Starter',
    price: 'Free',
    description: 'For small teams getting started with WhatsApp CRM.',
    cta: 'Upgrade',
  },
  pro: {
    name: 'Pro',
    price: '$29/mo',
    description: 'For growing businesses that need more power.',
    cta: 'Upgrade',
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For large organizations with custom needs.',
    cta: 'Contact Sales',
  },
} as const

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()

    const PLAN_IDS = ['starter', 'pro', 'enterprise'] as const

    const results = await Promise.all(
      PLAN_IDS.map(async (planId) => {
        const { data, error } = await supabase.rpc('get_plan_features', {
          p_plan: planId,
        })
        if (error) {
          console.error(`[plans] rpc failed for ${planId}:`, error)
          return null
        }
        return {
          id: planId,
          ...PLAN_META[planId],
          features: data,
        }
      }),
    )

    const plans = results.filter(Boolean)

    return NextResponse.json({ plans })
  } catch (err) {
    return toErrorResponse(err)
  }
}
