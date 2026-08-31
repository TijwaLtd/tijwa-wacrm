# Catalogue Capability — Implementation Plan

## 1. Existing Architecture Findings

### What Already Exists and MUST Be Reused

| System | Status | Files |
|--------|--------|-------|
| **Offerings table** | ✅ Complete | `offerings`, `offering_categories`, `offering_media`, `offering_embeddings` tables |
| **Capability→Offering mapping** | ✅ Complete | `capability_offering_types` table, `get_allowed_offering_types()` RPC |
| **Catalog API** | ✅ Complete | `/api/offerings/*`, `/api/offerings/categories/*`, `/api/offerings/search` |
| **Catalog UI** | ✅ Complete | `catalog/page.tsx`, `catalog-form.tsx`, `category-manager.tsx` |
| **Orders/Bookings** | ✅ Complete | `orders`, `order_items`, `bookings` tables + API routes |
| **Flow Engine** | ✅ Complete | `engine.ts` with all 11 node types including `capability_action` |
| **Capability Nodes** | ✅ Complete | `capability_nodes` table + `capability-nodes.ts` registry |
| **Node Handler** | ✅ Complete | `node-handler.ts` with 25+ operation handlers |
| **Capability Templates** | ✅ Complete | 8 default flow templates |
| **Quick Replies** | ✅ Complete | Table, builder, flow linking via `flow_id` |
| **WhatsApp Messaging** | ✅ Complete | `meta-api.ts`, `send-message.ts`, `interactive.ts` |
| **AI Auto-Reply** | ✅ Complete | `auto-reply.ts` with knowledge retrieval |
| **Audit System** | ✅ Complete | `AuditService.record()` with 21 event types |
| **Business Capabilities** | ✅ Complete | `business_capabilities` table, `account_capabilities` |

### What's Missing (Gaps to Fill)

| Gap | Priority | Description |
|-----|----------|-------------|
| **Catalogue Service** | HIGH | Centralized service layer — node-handler currently has inline DB queries; need to extract into reusable service |
| **Normalized Catalogue Item** | HIGH | Common structure for internal offerings + future external items |
| **Source Adapter Interface** | MEDIUM | Abstract interface for internal DB vs future external APIs |
| **Presentation Service** | HIGH | Centralized WhatsApp presentation strategy (multi-product vs list vs single vs text) |
| **Multi-Product WhatsApp** | HIGH | Meta API `product_list` message type not yet implemented |
| **Independent Catalogue Handler** | HIGH | Intent detection when no flow matches but customer asks about catalogue |
| **Show Nodes** | MEDIUM | Dedicated `show_categories`, `show_items`, `show_item` nodes for cleaner flows |
| **AI Catalogue Access** | MEDIUM | AI tool/function to query catalogue service for real data |
| **External Adapter Contract** | LOW | Interface definition only — no providers needed yet |
| **Expanded Templates** | MEDIUM | Business-type-specific default templates using proper catalogue service |

---

## 2. Files/Modules That Will Be Reused (No Changes)

- `src/lib/flows/engine.ts` — Flow execution engine
- `src/lib/flows/types.ts` — Node type definitions
- `src/lib/flows/meta-send.ts` — WhatsApp message sending from flows
- `src/lib/flows/fallback.ts` — Fallback policy resolution
- `src/lib/flows/validate.ts` — Flow validation
- `src/lib/automations/engine.ts` — Automation execution
- `src/lib/automations/meta-send.ts` — WhatsApp message sending from automations
- `src/lib/whatsapp/meta-api.ts` — Meta API client (will EXTEND, not replace)
- `src/lib/whatsapp/send-message.ts` — Message orchestration
- `src/lib/whatsapp/interactive.ts` — Payload types and validation
- `src/lib/ai/auto-reply.ts` — AI dispatch (will EXTEND)
- `src/lib/ai/knowledge.ts` — Knowledge retrieval
- `src/lib/audit/service.ts` — Audit logging
- `src/lib/business/capabilities.ts` — Capability definitions
- `src/lib/business/offerings.ts` — Offering types and constants
- `src/lib/business/orders.ts` — Order/booking types
- `src/app/api/offerings/*` — All offering CRUD routes
- `src/app/api/orders/*` — All order routes
- `src/app/api/bookings/*` — All booking routes
- `src/components/catalog/*` — All catalog UI components
- `src/app/(dashboard)/catalog/*` — Catalog pages
- `src/components/flows/*` — Flow builder UI
- `src/components/automations/*` — Automation builder UI

