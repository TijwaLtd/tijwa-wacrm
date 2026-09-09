import { AiError, type ChatMessage, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

interface AnthropicResponse {
  content?: { type?: string; text?: string; id?: string; name?: string; input?: unknown }[]
  usage?: { input_tokens?: number; output_tokens?: number }
}

export interface AnthropicResult extends ProviderResult {
  tool_calls?: {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }[]
}

/**
 * Convert OpenAI-style tool definitions to Anthropic format.
 */
function toAnthropicTools(
  tools: Array<{ type: 'function'; function: any }>,
): Array<{ name: string; description: string; input_schema: Record<string, unknown> }> {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters || { type: 'object', properties: {} },
  }))
}

/**
 * Normalize for Anthropic: strictly alternating roles starting with user.
 */
function normalizeForAnthropic(messages: ChatMessage[]): Array<{ role: string; content: string | Array<Record<string, unknown>> }> {
  const out: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = []

  for (const m of messages) {
    // Skip tool messages — Anthropic handles tool results differently
    if (m.role === 'tool') continue

    const last = out[out.length - 1]
    if (last && last.role === m.role) {
      // Merge consecutive same-role messages
      if (typeof last.content === 'string' && typeof m.content === 'string') {
        last.content = `${last.content}\n\n${m.content}`
      }
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }

  // Drop leading assistant messages
  while (out.length > 0 && out[0].role === 'assistant') {
    out.shift()
  }
  if (out.length === 0) {
    return [{ role: 'user', content: '(The customer has not sent a message yet.)' }]
  }
  return out
}

/**
 * Call Anthropic's Messages endpoint with the caller's own key.
 * Supports tool calling — when the model returns tool_use blocks,
 * they are surfaced in the result for the caller to execute.
 */
export async function generateAnthropic(args: ProviderArgs): Promise<AnthropicResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, tools } = args

  const body: Record<string, unknown> = {
    model,
    system: systemPrompt,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: normalizeForAnthropic(messages),
  }

  if (tools && tools.length > 0) {
    body.tools = toAnthropicTools(tools)
  }

  let res: Response
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('Anthropic', res)
  }

  const data = (await res.json().catch(() => null)) as AnthropicResponse | null
  const blocks = data?.content || []

  // Extract text blocks
  const textParts: string[] = []
  const toolCalls: AnthropicResult['tool_calls'] = []

  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input || {}),
        },
      })
    }
  }

  const text = textParts.join('').trim()

  if (!text && toolCalls.length === 0) {
    throw new AiError('Anthropic returned an empty response.', {
      code: 'empty_response',
    })
  }

  // Anthropic reports input/output but no total — normalizeUsage sums.
  const usage = normalizeUsage({
    prompt: data?.usage?.input_tokens,
    completion: data?.usage?.output_tokens,
  })

  return { text, usage, tool_calls: toolCalls.length > 0 ? toolCalls : undefined }
}
