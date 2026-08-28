import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { hasPlatformKey, getEmbeddingsApiKey, getPlatformAiInfo } from '@/lib/ai/config'
import { getAiCreditBalance } from '@/lib/ai/credits'

/**
 * GET /api/ai/config
 *
 * Returns platform AI status and per-account credit balance.
 * No per-tenant config - everything is global.
 */
export async function GET() {
  try {
    const { serviceClient, accountId } = await getCurrentAccount()

    // Get credits
    const balance = await getAiCreditBalance(serviceClient, accountId)

    // Get platform config info
    const platformInfo = getPlatformAiInfo()
    const hasAnyPlatformKey = hasPlatformKey('openai') || hasPlatformKey('anthropic')

    // Get follow-up settings
    const { data: ts } = await serviceClient
      .from('tenant_settings')
      .select('follow_up_enabled, follow_up_timeout_minutes')
      .eq('account_id', accountId)
      .maybeSingle()

    return NextResponse.json({
      has_openai_key: hasPlatformKey('openai'),
      has_anthropic_key: hasPlatformKey('anthropic'),
      has_any_platform_key: hasAnyPlatformKey,
      has_embeddings_key: Boolean(getEmbeddingsApiKey()),
      credits: balance,
      platform_provider: platformInfo.provider,
      platform_model: platformInfo.model,
      platform_ai_enabled: platformInfo.enabled,
      follow_up_enabled: ts?.follow_up_enabled ?? true,
      follow_up_timeout_minutes: ts?.follow_up_timeout_minutes ?? 10,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PATCH /api/ai/config
 *
 * Updates only follow-up settings (per-account). Does not touch AI config.
 */
export async function PATCH(request: Request) {
  try {
    const { serviceClient, accountId } = await getCurrentAccount()

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}

    if ('follow_up_enabled' in body) {
      updates.follow_up_enabled = body.follow_up_enabled === true
    }

    if ('follow_up_timeout_minutes' in body) {
      const timeout = Number(body.follow_up_timeout_minutes)
      if (Number.isFinite(timeout)) {
        updates.follow_up_timeout_minutes = Math.min(60, Math.max(1, timeout))
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await serviceClient
      .from('tenant_settings')
      .update(updates)
      .eq('account_id', accountId)

    if (error) {
      console.error('[ai/config PATCH] error:', error)
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