---

## 3. Files/Modules That Need Modification

| File | Change |
|------|--------|
| `src/lib/flows/node-handler.ts` | Extract DB queries into catalogue service; handler becomes thin wrapper |
| `src/lib/flows/capability-templates.ts` | Update templates to use new show nodes and catalogue service |
| `src/lib/flows/types.ts` | Add new node types: `show_categories`, `show_items`, `show_item`, `check_catalog_availability` |
| `src/lib/flows/engine.ts` | Add execution cases for new node types |
| `src/lib/flows/templates.ts` | Add `capability_action` + new types to `FlowTemplateNodeType` |
| `src/lib/whatsapp/meta-api.ts` | Add `sendProductList()` for multi-product messages |
| `src/lib/whatsapp/interactive.ts` | Add `ProductListPayload` type and validation |
| `src/lib/ai/auto-reply.ts` | Add catalogue intent detection and service call |
| `src/lib/ai/defaults.ts` | Update system prompt to instruct AI to use catalogue service |
| `src/app/api/whatsapp/v1/webhook/[slug]/route.ts` | Add independent catalogue handler in pipeline |
| `src/lib/business/capabilities.ts` | Add catalogue-related capabilities if missing |
| `src/lib/business/capability-nodes.ts` | Add new node definitions for show_nodes |
| `src/components/flows/shared.tsx` | Add NODE_META entries for new node types |
| `src/components/flows/forms/node-config-form.tsx` | Add config forms for new node types |
| `supabase/migrations/071_catalogue_service.sql` | New tables/columns for catalogue service |

---

## 4. Database Changes Required

### New Migration: `071_catalogue_service.sql`

#### 4.1 Catalogue Sources Table
```sql
CREATE TABLE catalogue_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('internal', 'external')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'disabled')),
  config JSONB NOT NULL DEFAULT '{}',  -- For external: { provider, base_url, api_key_ref, capabilities }
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, name)
);
```

#### 4.2 Normalize existing offerings as internal catalogue source
- Add `source_id UUID REFERENCES catalogue_sources(id)` to `offerings` table
- Default NULL = internal (existing data)
- Future external items will reference their source

#### 4.3 Catalogue item availability (extensible)
```sql
CREATE TABLE catalogue_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  stock_count INTEGER,  -- NULL = not tracked
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(offering_id)
);
```

#### 4.4 Catalogue presentation config
```sql
ALTER TABLE tenant_settings ADD COLUMN IF NOT EXISTS catalogue_config JSONB NOT NULL DEFAULT '{
  "default_view": "list",
  "items_per_page": 10,
  "enable_multi_product": true,
  "show_prices": true,
  "show_availability": true
}'::jsonb;
```

---

## 5. New Catalogue Modules Required

### 5.1 Catalogue Service (`src/lib/business/catalogue-service.ts`)

Centralized service layer. All catalogue data access goes through here.

```
getCategories(accountId, params?) → Category[]
searchItems(accountId, query, params?) → CatalogueItem[]
getItems(accountId, params?) → CatalogueItem[]
getItem(accountId, itemId) → CatalogueItem | null
checkAvailability(accountId, itemId, dateRange?) → AvailabilityResult
getPrice(accountId, itemId, context?) → PriceResult
```

Uses existing `offerings` table queries (extracted from `node-handler.ts`).
Returns normalized `CatalogueItem` structure.

### 5.2 Normalized Catalogue Item (`src/lib/business/catalogue-types.ts`)

```typescript
interface CatalogueItem {
  id: string;
  sourceId: string | null;
  type: OfferingType;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  imageUrls: string[];
  price: number | null;
  currency: string | null;
  priceType: PriceType;
  availability: AvailabilityStatus;
  sku: string | null;
  metadata: Record<string, unknown>;
}

interface CatalogueCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  itemCount: number;
}

interface AvailabilityStatus {
  available: boolean;
  stockCount: number | null;
  message: string | null;
}

interface PriceResult {
  price: number | null;
  currency: string;
  priceType: PriceType;
  formatted: string;
}
```

