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
import { propertyTools, propertyToolHandlers } from './property'
import { ngoTools, ngoToolHandlers } from './ngo'

// ============================================================
// Tool Registry — capability-first, business-type fallback
// ============================================================

const toolRegistry: Record<string, RegisteredTool[]> = {}

export type CapabilityInput = string[] | null | undefined

/**
 * Decide whether a domain toolset is active.
 * - If capabilities are known (array): capability keys win (capability-driven).
 * - If capabilities are unknown (undefined/null): fall back to business type.
 * - No business type + unknown capabilities → inactive (never load everything).
 */
function domainActive(
  businessType: string | null,
  capabilities: CapabilityInput,
  types: string[],
  capabilityKeys: string[],
): boolean {
  if (capabilities) return capabilityKeys.some((k) => capabilities.includes(k))
  if (!businessType) return false
  return types.includes(businessType)
}

/** Get tools available for a given business type + enabled capabilities */
export function getToolsForBusinessType(
  businessType: string | null,
  capabilities?: CapabilityInput,
): RegisteredTool[] {
  const capsKey = capabilities ? [...capabilities].sort().join(',') : 'unknown'
  const key = `${businessType || 'default'}|${capsKey}`
  if (toolRegistry[key]) return toolRegistry[key]

  // Build registry on first call
  const tools: RegisteredTool[] = []

  const addDomain = (domainTools: typeof logisticsTools, domainHandlers: typeof logisticsToolHandlers) => {
    for (const def of domainTools) {
      const handler = domainHandlers[def.function.name]
      if (handler) {
        tools.push({ definition: def, handler })
      }
    }
  }

  // Logistics tools for delivery/courier businesses
  if (
    domainActive(
      businessType,
      capabilities,
      ['courier', 'logistics_delivery', 'transportation'],
      ['delivery'],
    )
  ) {
    addDomain(logisticsTools, logisticsToolHandlers)
  }

  // Restaurant tools
  if (
    domainActive(
      businessType,
      capabilities,
      ['restaurant', 'hotel_restaurant'],
      ['menu', 'food_orders'],
    )
  ) {
    addDomain(restaurantTools, restaurantToolHandlers)
  }

  // Hotel tools
  if (
    domainActive(
      businessType,
      capabilities,
      ['hotel', 'hotel_restaurant'],
      ['accommodation'],
    )
  ) {
    addDomain(hotelTools, hotelToolHandlers)
  }

  // Retailer / Wholesaler tools
  if (
    domainActive(
      businessType,
      capabilities,
      ['retailer', 'wholesaler'],
      ['products', 'product_catalog'],
    )
  ) {
    addDomain(retailerTools, retailerToolHandlers)
  }

  // Service business tools (salon, gym, clinic, cleaning, etc.)
  if (
    domainActive(
      businessType,
      capabilities,
      [
        'service_business', 'professional_services', 'cleaning_services',
        'maintenance', 'beauty_wellness', 'fitness', 'automotive',
        'pet_services', 'healthcare', 'healthcare_clinic',
      ],
      ['services', 'appointments'],
    )
  ) {
    addDomain(serviceTools, serviceToolHandlers)
  }

  // Property / Real Estate tools
  if (
    domainActive(
      businessType,
      capabilities,
      ['property_real_estate'],
      ['property_listings'],
    )
  ) {
    addDomain(propertyTools, propertyToolHandlers)
  }

  // NGO / Nonprofit tools
  if (
    domainActive(
      businessType,
      capabilities,
      ['ngo_nonprofit'],
      ['programs', 'ngo_services'],
    )
  ) {
    addDomain(ngoTools, ngoToolHandlers)
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
export function getToolDefinitions(
  businessType: string | null,
  capabilities?: CapabilityInput,
): Array<{ type: 'function'; function: any }> {
  return getToolsForBusinessType(businessType, capabilities).map((t) => ({
    type: 'function' as const,
    function: t.definition.function,
  }))
}

/** Get a tool handler by name */
function getToolHandler(
  name: string,
  businessType: string | null,
  capabilities?: CapabilityInput,
): RegisteredTool['handler'] | null {
  const tool = getToolsForBusinessType(businessType, capabilities).find(
    (t) => t.definition.function.name === name,
  )
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

    const handler = getToolHandler(fn.name, ctx.businessType, ctx.capabilities)
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
