import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import type { AiProvider } from '@/lib/ai/types'
import { hasPlatformKey, getEmbeddingsApiKey } from '@/lib/ai/config'
import { getCreditRatesForProvider, getAiCreditBalance } from '@/lib/ai/credits'

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * GET /api/ai/config
 *
 * Any member may read the config so the settings/inbox can reflect
 * whether AI is set up. Returns platform key availability, credit
 * balance, and available models -- never exposes any secrets.
 */
export async function GET() {
  try {
    const { supabase, serviceClient, accountId } = await getCurrentAccount()

    const { data, error } = await supabase
      .from('ai_configs')
      .select(
        'provider, model, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id',
      )
      .eq('account_id', accountId)
      .maybeSingle()

    if (error) {
      console.error('[ai/config GET] fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to load AI configuration' },
        { status: 500 },
      )
    }

    // Ensure ai_credits row exists — seed with plan allocation if missing
    const PLAN_CREDITS: Record<string, number> = {
      starter: 100,
      pro: 1000,
      enterprise: 999999,
    };

    // Check if row exists first
    const { data: existingCredits } = await serviceClient
      .from("ai_credits")
      .select("id")
      .eq("account_id", accountId)
      .maybeSingle();

    if (!existingCredits) {
      // Get current plan
      const { data: settings } = await serviceClient
        .from("tenant_settings")
        .select("plan")
        .eq("account_id", accountId)
        .maybeSingle();

      const plan = settings?.plan ?? "starter";
      const credits = PLAN_CREDITS[plan] ?? 100;

      await serviceClient.rpc("add_ai_credits", {
        p_account_id: accountId,
        p_credits: credits,
      });
    }

    const balance = await getAiCreditBalance(supabase, accountId)

    const openaiRates = await getCreditRatesForProvider(supabase, 'openai')
    const anthropicRates = await getCreditRatesForProvider(supabase, 'anthropic')

    const availableModels = [
      ...openaiRates.map((r) => ({
        provider: r.provider,
        model: r.model,
        displayName: r.displayName,
        inputCreditsPerMtok: r.inputCreditsPerMtok,
        outputCreditsPerMtok: r.outputCreditsPerMtok,
      })),
      ...anthropicRates.map((r) => ({
        provider: r.provider,
        model: r.model,
        displayName: r.displayName,
        inputCreditsPerMtok: r.inputCreditsPerMtok,
        outputCreditsPerMtok: r.outputCreditsPerMtok,
      })),
    ]

    if (!data) {
      return NextResponse.json({
        configured: false,
        has_openai_key: hasPlatformKey('openai'),
        has_anthropic_key: hasPlatformKey('anthropic'),
        has_embeddings_key: Boolean(getEmbeddingsApiKey()),
        credits: balance,
        available_models: availableModels,
      })
    }

    return NextResponse.json({
      configured: true,
      ...data,
      has_openai_key: hasPlatformKey('openai'),
      has_anthropic_key: hasPlatformKey('anthropic'),
      has_embeddings_key: Boolean(getEmbeddingsApiKey()),
      credits: balance,
      available_models: availableModels,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/ai/config  (admin+)
 *
 * Upsert the account's AI config. No more API key handling -- the
 * platform provides keys via env vars. Validates that the selected
 * provider has a platform key configured.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-config:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const provider = body.provider as AiProvider
    if (provider !== 'openai' && provider !== 'anthropic') {
      return bad('provider must be "openai" or "anthropic"')
    }

    if (!hasPlatformKey(provider)) {
      return bad(
        `AI provider "${provider}" is not configured on this platform. ` +
          `Contact your administrator to set up the API key.`,
      )
    }

    const model = typeof body.model === 'string' ? body.model.trim() : ''
    if (!model) return bad('model is required')

    const rates = await getCreditRatesForProvider(supabase, provider)
    const modelExists = rates.some((r) => r.model === model)
    if (!modelExists) {
      return bad(
        `Model "${model}" is not available. Choose from the available models in Settings.`,
      )
    }

    const systemPrompt =
      typeof body.system_prompt === 'string' && body.system_prompt.trim()
        ? body.system_prompt.trim()
        : null
    const isActive = body.is_active === true
    const autoReplyEnabled = body.auto_reply_enabled === true

    let maxPer = Number(body.auto_reply_max_per_conversation)
    if (!Number.isFinite(maxPer)) maxPer = 3
    maxPer = Math.min(20, Math.max(1, Math.floor(maxPer)))

    const rawHandoff =
      typeof body.handoff_agent_id === 'string' ? body.handoff_agent_id.trim() : ''
    const handoffProvided = 'handoff_agent_id' in body
    let handoffAgentId: string | null = null
    if (rawHandoff) {
      const { data: member } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('account_id', accountId)
        .eq('user_id', rawHandoff)
        .maybeSingle()
      if (!member) return bad('handoff_agent_id must be a member of this account')
      handoffAgentId = rawHandoff
    }

    const shared: Record<string, unknown> = {
      provider,
      model,
      system_prompt: systemPrompt,
      is_active: isActive,
      auto_reply_enabled: autoReplyEnabled,
      auto_reply_max_per_conversation: maxPer,
    }
    if (handoffProvided) shared.handoff_agent_id = handoffAgentId

    const { data: existing } = await supabase
      .from('ai_configs')
      .select('id')
      .eq('account_id', accountId)
      .maybeSingle()

    if (existing) {
      const { error: upErr } = await supabase
        .from('ai_configs')
        .update(shared)
        .eq('account_id', accountId)
      if (upErr) {
        console.error('[ai/config POST] update error:', upErr)
        return NextResponse.json(
          { error: 'Failed to save AI configuration' },
          { status: 500 },
        )
      }
    } else {
      const { error: insErr } = await supabase.from('ai_configs').insert({
        account_id: accountId,
        created_by: userId,
        ...shared,
      })
      if (insErr) {
        console.error('[ai/config POST] insert error:', insErr)
        return NextResponse.json(
          { error: 'Failed to save AI configuration' },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * DELETE /api/ai/config  (admin+)
 *
 * Removes the account's AI config (turns everything off).
 */
export async function DELETE() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { error } = await supabase
      .from('ai_configs')
      .delete()
      .eq('account_id', accountId)
    if (error) {
      console.error('[ai/config DELETE] error:', error)
      return NextResponse.json(
        { error: 'Failed to delete AI configuration' },
        { status: 500 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}