### 5.3 Source Adapter Interface (`src/lib/business/catalogue-adapter.ts`)

```typescript
interface CatalogueAdapter {
  sourceType: 'internal' | 'external';
  getCategories(accountId: string, params?: CategoryParams): Promise<CatalogueCategory[]>;
  getItems(accountId: string, params?: ItemParams): Promise<CatalogueItem[]>;
  getItem(accountId: string, itemId: string): Promise<CatalogueItem | null>;
  searchItems(accountId: string, query: string, params?: SearchParams): Promise<CatalogueItem[]>;
  checkAvailability?(accountId: string, itemId: string, dateRange?: DateRange): Promise<AvailabilityResult>;
  getPrice?(accountId: string, itemId: string, context?: PriceContext): Promise<PriceResult>;
  supports(capability: string): boolean;
}

class InternalCatalogueAdapter implements CatalogueAdapter { ... }
// Future: class ExternalCatalogueAdapter implements CatalogueAdapter { ... }
```

### 5.4 Presentation Service (`src/lib/whatsapp/catalogue-presentation.ts`)

Centralized presentation strategy.

```typescript
interface PresentationStrategy {
  type: 'multi_product' | 'list' | 'buttons' | 'single_item' | 'text_fallback';
  payload: unknown;
}

function presentCatalogueItems(
  items: CatalogueItem[],
  context: PresentationContext
): PresentationStrategy

function presentCatalogueItem(
  item: CatalogueItem,
  context: PresentationContext
): PresentationStrategy

function presentCategories(
  categories: CatalogueCategory[],
  context: PresentationContext
): PresentationStrategy
```

Presentation context includes:
- WhatsApp capabilities (does the business have multi-product enabled?)
- Number of results
- Item type
- Available images
- Business config

### 5.5 Independent Catalogue Handler (`src/lib/business/catalogue-handler.ts`)

```typescript
function handleCatalogueIntent(params: {
  accountId: string;
  contactId: string;
  conversationId: string;
  messageText: string;
  intent: CatalogueIntent;
}): Promise<HandlerResult>

type CatalogueIntent = 
  | { type: 'browse_products' }
  | { type: 'browse_menu' }
  | { type: 'browse_services' }
  | { type: 'browse_courses' }
  | { type: 'browse_rooms' }
  | { type: 'browse_programs' }
  | { type: 'browse_properties' }
  | { type: 'search_items'; query: string }
  | { type: 'get_item'; itemName: string }
  | null;
```

Integrates into webhook pipeline:
1. Flows run first (existing)
2. Automations run second (existing)
3. **Catalogue intent detection** (NEW — between automations and AI)
4. AI auto-reply (existing)

---

## 6. Flow Nodes Required

### New Node Types

| Node | Type | Behavior | Config |
|------|------|----------|--------|
| `show_categories` | presentation | Fetches + displays categories as list/buttons | `{ output_var, next_node_key }` |
| `show_items` | presentation | Fetches + displays items as list/multi-product | `{ source_var, output_var, next_node_key }` |
| `show_item` | presentation | Fetches + displays single item detail | `{ source_var, output_var, next_node_key }` |
| `check_catalog_availability` | logic | Checks availability, stores result | `{ item_var, date_params, output_var, true_next, false_next }` |

### Updated Node Registry

```typescript
// In capability-nodes.ts — add to existing:
catalogue: [
  { node_key: 'show_categories', ... },
  { node_key: 'show_items', ... },
  { node_key: 'show_item', ... },
  { node_key: 'check_catalog_availability', ... },
]
```

### Updated Node Meta (Builder UI)

```typescript
// In shared.tsx — add:
show_categories: { label: 'Show Categories', icon: 'LayoutGrid', color: ..., category: 'catalogue' }
show_items: { label: 'Show Items', icon: 'Package', color: ..., category: 'catalogue' }
show_item: { label: 'Show Item Detail', icon: 'Eye', color: ..., category: 'catalogue' }
check_catalog_availability: { label: 'Check Availability', icon: 'CalendarCheck', color: ..., category: 'catalogue' }
```

---

## 7. WhatsApp Presentation Changes Required

