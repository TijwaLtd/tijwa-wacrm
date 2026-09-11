// ============================================================
// Tool Executor — Dispatches AI tool calls to handlers
//
// The executor:
// 1. Receives tool_calls from the AI response
// 2. Looks up the handler for each tool
// 3. Executes them with the ToolContext
// 4. Returns ToolResult[] for the next AI round
// ============================================================

import type { ToolCall, ToolContext, ToolResult, RegisteredTool } from './types'
import { logisticsTools, logisticsToolHandlers } from './logistics'
import { restaurantTools, restaurantToolHandlers } from './restaurant'
import { hotelTools, hotelToolHandlers } from './hotel'
import { retailerTools, retailerToolHandlers } from './retailer'
import { serviceTools, serviceToolHandlers } from './services'

// ============================================================
// Tool Registry — business type → tools mapping
// ============================================================

const toolRegistry: Record<string, RegisteredTool[]> = {}

/** Get tools available for a given business type */
export function getToolsForBusinessType(businessType: string | null): RegisteredTool[] {
  const key = businessType || 'default'
  if (toolRegistry[key]) return toolRegistry[key]

  // Build registry on first call
  const tools: RegisteredTool[] = []

  // Logistics tools for delivery/courier businesses
  if (
    !businessType ||
    businessType === 'courier' ||
    businessType === 'logistics_delivery'
  ) {
    for (const def of logisticsTools) {
      const handler = logisticsToolHandlers[def.function.name]
      if (handler) {
        tools.push({ definition: def, handler })
      }
    }
  }

  // Restaurant tools
  if (
    !businessType ||
    businessType === 'restaurant' ||
    businessType === 'hotel_restaurant'
  ) {
    for (const def of restaurantTools) {
      const handler = restaurantToolHandlers[def.function.name]
      if (handler) {
        tools.push({ definition: def, handler })
      }
    }
  }

  // Hotel tools
  if (
    !businessType ||
    businessType === 'hotel' ||
    businessType === 'hotel_restaurant'
  ) {
    for (const def of hotelTools) {
      const handler = hotelToolHandlers[def.function.name]
      if (handler) {
        tools.push({ definition: def, handler })
      }
    }
  }

  // Retailer / Wholesaler tools
  if (
    !businessType ||
    businessType === 'retailer' ||
    businessType === 'wholesaler'
  ) {
    for (const def of retailerTools) {
      const handler = retailerToolHandlers[def.function.name]
      if (handler) {
        tools.push({ definition: def, handler })
      }
    }
  }

  // Service business tools (salon, gym, clinic, cleaning, etc.)
  if (
    !businessType ||
    businessType === 'service_business' ||
    businessType === 'professional_services' ||
    businessType === 'cleaning_services' ||
    businessType === 'maintenance' ||
    businessType === 'beauty_wellness' ||
    businessType === 'fitness' ||
    businessType === 'automotive' ||
    businessType === 'pet_services' ||
    businessType === 'healthcare' ||
    businessType === 'healthcare_clinic'
  ) {
    for (const def of serviceTools) {
      const handler = serviceToolHandlers[def.function.name]
      if (handler) {
        tools.push({ definition: def, handler })
      }
    }
  }

  // Always include search_offerings for any business type
  if (!tools.find((t) => t.definition.function.name === 'search_offerings')) {
    const searchDef = logisticsTools.find((t) => t.function.name === 'search_offerings')
    const searchHandler = logisticsToolHandlers['search_offerings']
    if (searchDef && searchHandler) {
      tools.push({ definition: searchDef, handler: searchHandler })
    }
  }

  toolRegistry[key] = tools
  return tools
}

/** Get tool definitions in OpenAI format */
export function getToolDefinitions(businessType: string | null): Array<{ type: 'function'; function: any }> {
  return getToolsForBusinessType(businessType).map((t) => ({
    type: 'function' as const,
    function: t.definition.function,
  }))
}

/** Get a tool handler by name */
function getToolHandler(name: string, businessType: string | null): RegisteredTool['handler'] | null {
  const tool = getToolsForBusinessType(businessType).find((t) => t.definition.function.name === name)
  return tool?.handler || null
}

// ============================================================
// Tool Execution
// ============================================================

/**
 * Execute a list of tool calls and return results.
 * Each tool runs independently — failures return error results,
 * not exceptions, so the AI can handle them gracefully.
 */
export async function executeToolCalls(
  toolCalls: ToolCall[],
  ctx: ToolContext,
): Promise<ToolResult[]> {
  const results: ToolResult[] = []

  for (const tc of toolCalls) {
    const { id, function: fn } = tc

    let args: Record<string, unknown>
    try {
      args = JSON.parse(fn.arguments)
    } catch {
      results.push({
        tool_call_id: id,
        role: 'tool',
        content: JSON.stringify({ error: 'Invalid JSON in tool arguments' }),
      })
      continue
    }

    const handler = getToolHandler(fn.name, ctx.businessType)
    if (!handler) {
      results.push({
        tool_call_id: id,
        role: 'tool',
        content: JSON.stringify({ error: `Unknown tool: ${fn.name}` }),
      })
      continue
    }

    try {
      const result = await handler(args, ctx)
      results.push({
        tool_call_id: id,
        role: 'tool',
        content: typeof result === 'string' ? result : JSON.stringify(result),
      })
    } catch (err) {
      console.error(`[tool executor] Error in ${fn.name}:`, err)
      results.push({
        tool_call_id: id,
        role: 'tool',
        content: JSON.stringify({
          error: 'Tool execution failed',
          details: err instanceof Error ? err.message : String(err),
        }),
      })
    }
  }

  return results
}

/**
 * Check if the AI response contains tool calls.
 * Returns true if we should loop (the AI wants to call tools).
 */
export function hasToolCalls(response: { tool_calls?: any[] }): boolean {
  return !!(response.tool_calls && response.tool_calls.length > 0)
}
