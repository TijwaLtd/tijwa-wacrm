import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiConfig, AiProvider } from './types'

interface AiConfigRow {
  provider: 'openai' | 'anthropic'
  model: string
  system_prompt: string | null
  is_active: boolean
  auto_reply_enabled: boolean
  auto_reply_max_per_conversation: number
  handoff_agent_id: string | null
}

const CONFIG_COLUMNS =
  'provider, model, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id'

/**
 * Platform-provided API keys via environment variables.
 * No more BYO-key — users pay for credits, the platform provides the key.
 */
const PLATFORM_API_KEYS: Record<AiProvider, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
}

/**
 * Optional platform embeddings key for semantic KB search.
 */
export function getEmbeddingsApiKey(): string | null {
  return process.env.EMBEDDINGS_API_KEY ?? null
}

/**
 * Check if a given provider has a platform key configured.
 */
export function hasPlatformKey(provider: AiProvider): boolean {
  return Boolean(PLATFORM_API_KEYS[provider])
}

/**
 * Get the platform API key for a provider. Throws if not configured.
 */
function getPlatformKey(provider: AiProvider): string {
  const key = PLATFORM_API_KEYS[provider]
  if (!key) {
    throw new Error(
      `AI provider "${provider}" is not configured on this platform. ` +
      `Set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} in the environment.`,
    )
  }
  return key
}

/**
 * Load the account's AI config for *use* (draft or auto-reply).
 * Returns `null` when there's no row or the master switch (`is_active`)
 * is off — both mean "AI is not available".
 *
 * The API key comes from the platform environment, not the database.
 * The embeddings key also comes from the platform environment.
 */
export async function loadAiConfig(
  db: SupabaseClient,
  accountId: string,
  opts: { requireActive?: boolean } = {},
): Promise<AiConfig | null> {
  const { requireActive = true } = opts
  const { data, error } = await db
    .from('ai_configs')
    .select(CONFIG_COLUMNS)
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as AiConfigRow
  if (requireActive && !row.is_active) return null

  // Get the platform API key for this provider
  let apiKey: string
  try {
    apiKey = getPlatformKey(row.provider)
  } catch {
    // Provider key not configured — treat as "not configured"
    console.error(
      `[ai config] provider ${row.provider} has no platform API key configured`,
    )
    return null
  }

  return {
    provider: row.provider,
    model: row.model,
    apiKey,
    systemPrompt: row.system_prompt,
    isActive: row.is_active,
    autoReplyEnabled: row.auto_reply_enabled,
    autoReplyMaxPerConversation: row.auto_reply_max_per_conversation,
    handoffAgentId: row.handoff_agent_id,
    embeddingsApiKey: getEmbeddingsApiKey(),
  }
}

/**
 * Load just the embeddings key from environment. Used by the
 * knowledge-base ingest routes so the KB gets embedded whenever
 * the platform embeddings key is set, even if the assistant's
 * master switch is currently off.
 */
export function loadEmbeddingsKey(): { key: string | null; corrupt: boolean } {
  const key = getEmbeddingsApiKey()
  return { key, corrupt: false }
}
