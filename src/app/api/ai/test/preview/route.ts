import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadAiConfig } from '@/lib/ai/config'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { buildConversationContext } from '@/lib/ai/context'
import { getToolsForBusinessType, executeToolCalls, hasToolCalls } from '@/lib/ai/tools/executor'
import { generateReply } from '@/lib/ai/generate'
import type { ChatMessage } from '@/lib/ai/types'

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * POST /api/ai/test/preview
 *
 * Dry-run the AI auto-reply pipeline WITHOUT sending to WhatsApp.
 * Tests: system prompt → tool definitions → AI generation → tool execution.
 *
 * Body: {
 *   accountId: string,         // required
 *   message: string,           // required — the customer message to test
 *   conversationId?: string,   // optional — existing conversation to pull history from
 * }
 *
 * Returns: {
 *   round0: { text, toolCalls, handoff },
 *   tools: string[],
 *   businessType: string | null,
 *   systemPromptPreview: string,
 *   toolResults?: any[],
 *   round1?: { text, toolCalls },
 *   finalText: string,
 *   finalButtons: any[] | null,
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { accountId, message, conversationId } = body

    if (!accountId || !message) {
      return NextResponse.json(
        { error: 'accountId and message are required' },
        { status: 400 },
      )
    }

    const db = supabaseAdmin()
    const logs: string[] = []
    const log = (msg: string) => {
      logs.push(`[${new Date().toISOString()}] ${msg}`)
      console.log('[ai-test-preview]', msg)
    }

    // 1. Load AI config
    const config = await loadAiConfig()
    if (!config) {
      return NextResponse.json({ error: 'AI not configured', logs }, { status: 500 })
    }
    log(`config: provider=${config.provider}, model=${config.model}`)

    // 2. Get business type
    const { data: account } = await db
      .from('accounts')
      .select('business_type')
      .eq('id', accountId)
      .maybeSingle()
    const businessType = account?.business_type || null
    log(`businessType: ${businessType}`)

    // 3. Build conversation context (from existing conversation or empty)
    let contextMessages: ChatMessage[] = []
    if (conversationId) {
      const ctx = await buildConversationContext(db, conversationId)
      contextMessages = ctx.messages
      log(`loaded ${ctx.messages.length} context messages from conversation ${conversationId}`)
    }

    // Add the test message as a user message
    contextMessages.push({ role: 'user', content: message })
    log(`test message: "${message.slice(0, 200)}"`)

    // 4. Build system prompt
    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge: [],
      businessType,
    })
    log(`system prompt: ${systemPrompt.length} chars`)

    // 5. Load tools
    const tools = getToolsForBusinessType(businessType)
    const toolDefs = tools.map((t) => ({ type: 'function' as const, function: t.definition.function }))
    log(`tools: ${toolDefs.map((t) => t.function.name).join(', ')}`)

    // 6. Round 0 — send to AI
    const toolMessages: ChatMessage[] = [...contextMessages]
    const result0 = await generateReply({
      config,
      systemPrompt,
      messages: toolMessages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    })

    const round0 = {
      text: result0.text,
      handoff: result0.handoff,
      toolCalls: result0.tool_calls?.map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
        parsedArgs: (() => {
          try { return JSON.parse(tc.function.arguments) } catch { return null }
        })(),
      })) ?? [],
    }
    log(`round0: text="${result0.text?.slice(0, 200) || ''}", handoff=${result0.handoff}, toolCalls=${round0.toolCalls.length}`)

    // If no tool calls, return early
    if (!hasToolCalls({ tool_calls: result0.tool_calls })) {
      return NextResponse.json({
        success: true,
        round0,
        tools: toolDefs.map((t) => t.function.name),
        businessType,
        systemPromptPreview: systemPrompt.slice(0, 500),
        finalText: result0.text,
        finalButtons: null,
        logs,
      })
    }

    // 7. Execute tool calls
    const toolCtx = {
      db,
      accountId,
      conversationId: conversationId || 'test-simulated',
      contactId: 'test-simulated',
      contactPhone: null,
      contactName: 'Test Contact',
      businessType,
      userId: configOwnerUserId(config),
    }

    const toolResults = await executeToolCalls(result0.tool_calls!, toolCtx)
    const toolResultData = toolResults.map((tr) => {
      try { return JSON.parse(tr.content) } catch { return tr.content }
    })
    log(`tool results: ${toolResultData.length} — ${JSON.stringify(toolResultData).slice(0, 500)}`)

    // 8. Round 2 — feed tool results back to AI
    toolMessages.push({
      role: 'assistant',
      content: result0.text || '',
      tool_calls: result0.tool_calls,
    })
    for (const tr of toolResults) {
      toolMessages.push({
        role: 'tool' as const,
        content: tr.content,
        tool_call_id: tr.tool_call_id,
      })
    }

    const result1 = await generateReply({
      config,
      systemPrompt,
      messages: toolMessages,
      tools: toolDefs.length > 0 ? toolDefs : undefined,
    })

    const round1 = {
      text: result1.text,
      handoff: result1.handoff,
      toolCalls: result1.tool_calls?.map((tc) => ({
        name: tc.function.name,
        arguments: tc.function.arguments,
      })) ?? [],
    }
    log(`round1: text="${result1.text?.slice(0, 200) || ''}", handoff=${result1.handoff}, toolCalls=${round1.toolCalls.length}`)

    // 9. Check if tool response was captured
    let finalText = result1.text || ''
    let finalButtons: Array<{ id: string; title: string }> | null = null

    for (const tr of toolResults) {
      try {
        const parsed = JSON.parse(tr.content)
        if (parsed.buttons?.length > 0) {
          finalButtons = parsed.buttons
        }
        if (parsed.response && !finalText) {
          finalText = parsed.response
        }
      } catch {
        // not JSON
      }
    }

    return NextResponse.json({
      success: true,
      round0,
      round1,
      tools: toolDefs.map((t) => t.function.name),
      businessType,
      systemPromptPreview: systemPrompt.slice(0, 500),
      toolResults: toolResultData,
      finalText,
      finalButtons,
      logs,
    })
  } catch (err) {
    console.error('[ai-test-preview] error:', err)
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      },
      { status: 500 },
    )
  }
}

function configOwnerUserId(config: { apiKey: string }) {
  // This is a test — we don't need a real user ID
  return '00000000-0000-0000-0000-000000000000'
}
