<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# TIJWA BUSINESS OPERATIONS ARCHITECTURE

## Phase 1 + 2 + 3 Implementation Complete

### Critical Architecture Rules

1. **Capability-driven, not business-type-driven** - Business type recommends capabilities. Capabilities determine features.
2. **Never replace existing systems** - Flows, Automations, Templates, Connections, Audit all exist. Extend them, never duplicate.
3. **Multi-tenant isolation** - All data uses `account_id` with RLS via `has_role_in_account()` or `is_account_member()`.
4. **Capabilities are persisted in auth context** - All UI components read from `useAuth()` hook, not individual fetches.
5. **`has_role_in_account()` takes a single role enum** - NOT an array. `'agent'` = owner+admin+agent, `'admin'` = owner+admin. This is a hierarchy check (owner≥admin≥agent≥viewer).

---

## DATABASE SCHEMA

### Existing Tables (DO NOT MODIFY core structure)
- `accounts` - Multi-tenant workspace (id, name, owner_user_id, default_currency, business_type, subdomain)
- `account_memberships` - User-account linking (user_id, account_id, role)
- `account_role_enum` - owner, admin, agent, viewer
- `profiles` - User profiles (user_id, full_name, email, account_id, account_role)
- `tenant_settings` - Plan, subscription, branding per account

### New Tables (Phase 1)
```sql
-- System-level capability definitions (immutable by orgs)
business_capabilities (
  id UUID PRIMARY KEY,
  key TEXT UNIQUE,           -- e.g. 'bookings', 'menu', 'products'
  name TEXT,
  description TEXT,
  category TEXT,             -- commerce, food_hospitality, services, education, ngo, property, events, general
  is_default_enabled BOOLEAN,
  supported_actions JSONB,
  recommended_business_types JSONB,  -- ['hotel', 'hotel_restaurant']
  navigation JSONB           -- {label, icon, route, section}
)

-- Organization capability configuration
account_capabilities (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id),
  capability_key TEXT REFERENCES business_capabilities(key),
  is_enabled BOOLEAN,
  config JSONB,
  UNIQUE(account_id, capability_key)
)
```

### New Tables (Phase 2 - Catalog/Offerings)
```sql
-- Universal offering table (products, services, rooms, courses, programs, etc.)
offerings (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  type offering_type NOT NULL,     -- product, service, room, menu_item, course, program, property, etc.
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  short_description TEXT,
  description TEXT,
  status offering_status NOT NULL DEFAULT 'draft',
  category_id UUID REFERENCES offering_categories(id),
  price NUMERIC(12,2),
  currency TEXT DEFAULT 'USD',
  price_type price_types NOT NULL DEFAULT 'fixed',
  reference_code TEXT,
  external_provider TEXT,
  external_id TEXT,
  metadata JSONB DEFAULT '{}',     -- Type-specific attributes
  UNIQUE(account_id, slug)
)

-- Offering categories (global + org-specific)
offering_categories (
  id UUID PRIMARY KEY,
  account_id UUID,                 -- NULL = global/system category
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES offering_categories(id),
  sort_order INTEGER DEFAULT 0,
  UNIQUE(account_id, slug)
)

-- Offering media (images)
offering_media (
  id UUID PRIMARY KEY,
  offering_id UUID REFERENCES offerings(id) ON DELETE CASCADE,
  account_id UUID,
  url TEXT NOT NULL,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  is_primary BOOLEAN DEFAULT FALSE
)

-- AI embeddings for image search
offering_embeddings (
  id UUID PRIMARY KEY,
  offering_id UUID REFERENCES offerings(id) ON DELETE CASCADE,
  account_id UUID,
  image_url TEXT,
  embedding vector(512),
  description_embedding vector(512),
  vision_description TEXT
)

-- Maps capabilities to allowed offering types
capability_offering_types (
  capability_key TEXT,
  offering_type offering_type,
  PRIMARY KEY (capability_key, offering_type)
)
```