### 7.1 Multi-Product Message (Meta API Extension)

Add to `meta-api.ts`:
```typescript
sendProductList(params: {
  accountId: string;
  userId: string;
  conversationId: string;
  contactId: string;
  bodyText: string;
  headerText?: string;
  sections: Array<{
    title?: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
      image_url?: string;  // Multi-product specific
    }>;
  }>;
}): Promise<{ whatsapp_message_id: string }>
```

Note: Meta's `product_list` type is available for businesses with catalogue enabled. Fall back to `sendInteractiveList` for businesses without it.

### 7.2 Presentation Strategy Implementation

```typescript
function selectPresentation(items, context): PresentationStrategy {
  // 1. If items have images + business supports multi-product → multi-product list
  // 2. If items ≤ 10 → standard list
  // 3. If items ≤ 3 → buttons
  // 4. If single item → text with detail
  // 5. Fallback → paginated text
}
```

### 7.3 Stable Reply IDs for Catalogue Selections

Use structured IDs:
```
cat:{category_id}        -- category selection
item:{offering_id}       -- item selection
page:{cursor}            -- pagination
order:{action}           -- order action (future)
```

Validation: all IDs resolved server-side, never trust client text matching.

---

## 8. Default Templates Required

### Updated Templates Using Catalogue Service

| Template | Business Type | Flow |
|----------|---------------|------|
| `default_browse_retail` | retailer/wholesaler | show_categories → show_items → show_item → handoff/order |
| `default_browse_restaurant` | restaurant/hotel_restaurant | show_categories (menu) → show_items → show_item → order |
| `default_browse_hotel` | hotel/hotel_restaurant | show_categories (rooms+menu+services) → show_items → show_item → check_availability → booking |
| `default_browse_services` | service_business/professional_services | show_categories → show_items → show_item → enquiry |
| `default_browse_education` | education | show_categories (courses/programs) → show_items → show_item → enquiry |
| `default_browse_ngo` | ngo_nonprofit | show_categories (programs/services/resources) → show_items → show_item → enquiry |
| `default_browse_property` | property_real_estate | show_categories → show_items → show_item → viewing |
| `default_browse_events` | events | show_categories → show_items → show_item → registration |
| `default_catalog_quick_reply` | any | Main navigation menu (existing, update) |
| `default_order_creation` | any | Order flow (existing, update) |
| `default_booking_flow` | any | Booking flow (existing, update) |

---

## 9. Independent Handler Integration Point

### Webhook Pipeline (Updated)

```
Inbound Message
    ↓
1. Quick Reply Flow Lookup (existing)
    ↓
2. Flow Dispatch (existing)
    ↓ [if not consumed]
3. Automation Triggers (existing)
    ↓ [if not consumed]
4. Catalogue Intent Detection (NEW)
    ├── Detect intent from message text
    ├── Check if account has catalogue capability
    ├── If catalogue intent + no active flow → route to Catalogue Handler
    └── If no catalogue intent → continue
    ↓
5. AI Auto-Reply (existing)
    ↓
6. Webhook Event (existing)
```

### Intent Detection Logic

```typescript
function detectCatalogueIntent(
  messageText: string,
  enabledCapabilities: string[]
): CatalogueIntent | null {
  // Keyword-based intent detection
  // Match against enabled capabilities
  // Return null if no match (let AI handle)
}
```

Keywords mapped to capabilities:
- `products, items, catalog, what do you sell` → products
- `menu, food, drink, eat` → menu
- `services, help with` → services
- `courses, classes, training` → courses
- `rooms, accommodation, stay, book` → accommodation/bookings
- `programs, initiatives` → programs
- `properties, house, apartment, rent` → property_listings

---

## 10. AI Integration

### AI Auto-Reply Enhancement

Add catalogue capability to AI:
1. AI detects customer wants catalogue info
2. AI calls `catalogueService.searchItems()` or `catalogueService.getItems()`
3. AI receives real data
4. AI incorporates data into response
5. AI never fabricates prices, names, or availability

Implementation:
- Add `catalogue_search` and `catalogue_get` as AI "tools" (not Meta-style tools, just structured prompts)
- Or: enhance knowledge retrieval to pull from offerings table directly
- Keep existing knowledge base for general business info

