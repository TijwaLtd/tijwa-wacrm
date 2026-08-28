import type { AiConfig, AiProvider } from './types'
import { AI_PROVIDER_DEFAULT_MODEL } from './defaults'

function getDefaultProvider(): AiProvider {
  const env = process.env.AI_PROVIDER
  if (env === 'anthropic') return 'anthropic'
  return 'openai'
}

function getDefaultModel(provider: AiProvider): string {
  const env = process.env.AI_MODEL
  if (env && env.trim()) return env.trim()
  return AI_PROVIDER_DEFAULT_MODEL[provider]
}

function getPlatformApiKey(provider: AiProvider): string | undefined {
  if (provider === 'openai') return process.env.OPENAI_API_KEY
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY
  return undefined
}

export function getEmbeddingsApiKey(): string | null {
  return process.env.EMBEDDINGS_API_KEY ?? null
}

export function hasPlatformKey(provider: AiProvider): boolean {
  return Boolean(getPlatformApiKey(provider))
}

function getPlatformKey(provider: AiProvider): string {
  const key = getPlatformApiKey(provider)
  if (!key) {
    throw new Error(
      `AI provider "${provider}" is not configured on this platform. ` +
      `Set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} in the environment.`,
    )
  }
  return key
}

/**
 * Load platform AI config. No per-tenant config - everything is global.
 * Returns null only when no platform key is configured.
 * Credit check is separate — done by the caller.
 */
export async function loadAiConfig(): Promise<AiConfig | null> {
  const provider = getDefaultProvider()
  const model = getDefaultModel(provider)

  let apiKey: string
  try {
    apiKey = getPlatformKey(provider)
  } catch {
    console.error(
      `[ai config] platform provider "${provider}" has no API key configured. ` +
      `Set ${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} in the environment.`,
    )
    return null
  }

  return {
    provider,
    model,
    apiKey,
    systemPrompt: process.env.AI_SYSTEM_PROMPT ?? null,
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: Number(process.env.AI_AUTO_REPLY_MAX_PER_CONVERSATION) || 3,
    handoffAgentId: null,
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

/**
 * Platform-level AI config info for the settings UI.
 * Returns what provider/model is configured globally (never the actual API key).
 */
export function getPlatformAiInfo(): {
  provider: AiProvider
  model: string
  systemPrompt: string | null
  enabled: boolean
} {
  const provider = getDefaultProvider()
  const model = getDefaultModel(provider)
  return {
    provider,
    model,
    systemPrompt: process.env.AI_SYSTEM_PROMPT ?? null,
    enabled: true,
  }
}