### New Tables (Phase 3 - Orders & Bookings)
```sql
-- Customer orders
orders (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,      -- Auto-generated: ORD-00001
  contact_id UUID,
  status order_status DEFAULT 'pending',  -- pending, confirmed, processing, shipped, delivered, cancelled
  currency TEXT DEFAULT 'USD',
  subtotal NUMERIC(12,2) DEFAULT 0,
  tax_amount NUMERIC(12,2) DEFAULT 0,
  discount_amount NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  UNIQUE(account_id, order_number)
)

-- Order line items
order_items (
  id UUID PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  offering_id UUID REFERENCES offerings(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_price NUMERIC(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'
)

-- Reservations/bookings
bookings (
  id UUID PRIMARY KEY,
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  booking_number TEXT NOT NULL,    -- Auto-generated: BK-00001
  contact_id UUID,
  offering_id UUID REFERENCES offerings(id) ON DELETE SET NULL,
  status booking_status DEFAULT 'pending',  -- pending, confirmed, checked_in, checked_out, cancelled
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  guests INTEGER DEFAULT 1,
  currency TEXT DEFAULT 'USD',
  total NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  UNIQUE(account_id, booking_number)
)
```

### Business Types
```typescript
type BusinessType = 
  | 'retailer' | 'wholesaler' | 'restaurant' | 'hotel' | 'hotel_restaurant'
  | 'service_business' | 'professional_services' | 'education' | 'ngo_nonprofit'
  | 'property_real_estate' | 'healthcare' | 'events' | 'other';
```

### Capability Categories
```typescript
type CapabilityCategory = 
  | 'commerce' | 'food_hospitality' | 'services' | 'education'
  | 'ngo' | 'property' | 'events' | 'general';
```

---

## FILE LOCATIONS

### Core Business Logic
- `src/lib/business/capabilities.ts` - Types, constants, helper functions
- `src/lib/business/offerings.ts` - Offering types, capability→offering mapping, helpers
- `src/lib/business/offering-ai.ts` - AI image search service (independent, CLIP + vision)
- `src/lib/business/orders.ts` - Orders & bookings types, status constants, helpers

### API Routes
- `src/app/api/business/capabilities/route.ts` - CRUD for capabilities
- `src/app/api/business/capabilities/account/route.ts` - Get account capabilities
- `src/app/api/workspaces/route.ts` - Updated to handle business_type on create
- `src/app/api/offerings/route.ts` - List + create offerings
- `src/app/api/offerings/[id]/route.ts` - Get/update/archive offerings
- `src/app/api/offerings/search/route.ts` - Text search via RPC
- `src/app/api/offerings/upload/route.ts` - Image upload + media record
- `src/app/api/offerings/media/[id]/route.ts` - Set primary, reorder, delete images
- `src/app/api/offerings/categories/route.ts` - List + create categories
- `src/app/api/offerings/categories/[id]/route.ts` - Get/update/delete categories
- `src/app/api/orders/route.ts` - List + create orders (auto-numbering)
- `src/app/api/orders/[id]/route.ts` - Get/update/delete orders
- `src/app/api/bookings/route.ts` - List + create bookings (auto-numbering)
- `src/app/api/bookings/[id]/route.ts` - Get/update/delete bookings

### UI Components
- `src/components/settings/business-settings.tsx` - Settings page component
- `src/components/settings/settings-sections.ts` - Added 'business' section
- `src/components/catalog/catalog-form.tsx` - Create/edit offering with type-specific fields
- `src/components/catalog/category-manager.tsx` - Category tree view CRUD

### Pages
- `src/app/(dashboard)/settings/page.tsx` - Added BusinessSettings panel
- `src/app/(dashboard)/catalog/page.tsx` - Catalog (desktop table + mobile cards)
- `src/app/(dashboard)/orders/page.tsx` - Orders list (desktop table + mobile cards)
- `src/app/(dashboard)/orders/[id]/page.tsx` - Order detail with items
- `src/app/(dashboard)/bookings/page.tsx` - Bookings list (desktop table + mobile cards)
- `src/app/(dashboard)/bookings/[id]/page.tsx` - Booking detail

### Onboarding
- `src/app/onboarding/_components/workspace-form.tsx` - Business type selection step

### Auth Context
- `src/hooks/use-auth.tsx` - Extended with businessType, capabilities, enabledCapabilities, refreshCapabilities()

### Sidebar
- `src/components/layout/sidebar.tsx` - Reads capabilities from auth context, renders nav items

### Audit
- `src/lib/audit/events.ts` - Added BUSINESS_TYPE_CHANGED, CAPABILITY_ENABLED, CAPABILITY_DISABLED, OFFERING_CREATED, OFFERING_UPDATED, OFFERING_ARCHIVED, OFFERING_RESTORED, CATEGORY_CREATED, CATEGORY_UPDATED, CATEGORY_DELETED

### Database
- `supabase/migrations/067_business_classification_and_capabilities.sql`
- `supabase/migrations/068_offerings_catalog_foundation.sql` (use `ON CONFLICT DO NOTHING` for categories seed)
- `supabase/migrations/069_orders_and_bookings.sql`

