import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
  type ReplyResult,
} from './types'
import { HANDOFF_SENTINEL, aiRequestTimeoutMs } from './defaults'
import { generateOpenAi } from './providers/openai'
import { generateAnthropic } from './providers/anthropic'

export interface GenerateArgs {
  config: AiConfig
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[]
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const { config, systemPrompt, messages } = args
  const timeoutMs = aiRequestTimeoutMs()
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
  }

  let result: { text: string; usage: AiUsage | null }
  switch (config.provider) {
    case 'openai':
      result = await generateOpenAi(providerArgs)
      break
    case 'anthropic':
      result = await generateAnthropic(providerArgs)
      break
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      })
  }

  return parseGeneration(result.text, result.usage)
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  raw: string,
  usage: AiUsage | null = null,
): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL)
  const text = raw.split(HANDOFF_SENTINEL).join('').trim()
  return { text, handoff, usage }
}

// ----------------------------------------------------------------
// Application-level output validation
// ----------------------------------------------------------------

/**
 * Patterns that suggest the model accidentally leaked internal
 * metadata or system-prompt content. Checked against the final
 * output text after handoff parsing.
 */
const PROMPT_LEAKAGE_PATTERNS = [
  /^system\s*prompt/i,
  /you\s+are\s+a\s+customer[\s-]messaging\s+assistant/i,
  /trust\s+hierarchy/i,
  /prompt\s+injection/i,
  /anti[\s-]jailbreak/i,
  /platform\s+instructions/i,
  /handoff\s+sentinel/i,
]

/**
 * Patterns that suggest the model output accidental JSON, tool
 * schemas, or internal data instead of a customer-facing message.
 */
const INTERNAL_OUTPUT_PATTERNS = [
  /^\s*\{[\s\S]*"type"\s*:/, // JSON with "type" field
  /^\s*\[[\s\S]*\]\s*$/, // bare JSON array
  /<thinking>/i, // chain-of-thought tags
  /<thinking>/i,
  /```json/,
  /```tool/,
]

/**
 * Maximum reasonable reply length in characters. This is not a hard
 * model limit (MAX_OUTPUT_TOKENS handles that) but a safety net for
 * outputs that pass token limits but are still too long for WhatsApp.
 */
const MAX_REPLY_CHARS = 4000

/**
 * Validate and normalize raw model output into a `ReplyResult`.
 *
 * This is the application-level safety net — even if the model
 * produces unexpected output, this function ensures only protocol-
 * correct, customer-safe content reaches WhatsApp.
 *
 * Rules:
 * - Exact [[HANDOFF]] (possibly surrounded by whitespace) → handoff
 * - Sentinel anywhere in output → treat as handoff, strip sentinel
 * - Empty/whitespace-only → reject as error
 * - Obvious system-prompt leakage → reject as error
 * - Accidental JSON/tool output → reject as error
 * - Excessively long output → truncate with ellipsis
 * - Valid WhatsApp formatting preserved
 */
export function validateOutput(raw: string): ReplyResult {
  // 1. Strip surrounding whitespace
  const trimmed = raw.trim()

  // 2. Empty response → error
  if (!trimmed) {
    throw new AiError('Model returned an empty response.', {
      code: 'empty_response',
      status: 502,
    })
  }

  // 3. Exact handoff sentinel (possibly with surrounding whitespace)
  if (trimmed === HANDOFF_SENTINEL) {
    return { type: 'handoff' }
  }

  // 4. Sentinel anywhere in the output → treat as handoff
  if (trimmed.includes(HANDOFF_SENTINEL)) {
    return { type: 'handoff' }
  }

  // 5. System-prompt leakage detection
  for (const pattern of PROMPT_LEAKAGE_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new AiError('Model output contains potential prompt leakage.', {
        code: 'prompt_leakage',
        status: 502,
      })
    }
  }

  // 6. Internal output detection (JSON, tool schemas, thinking tags)
  for (const pattern of INTERNAL_OUTPUT_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new AiError('Model output contains internal data instead of a customer message.', {
        code: 'internal_output',
        status: 502,
      })
    }
  }

  // 7. Excessive length → truncate
  let text = trimmed
  if (text.length > MAX_REPLY_CHARS) {
    text = text.slice(0, MAX_REPLY_CHARS - 1).trimEnd() + '…'
  }

  return { type: 'reply', text }
}
