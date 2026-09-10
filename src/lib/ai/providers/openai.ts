import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'

interface OpenAiResponse {
  choices?: {
    message?: {
      content?: string
      tool_calls?: {
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }[]
    }
  }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export interface OpenAiResult extends ProviderResult {
  tool_calls?: {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }[]
}

/**
 * Call OpenAI's Chat Completions endpoint with the caller's own key.
 * Supports tool calling — when the model returns tool_calls instead of
 * content, they are surfaced in the result for the caller to execute.
 */
export async function generateOpenAi(args: ProviderArgs): Promise<OpenAiResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs, tools } = args

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...mergeConsecutive(messages),
    ],
    max_completion_tokens: MAX_OUTPUT_TOKENS,
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  console.log('[openai] request:', {
    model,
    toolCount: tools?.length ?? 0,
    toolNames: tools?.map((t: any) => t.function?.name) ?? [],
    messageCount: (body.messages as any[])?.length ?? 0,
  })

  let res: Response
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError('OpenAI', res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiResponse | null
  const message = data?.choices?.[0]?.message
  const text = message?.content || ''
  const toolCalls = message?.tool_calls

  if (!text && (!toolCalls || toolCalls.length === 0)) {
    // With tools enabled, the model may return empty text after tool execution
    // (it defers to the tool response). Only throw if no tools were provided.
    if (!tools || tools.length === 0) {
      throw new AiError('OpenAI returned an empty response.', {
        code: 'empty_response',
      })
    }
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })

  return { text, usage, tool_calls: toolCalls }
}
