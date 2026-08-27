// ============================================================
// GET /api/plans
//
// Returns all plans with features from the DB (get_plan_features
// RPC) and display metadata. Falls back to hardcoded defaults
// if the RPC hasn't been updated yet (migration 053).
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

/** Fallback features if RPC returns null or outdated data (pre-migration 053) */
const FALLBACK_FEATURES: Record<string, Record<string, unknown>> = {
  starter: {
    max_contacts: 2000,
    max_team_members: 1,
    max_broadcasts_per_month: 100,
    max_automations: 10,
    max_flows: 5,
    max_pipelines: 1,
    max_deals_per_pipeline: 50,
    ai_replies_per_month: 500,
    ai_credits_per_month: 100,
    ai_conversations_per_month: 100,
    max_whatsapp_numbers: 1,
    has_ai_assistant: false,
    has_knowledge_base: false,
    has_analytics: false,
    has_priority_support: false,
    has_custom_integrations: false,
    price_kes: 2500,
    price_usd: 19,
  },
  business: {
    max_contacts: 10000,
    max_team_members: 3,
    max_broadcasts_per_month: 500,
    max_automations: 50,
    max_flows: 25,
    max_pipelines: 3,
    max_deals_per_pipeline: 200,
    ai_replies_per_month: 2000,
    ai_credits_per_month: 400,
    ai_conversations_per_month: 500,
    max_whatsapp_numbers: 2,
    has_ai_assistant: true,
    has_knowledge_base: true,
    has_analytics: false,
    has_priority_support: false,
    has_custom_integrations: false,
    price_kes: 5000,
    price_usd: 38,
  },
  growth: {
    max_contacts: 50000,
    max_team_members: 5,
    max_broadcasts_per_month: 2000,
    max_automations: 200,
    max_flows: 100,
    max_pipelines: 10,
    max_deals_per_pipeline: 1000,
    ai_replies_per_month: 5000,
    ai_credits_per_month: 1000,
    ai_conversations_per_month: 1500,
    max_whatsapp_numbers: 3,
    has_ai_assistant: true,
    has_knowledge_base: true,
    has_analytics: true,
    has_priority_support: false,
    has_custom_integrations: false,
    price_kes: 10000,
    price_usd: 75,
  },
  enterprise: {
    max_contacts: 500000,
    max_team_members: 999,
    max_broadcasts_per_month: 999999,
    max_automations: 9999,
    max_flows: 9999,
    max_pipelines: 9999,
    max_deals_per_pipeline: 999999,
    ai_replies_per_month: 999999,
    ai_credits_per_month: 999999,
    ai_conversations_per_month: 999999,
    max_whatsapp_numbers: 10,
    has_ai_assistant: true,
    has_knowledge_base: true,
    has_analytics: true,
    has_priority_support: true,
    has_custom_integrations: true,
    price_kes: 25000,
    price_usd: 188,
  },
}

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()

    const PLAN_IDS = ['starter', 'business', 'growth', 'enterprise'] as const

    const results = await Promise.all(
      PLAN_IDS.map(async (planId) => {
        const { data, error } = await supabase.rpc('get_plan_features', {
          p_plan: planId,
        })

        // Use RPC data if valid, otherwise fall back to hardcoded defaults
        const rpcFeatures = error ? null : data
        const hasValidPrice = rpcFeatures?.price_kes && rpcFeatures.price_kes > 0
        const features = hasValidPrice ? rpcFeatures : FALLBACK_FEATURES[planId]

        return {
          id: planId,
          ...PLAN_META[planId],
          features,
          price_kes: features?.price_kes ?? 0,
          price_usd: features?.price_usd ?? 0,
        }
      }),
    )

    const plans = results.filter(Boolean)

    return NextResponse.json({ plans })
  } catch (err) {
    return toErrorResponse(err)
  }
}
