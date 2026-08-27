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
    description: 'For small businesses getting organized on WhatsApp.',
    cta: 'Get Started',
  },
  business: {
    name: 'Business',
    description: 'For businesses actively selling and supporting customers.',
    cta: 'Upgrade',
    recommended: true,
  },
  growth: {
    name: 'Growth',
    description: 'For teams with higher conversation volume.',
    cta: 'Upgrade',
  },
  enterprise: {
    name: 'Enterprise',
    description: 'Custom solutions for hotels, clinics, schools, and multi-branch businesses.',
    cta: 'Contact Sales',
  },
} as const

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()

    const PLAN_IDS = ['starter', 'business', 'growth', 'enterprise'] as const

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
          price_kes: data?.price_kes ?? 0,
          price_usd: data?.price_usd ?? 0,
        }
      }),
    )

    const plans = results.filter(Boolean)

    return NextResponse.json({ plans })
  } catch (err) {
    return toErrorResponse(err)
  }
}