### AI System Prompt Update

Add to `defaults.ts`:
```
When a customer asks about products, services, menu items, or offerings:
1. Search the business catalogue for matching items
2. Present real data from the catalogue
3. Never invent product names, prices, or availability
4. If no items match, say so honestly
```

---

## 11. Testing Plan

### New Tests

| Module | Tests |
|--------|-------|
| `catalogue-service.ts` | CRUD, filtering, search, pagination, account isolation |
| `catalogue-types.ts` | Type validation, normalization |
| `catalogue-adapter.ts` | Internal adapter, capability support checks |
| `catalogue-presentation.ts` | Strategy selection, multi-product, list, buttons, fallback |
| `catalogue-handler.ts` | Intent detection, routing, account isolation |
| New flow nodes | Node execution, variable propagation, branching |
| Multi-product WhatsApp | Payload generation, validation, limits |
| Independent handler | Intent detection, flow precedence, no interruption |
| AI catalogue access | Real data retrieval, no fabrication |

### Regression Tests

- Run all existing flow tests (83 test files, 883 tests)
- Run all existing automation tests
- Run all existing quick reply tests
- Run all existing WhatsApp tests
- Run all existing AI tests
- Verify no breaking changes to existing functionality

### Security Tests

- Account isolation: cross-business catalogue access blocked
- Item ID validation: server-side verification of selected items
- No PII exposure in catalogue responses
- External credentials never exposed in frontend

---

## 12. Implementation Order

### Phase A: Foundation (No Breaking Changes)
1. Create `catalogue-types.ts` — normalized types
2. Create `catalogue-service.ts` — extract from node-handler
3. Create `catalogue-adapter.ts` — interface + internal adapter
4. Update `node-handler.ts` — use catalogue service
5. Add tests for catalogue service

### Phase B: Presentation
6. Create `catalogue-presentation.ts` — presentation strategy
7. Add `sendProductList()` to `meta-api.ts`
8. Add `ProductListPayload` to `interactive.ts`
9. Add presentation tests

### Phase C: Flow Nodes
10. Add new node types to `types.ts`
11. Add execution cases to `engine.ts`
12. Add node definitions to `capability-nodes.ts`
13. Add builder UI entries to `shared.tsx` and `node-config-form.tsx`
14. Add validation for new nodes in `validate.ts`
15. Add node tests

### Phase D: Templates
16. Update existing templates to use catalogue service
17. Add business-type-specific templates
18. Update `capability-templates.ts`
19. Add template tests

### Phase E: Independent Handler
20. Create `catalogue-handler.ts`
21. Add intent detection
22. Integrate into webhook pipeline
23. Add handler tests

### Phase F: AI Integration
24. Enhance AI with catalogue access
25. Update system prompt
26. Add AI catalogue tests

### Phase G: Database
27. Create migration `071_catalogue_service.sql`
28. Add `catalogue_sources` table
29. Add `catalogue_availability` table
30. Add `catalogue_config` to tenant_settings

### Phase H: Audit
31. Add new audit events: `CATALOGUE_ITEM_VIEWED`, `CATALOGUE_SEARCH`, `CATALOGUE_SOURCE_CONNECTED`
32. Integrate with existing audit service

### Phase I: Testing & Review
33. Run all new tests
34. Run regression tests
35. Architecture review — confirm no duplicate engines

---

## 13. Architecture Quality Checklist

After implementation, verify:

- [ ] ONE catalogue service (catalogue-service.ts)
- [ ] ONE presentation mechanism (catalogue-presentation.ts)
- [ ] ONE flow engine (existing engine.ts — extended, not replaced)
- [ ] ONE automation engine (existing — untouched)
- [ ] ONE messaging layer (existing meta-api.ts — extended)
- [ ] ONE audit system (existing AuditService — extended)
- [ ] ONE integration credential system (existing API keys)
- [ ] ONE quick reply system (existing — untouched)
- [ ] No duplicate list/button builders
- [ ] No duplicate catalogue data access paths
- [ ] No new automation/flow/messaging engines
- [ ] No payment system introduced
- [ ] No unnecessary sidebar sections
- [ ] All existing tests pass
- [ ] RLS enforced on all new tables
- [ ] Account isolation on all operations
