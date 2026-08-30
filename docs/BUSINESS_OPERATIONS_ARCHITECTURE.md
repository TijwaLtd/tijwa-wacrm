# BUSINESS OPERATIONS ARCHITECTURE REFERENCE

This document provides detailed implementation guidance for extending the Tijwa platform with business operations. It captures the patterns established in Phase 1 and the rules for future phases.

---

## EXISTING SYSTEMS (DO NOT DUPLICATE)

### Flows (src/lib/flows/)
- Conversational WhatsApp chatbot engine
- Nodes: start, send_message, send_buttons, send_list, send_media, collect_input, condition, set_tag, handoff, end
- Triggers: keyword, first_inbound_message, manual
- Runtime: flow_runs with state machine, vars, fallback_policy
- **Future business actions become flow nodes**

### Automations (src/lib/automations/)
- Event-driven automation engine
- Trigger types: message_received, tag_added, deal_created, etc.
- Steps: send_message, add_tag, remove_tag, create_deal, http_request, wait, condition
- **Future business events become automation triggers**

### Templates (src/lib/flows/templates.ts)
- Flow templates for common patterns
- **Future business templates plug into this system**

### Connections (src/app/api/account/api-keys/)
- API key authentication for external systems
- Scoped access (contacts_read, messages_write, etc.)
- **External system integrations use this, not a new system**

### Audit (src/lib/audit/)
- Event recording via AuditService.record()
- Categories: ACCESS, CONTACT, CONVERSATION, COMMUNICATION, DATA, AUTHENTICATION, ADMIN, BUSINESS
- **Capability changes already use this**

---

## CAPABILITY INTEGRATION PATTERNS

### Adding a New Capability

1. **Database**: Add to `business_capabilities` table
```sql
INSERT INTO business_capabilities (key, name, description, category, is_default_enabled, recommended_business_types, navigation)
VALUES ('my_capability', 'My Capability', 'Description', 'category', FALSE, '["hotel"]'::jsonb, '{"label": "My Capability", "icon": "IconName", "route": "/my-capability", "section": "operations"}'::jsonb);
```

2. **Sidebar Icon**: Add to `CAPABILITY_ICONS` in `sidebar.tsx`

3. **Business Type Recommendations**: Update `getRecommendedCapabilityKeys()` in `capabilities.ts`

4. **Navigation Route**: Create page at `/src/app/(dashboard)/my-capability/page.tsx`

5. **Auth Context**: Capabilities automatically available via `useAuth().capabilities`

### Making a Capability Do Something

**Phase 2+ Pattern:**
1. Add capability-specific pages/UI
2. Create API routes under `/api/business/my-capability/`
3. Add flow nodes/actions for the capability
4. Add automation triggers for capability events
5. Register flow nodes in `src/lib/flows/types.ts`

**Example - Bookings Capability:**
```
1. Database: bookings table (account_id, customer_id, start_time, end_time, status, metadata)
2. API: /api/business/bookings (CRUD)
3. Flow Node: check_availability, create_booking, cancel_booking
4. Automation Trigger: booking.created, booking.confirmed, booking.cancelled
5. UI: /src/app/(dashboard)/bookings/page.tsx
6. Sidebar: Shows when 'bookings' capability is enabled
```

### Integration with Existing Systems

**Flow Integration:**
- New node types extend `FlowNodeConfig` union in `src/lib/flows/types.ts`
- Engine handles new nodes in `src/lib/flows/engine.ts`
- Nodes use `config` JSONB for capability-specific data

**Automation Integration:**
- New trigger types extend automation trigger config
- Events fire via `AuditService.record()` or dedicated event emitters
- Steps execute via existing automation engine

**Template Integration:**
- New templates in `src/lib/flows/templates.ts`
- Templates are capability-oriented, not business-type-oriented
- Business types determine which templates to recommend

---

## DATA SOURCE PATTERNS (Phase 3+)

### Internal Data
```typescript
// Capability manages its own data
const { data } = await supabase
  .from('bookings')
  .select('*')
  .eq('account_id', accountId);
```

### External Data
```typescript
// Capability uses existing API key connection
const { data: apiKey } = await supabase
  .from('api_keys')
  .select('*')
  .eq('account_id', accountId)
  .eq('scopes', 'bookings_read')
  .single();

// Call external system
const response = await fetch('https://external-pms.com/api/bookings', {
  headers: { 'Authorization': `Bearer ${apiKey.key_hash}` }
});
```

### Hybrid Data
```typescript
// Some data from Tijwa, some from external
const internalBookings = await supabase.from('bookings').select('*');
const externalAvailability = await fetchExternalPMS Availability();
// Merge in UI or API route
```

