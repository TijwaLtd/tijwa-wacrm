// ============================================================
// AI Tool System — Types & Interfaces
//
// Tools let the AI execute real business operations instead of
// just generating text. The AI decides which tools to call based
// on the conversation, and the server executes them.
// ============================================================

/** OpenAI-compatible tool definition */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, ToolParameter>
      required?: string[]
    }
  }
}

export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
  items?: { type: string; properties?: Record<string, ToolParameter> }
  properties?: Record<string, ToolParameter>
}

/** A tool call returned by the AI */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string // JSON string
  }
}

/** Result of executing a tool */
export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  content: string // JSON string
}

/** Context passed to every tool execution */
export interface ToolContext {
  db: any // SupabaseClient
  accountId: string
  conversationId: string
  contactId: string
  contactPhone: string | null
  contactName: string | null
  businessType: string | null
  userId: string // config owner user ID
}

/** A tool handler function */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<unknown>

/** Registered tool with its definition and handler */
export interface RegisteredTool {
  definition: ToolDefinition
  handler: ToolHandler
}
