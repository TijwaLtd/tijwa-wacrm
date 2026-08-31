# Phase 3 Plan: Capability Nodes, Default Flows & Business Operations

## Architecture Understanding

### Existing Systems (DO NOT REPLACE)

**Flow Engine** (`src/lib/flows/engine.ts` — 1142 lines):
- Node graph execution: walk `flow_nodes` by `node_key` edges
- Node types: `start`, `send_message`, `send_buttons`, `send_list`, `send_media`, `collect_input`, `condition`, `set_tag`, `handoff`, `end`
- Auto-advance nodes chain without pausing; suspending nodes wait for customer reply
- Flows matched to incoming messages via keyword/first_inbound triggers
- Flow runs persist state in `flow_runs` with `vars`, `current_node_key`
- Template system: 3 starter templates (welcome_menu, faq_bot, lead_capture)

**Automation Engine** (`src/lib/automations/engine.ts` — 845 lines):
- Linear step execution with condition branching
- Trigger types: `new_message_received`, `keyword_match`, `first_inbound_message`, `new_contact_created`, `interactive_reply`, `tag_added`, `conversation_assigned`, `time_based`
- Step types: `send_message`, `send_buttons`, `send_list`, `send_template`, `add_tag`, `remove_tag`, `assign_conversation`, `update_contact_field`, `create_deal`, `wait`, `condition`, `send_webhook`, `close_conversation`
- Flows checked FIRST; if flow consumes, automation triggers suppressed

**WhatsApp Messaging** (`src/lib/flows/meta-send.ts`, `src/lib/whatsapp/meta-api.ts`):
- `engineSendText()`, `engineSendInteractiveButtons()`, `engineSendInteractiveList()`, `engineSendMedia()`
- Interactive buttons: 1-3 buttons, each with `reply_id` → `next_node_key`
- Interactive lists: 1-10 rows across sections, each with `reply_id` → `next_node_key`

### What Phase 3 Must Build

1. **Capability Node Registry** — register nodes per capability
2. **Capability Node Types** — new node types for business operations
3. **Node Service Layer** — business services that nodes call (not raw SQL)
4. **Default Flow Templates** — system-owned, non-deletable, per capability
5. **Flow Resolution** — custom flow priority → default flow → fallback
6. **Flow Builder Integration** — show capability nodes in builder when capability enabled
7. **Capability Disable Handling** — nodes unavailable for new flows, existing flows warned

---

## Implementation Plan

### Step 1: Database Migration — Default Flow Tracking

**File**: `supabase/migrations/070_capability_nodes_and_defaults.sql`

Add columns to `flows` table to distinguish system defaults from user flows:

```sql
ALTER TABLE flows ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN DEFAULT FALSE;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS system_template_key TEXT UNIQUE;
ALTER TABLE flows ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1;
```

- `is_system_default = true` → non-deletable, system-owned
- `system_template_key` → stable identifier like `catalog.list_products`
- `template_version` → for future versioning

Also add a capability nodes registry table:

```sql
CREATE TABLE IF NOT EXISTS capability_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capability_key TEXT NOT NULL REFERENCES business_capabilities(key),
  node_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,  -- 'read', 'search', 'check', 'action', 'communication'
  input_schema JSONB DEFAULT '{}',
  output_schema JSONB DEFAULT '{}',
  handler TEXT NOT NULL,    -- function name in the service layer
  UNIQUE(capability_key, node_key)
);
```

Seed initial capability nodes for each capability.

### Step 2: Capability Node Types

**File**: `src/lib/flows/capability-node-types.ts`

Define new node types that extend the existing `FlowNodeConfig` union:

```typescript
// New node types for capability operations
type CapabilityNodeConfig =
  | { node_type: "capability_action"; config: CapabilityActionNodeConfig }
  | { node_type: "capability_render"; config: CapabilityRenderNodeConfig };

interface CapabilityActionNodeConfig {
  operation_key: string;  // e.g. "catalog.list", "orders.create"
  input_params: Record<string, string>;  // mapped from vars
  output_var: string;     // where to store result in run.vars
  next_node_key: string;
}

interface CapabilityRenderNodeConfig {
  operation_key: string;
  render_template: string;  // or reference to a template
  output_var: string;
  next_node_key: string;
}
```

**Why `capability_action` + `capability_render` (not per-operation node types):**
- Avoids creating 20+ node types for every operation
- Single generic node that dispatches to a service handler
- The handler knows how to fetch data, the node just routes