---

## NAVIGATION INTEGRATION

### How Sidebar Works
1. `useAuth()` returns `capabilities` array (from auth context)
2. Sidebar filters `capabilities.filter(c => c.is_enabled && c.navigation)`
3. Groups by `navigation.section` (catalog, operations, settings)
4. Renders with icon from `CAPABILITY_ICONS[nav.icon]`

### Adding Navigation for a Capability
1. Add `navigation` JSONB to `business_capabilities` row
2. Add icon to `CAPABILITY_ICONS` in `sidebar.tsx`
3. Create page at the route specified in navigation
4. Navigation appears automatically when capability is enabled

### Navigation Sections
- **catalog**: Things the business offers (products, menu items, rooms, courses)
- **operations**: Actions the business takes (orders, bookings, applications)
- **settings**: Configuration items (not used for most capabilities)

---

## MULTI-TENANCY PATTERNS

### RLS Pattern for New Tables
```sql
-- Parent table with account_id
CREATE TABLE my_capability_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- ... other columns
);

-- RLS policies
ALTER TABLE my_capability_data ENABLE ROW LEVEL SECURITY;

-- Viewer+ can read
CREATE POLICY my_capability_data_select ON my_capability_data
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Agent+ can modify
CREATE POLICY my_capability_data_modify ON my_capability_data
  FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));
```

### Child Table Pattern (parent-join)
```sql
CREATE TABLE my_capability_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_data_id UUID NOT NULL REFERENCES my_capability_data(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- ...
);

-- RLS via parent join
CREATE POLICY my_capability_items_select ON my_capability_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM my_capability_data d
      WHERE d.id = my_capability_items.capability_data_id
        AND has_role_in_account(auth.uid(), d.account_id)
    )
  );
```

---

## FLOW INTEGRATION PATTERNS

### Adding a Flow Node

1. **Define node type** in `src/lib/flows/types.ts`:
```typescript
export interface CheckAvailabilityNodeConfig {
  capability_key: string;
  params: Record<string, unknown>;
  true_next: string;
  false_next: string;
}

// Add to FlowNodeConfig union
| { node_type: "check_availability"; config: CheckAvailabilityNodeConfig }
```

2. **Add node type to DB** (migration):
```sql
ALTER TABLE flow_nodes
  DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;
ALTER TABLE flow_nodes
  ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type IN ('start', 'send_buttons', ..., 'check_availability'));
```

3. **Handle in engine** (`src/lib/flows/engine.ts`):
```typescript
case "check_availability": {
  // Execute capability action
  const available = await checkAvailability(node.config);
  // Advance to appropriate next node
  return available ? node.config.true_next : node.config.false_next;
}
```

4. **Add to validator** (`src/lib/flows/validate.ts`)

5. **Add to flow builder UI** (`src/components/flows/flow-builder.tsx`)

### Adding an Automation Trigger

1. **Define trigger type** in automation trigger config
2. **Fire event** when capability action occurs:
```typescript
await AuditService.record({
  eventType: 'BOOKING_CREATED',
  accountId,
  actorUserId,
  metadata: { booking_id: booking.id }
});
```

3. **Handle in automation engine** (`src/lib/automations/engine.ts`)

---

## TESTING PATTERNS

### Unit Tests
- Test capability helpers in `src/lib/business/capabilities.test.ts`
- Test business type → capability mappings
- Test navigation item generation

### Integration Tests
- Test API routes with mock auth
- Test RLS policies with different roles
- Test capability CRUD operations

### E2E Tests (Future)
- Test onboarding flow with business type selection
- Test sidebar shows correct nav items per capability
- Test capability toggles in settings

---

## COMMON PITFALLS TO AVOID

1. **DO NOT** create a new automation/flow engine for business operations
2. **DO NOT** duplicate the API key/connection system
3. **DO NOT** hardcode business-type-specific navigation
4. **DO NOT** bypass RLS or tenant isolation
5. **DO NOT** create placeholder UI screens that do nothing
6. **DO NOT** assume every organization needs products/inventory
7. **DO NOT** create separate tables for each business type's data

---

## FUTURE PHASE CHECKLIST

When implementing Phase 2+:

- [ ] Does this extend existing Flows/Automations?
- [ ] Does this use existing Connections/API keys for external data?
- [ ] Does this respect multi-tenancy (account_id, RLS)?
- [ ] Does this integrate with audit system?
- [ ] Does this add to business_capabilities table?
- [ ] Does this add navigation to sidebar?
- [ ] Does this work for NGO (no products)?
- [ ] Does this work for Hotel (multiple capabilities)?
- [ ] Is this capability-driven, not business-type-driven?