---

## AUTH CONTEXT API

```typescript
// From useAuth()
{
  // Existing
  accountId: string | null;
  accountRole: AccountRole | null;
  workspaces: Workspace[];
  
  // New - Business Classification
  businessType: BusinessType | null;
  capabilities: CapabilityItem[];           // Full capability data
  enabledCapabilities: string[];            // Just the keys
  refreshCapabilities: () => Promise<void>;
}

// CapabilityItem shape
interface CapabilityItem {
  key: string;
  name: string;
  description: string | null;
  category: string;
  is_enabled: boolean;
  navigation: CapabilityNavigation | null;
}

// CapabilityNavigation shape
interface CapabilityNavigation {
  label: string;
  icon: string;         // Lucide icon name
  route: string;        // e.g. '/bookings'
  section: 'catalog' | 'operations' | 'settings';
}
```

---

## BUSINESS TYPE → CAPABILITY MAPPINGS

```typescript
getRecommendedCapabilityKeys('retailer')      → ['products', 'product_catalog', 'inventory', 'orders', 'inquiries']
getRecommendedCapabilityKeys('wholesaler')    → ['products', 'product_catalog', 'inventory', 'orders', 'wholesale', 'pricing', 'inquiries']
getRecommendedCapabilityKeys('restaurant')    → ['menu', 'food_orders', 'reservations', 'events', 'inquiries']
getRecommendedCapabilityKeys('hotel')         → ['accommodation', 'bookings', 'hospitality_services', 'events', 'inquiries']
getRecommendedCapabilityKeys('hotel_restaurant') → ['accommodation', 'bookings', 'menu', 'food_orders', 'hospitality_services', 'events', 'inquiries']
getRecommendedCapabilityKeys('service_business') → ['services', 'appointments', 'service_requests', 'inquiries']
getRecommendedCapabilityKeys('education')     → ['courses', 'education_programs', 'applications', 'events', 'resources', 'inquiries']
getRecommendedCapabilityKeys('ngo_nonprofit') → ['programs', 'ngo_services', 'applications', 'events', 'resources', 'donations', 'inquiries']
getRecommendedCapabilityKeys('property_real_estate') → ['property_listings', 'property_inquiries', 'viewings', 'inquiries']
getRecommendedCapabilityKeys('events')        → ['events', 'registrations', 'bookings', 'inquiries']
```

---

## HOW TO ADD NEW CAPABILITIES

1. Add to `business_capabilities` table in migration
2. Add navigation metadata if it needs sidebar items:
   ```sql
   INSERT INTO business_capabilities (key, name, description, category, is_default_enabled, recommended_business_types, navigation)
   VALUES ('my_feature', 'My Feature', 'Description', 'category', FALSE, '["hotel"]'::jsonb, '{"label": "My Feature", "icon": "IconName", "route": "/my-feature", "section": "operations"}'::jsonb);
   ```
3. Add icon to `CAPABILITY_ICONS` map in `sidebar.tsx`
4. Add to `BUSINESS_TYPES` recommendations in `capabilities.ts` if needed

---

## HOW CAPABILITIES FLOW THROUGH THE SYSTEM

```
1. User creates workspace → selects business_type
2. API creates account → calls getRecommendedCapabilityKeys()
3. Upserts account_capabilities with recommended ones enabled
4. Auth context fetches capabilities via /api/business/capabilities/account
5. Sidebar reads capabilities from auth context → renders nav items
6. Settings page can toggle capabilities → refreshes auth context
```

---

## FUTURE PHASES

### Phase 2: Offerings/Catalog
- Generic `offerings` table (not product-specific)
- Capability-aware catalog types
- Integration with existing Flow/Automation triggers

### Phase 3: Operational Actions
- Actions plug into existing Flow engine
- Events become automation triggers
- No new automation system - extend existing

### Phase 4: External Integrations
- Use existing `api_keys` and webhook architecture
- Connection → Provider → Supported capabilities
- Internal Tijwa OR External system data sources

---

## REMINDERS

1. **Sidebar navigation is capability-driven** - Never hardcode business-specific nav
2. **Capabilities are in auth context** - All components use `useAuth()`, no individual fetches
3. **NGO support is first-class** - No product/inventory requirement
4. **Hotel needs independent capabilities** - accommodation, menu, bookings are separate
5. **Existing Flows/Automations are preserved** - Future business actions plug into them
6. **RLS is mandatory** - All new tables have tenant isolation