### Step 3: Capability Node Registry

**File**: `src/lib/business/capability-nodes.ts`

Central registry mapping capability keys to their available nodes:

```typescript
interface CapabilityNodeDefinition {
  node_key: string;
  name: string;
  description: string;
  category: 'read' | 'search' | 'check' | 'action' | 'communication';
  capability_key: string;
  operation_key: string;
  handler: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
}

const CAPABILITY_NODES: Record<string, CapabilityNodeDefinition[]> = {
  products: [
    { node_key: 'get_products', name: 'Get Products', category: 'read', operation_key: 'catalog.list', handler: 'catalogService.list', ... },
    { node_key: 'get_product', name: 'Get Product', category: 'read', operation_key: 'catalog.get', handler: 'catalogService.get', ... },
    { node_key: 'search_products', name: 'Search Products', category: 'search', operation_key: 'catalog.search', handler: 'catalogService.search', ... },
    { node_key: 'get_categories', name: 'Get Categories', category: 'read', operation_key: 'catalog.categories', handler: 'catalogService.categories', ... },
  ],
  orders: [
    { node_key: 'create_order', name: 'Create Order', category: 'action', operation_key: 'orders.create', handler: 'orderService.create', ... },
    { node_key: 'get_order', name: 'Get Order', category: 'read', operation_key: 'orders.get', handler: 'orderService.get', ... },
  ],
  menu: [...],
  accommodation: [...],
  bookings: [...],
  services: [...],
  programs: [...],
  courses: [...],
  properties: [...],
};
```

### Step 4: Node Service Layer

**File**: `src/lib/business/node-services/catalog-service.ts`

Each service handles one domain. Returns structured data (not WhatsApp text):

```typescript
export async function listProducts(accountId: string, params: {
  category?: string;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<{
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    currency: string;
    image_url: string | null;
    category: string | null;
  }>;
  total: number;
  page: number;
}> { ... }
```

Other services:
- `order-service.ts` — create_order, get_order
- `booking-service.ts` — create_booking, check_availability
- `menu-service.ts` — list_menu, get_menu_item
- `program-service.ts` — list_programs, get_program
- `course-service.ts` — list_courses, get_course
- `property-service.ts` — list_properties, get_property

**Key rule**: Services return structured data. They do NOT format WhatsApp messages.

### Step 5: Node Handler Dispatcher

**File**: `src/lib/flows/node-handler.ts`

Routes `capability_action` nodes to the right service:

```typescript
export async function executeCapabilityNode(params: {
  operation_key: string;
  input_params: Record<string, unknown>;
  accountId: string;
  contactId?: string;
  vars: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  switch (params.operation_key) {
    case 'catalog.list': return catalogService.listProducts(params.accountId, params.input_params);
    case 'catalog.get': return catalogService.getProduct(params.accountId, params.input_params);
    case 'catalog.search': return catalogService.searchProducts(params.accountId, params.input_params);
    case 'orders.create': return orderService.createOrder(params.accountId, params.input_params);
    // ... etc
  }
}
```

### Step 6: Engine Integration

**File**: `src/lib/flows/engine.ts` (extend existing)

Add cases to `advanceFromNodeKey` for the new node types:

```typescript
if (node.node_type === 'capability_action') {
  const cfg = node.config as CapabilityActionNodeConfig;
  // Resolve input params from run.vars
  const resolvedInput = resolveParams(cfg.input_params, run.vars);
  // Execute via handler
  const result = await executeCapabilityNode({
    operation_key: cfg.operation_key,
    input_params: resolvedInput,
    accountId: run.account_id,
    contactId: run.contact_id ?? undefined,
    vars: run.vars,
  });
  // Store result in vars
  run.vars[cfg.output_var] = result;
  // Update flow_runs.vars in DB
  await db.from('flow_runs').update({ vars: run.vars }).eq('id', run.id);
  currentKey = cfg.next_node_key;
  continue;
}
```

Also update `isAutoAdvancing()` to include `capability_action`.

### Step 7: Default Flow Templates

**File**: `src/lib/flows/capability-templates.ts`

System-provided templates for each capability:

```typescript
const CAPABILITY_TEMPLATES: Record<string, FlowTemplate[]> = {
  products: [
    {
      slug: 'default_browse_products',
      name: 'Browse Products',
      description: 'Show products when customer asks about offerings',
      trigger_type: 'keyword',
      trigger_config: { keywords: ['products', 'items', 'catalog', 'what do you sell'], match_type: 'contains' },
      nodes: [
        // start → capability_action(catalog.list) → condition(items?) → send_list(items) → end
        // OR → send_message(no items) → end
      ],
    },
  ],
  orders: [...],
  menu: [...],
  accommodation: [...],
  // etc
};
```

### Step 8: Default Flow Installation

When a capability is enabled:
1. Check if default flow template exists for that capability
2. If not installed → clone template into `flows` + `flow_nodes` with `is_system_default = true`
3. Set `status = 'active'` so it works immediately
4. Idempotent — running again doesn't duplicate

When a capability is disabled:
1. Set default flows to `status = 'archived'` (not deleted)
2. User's custom flows remain active

### Step 9: Flow Resolution

**File**: `src/lib/flows/resolve.ts`

When a customer message comes in:

```typescript
export async function resolveFlow(accountId: string, message: ParsedInbound, isFirstInbound: boolean) {
  // 1. Check for existing active run (already handled by engine)
  
  // 2. Check for custom flows matching trigger
  const customFlow = await findCustomFlow(accountId, message, isFirstInbound);
  if (customFlow) return customFlow;
  
  // 3. Check for enabled default flows matching trigger
  const defaultFlow = await findDefaultFlow(accountId, message, isFirstInbound);
  if (defaultFlow) return defaultFlow;
  
  // 4. No match → return null (triggers existing fallback)
  return null;
}
```

This integrates with the existing `findEntryFlow` in the engine.

### Step 10: Builder Integration

Extend the flow builder UI to show capability nodes:

- Load enabled capabilities for the account
- Filter `capability_nodes` by enabled capabilities
- Show under "Business Operations" section in the node palette
- When a capability node is added, auto-configure `operation_key` and `input_schema`

### Step 11: Capability Disable Handling

When a capability is disabled:
- Its nodes remain in existing flows (don't break them)
- New flow construction can't add those nodes
- Flow validator warns if a flow uses nodes from disabled capabilities

---

## File Changes Summary

### New Files
1. `supabase/migrations/070_capability_nodes_and_defaults.sql` — DB changes
2. `src/lib/business/capability-nodes.ts` — Node registry
3. `src/lib/business/node-services/catalog-service.ts` — Product/offering service
4. `src/lib/business/node-services/order-service.ts` — Order service
5. `src/lib/business/node-services/booking-service.ts` — Booking service
6. `src/lib/business/node-services/menu-service.ts` — Menu service
7. `src/lib/business/node-services/program-service.ts` — Program service
8. `src/lib/business/node-services/course-service.ts` — Course service
9. `src/lib/business/node-services/property-service.ts` — Property service
10. `src/lib/flows/capability-node-types.ts` — New node type definitions
11. `src/lib/flows/node-handler.ts` — Handler dispatcher
12. `src/lib/flows/capability-templates.ts` — Default flow templates
13. `src/lib/flows/resolve.ts` — Flow resolution logic
14. `src/lib/flows/capability-templates.test.ts` — Template tests

### Modified Files
1. `src/lib/flows/types.ts` — Add `capability_action` to `FlowNodeConfig`
2. `src/lib/flows/engine.ts` — Handle `capability_action` in advance loop + update `isAutoAdvancing`
3. `src/lib/flows/templates.ts` — Export type for template node
4. `src/lib/flows/validate.ts` — Validate capability nodes
5. `src/app/api/flows/route.ts` — Handle default flow installation on capability enable
6. `src/components/flows/flow-builder.tsx` — Show capability nodes in palette

### Tests
1. Node handler unit tests
2. Service layer tests
3. Default flow template tests
4. Flow resolution tests
5. Capability disable tests
6. Regression tests for existing flows/automations

---

## Execution Order

1. **Migration** (070) — add columns, capability_nodes table
2. **Types** — add `capability_action` to FlowNodeConfig
3. **Node registry** — capability-nodes.ts
4. **Services** — all node-services (can be done in parallel)
5. **Handler dispatcher** — node-handler.ts
6. **Engine integration** — extend advanceFromNodeKey
7. **Templates** — capability-templates.ts
8. **Flow resolution** — resolve.ts
9. **Default flow installation** — API integration
10. **Builder UI** — show capability nodes
11. **Tests** — all new code
12. **Update AGENTS.md**
