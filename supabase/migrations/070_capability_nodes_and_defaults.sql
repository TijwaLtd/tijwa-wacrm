-- ============================================================
-- 070_capability_nodes_and_defaults.sql
-- Capability nodes, default flow templates, and flow resolution.
--
-- What this migration adds:
--
--   1. Adds columns to `flows` table to distinguish system default
--      flows from user-created flows.
--
--   2. `capability_nodes` — registry of business operation nodes
--      that capabilities can provide to flows.
--
--   3. `flow_template_installs` — tracks which default templates
--      are installed for each account.
--
--   4. Updates flow_nodes CHECK to allow `capability_action` node type.
--
-- Design principles:
--   - System defaults are non-deletable, non-editable
--   - Custom flows override defaults by priority
--   - Disabling a capability archives its defaults
--   - Existing flows remain intact when capability is disabled
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Add system default columns to flows table
-- ============================================================
ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN DEFAULT FALSE;

ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS system_template_key TEXT;

ALTER TABLE flows
  ADD COLUMN IF NOT EXISTS template_version INTEGER DEFAULT 1;

-- Unique constraint on system_template_key (one per template)
CREATE UNIQUE INDEX IF NOT EXISTS idx_flows_system_template_key
  ON flows(system_template_key)
  WHERE system_template_key IS NOT NULL;

-- ============================================================
-- 2. capability_nodes table — registry of business operation nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS capability_nodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  capability_key TEXT NOT NULL REFERENCES business_capabilities(key) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('read', 'search', 'check', 'action', 'communication')),
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  handler TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(capability_key, node_key)
);

CREATE INDEX IF NOT EXISTS idx_capability_nodes_capability ON capability_nodes(capability_key);
CREATE INDEX IF NOT EXISTS idx_capability_nodes_category ON capability_nodes(category);

ALTER TABLE capability_nodes ENABLE ROW LEVEL SECURITY;

-- Admin+ can read capability nodes
CREATE POLICY capability_nodes_select_policy ON capability_nodes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Only service role can modify capability nodes
CREATE POLICY capability_nodes_insert_policy ON capability_nodes
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY capability_nodes_update_policy ON capability_nodes
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY capability_nodes_delete_policy ON capability_nodes
  FOR DELETE
  USING (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS set_updated_at ON capability_nodes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON capability_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. flow_template_installs — tracks installed default templates
-- ============================================================
CREATE TABLE IF NOT EXISTS flow_template_installs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  system_template_key TEXT NOT NULL,
  flow_id UUID NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  template_version INTEGER NOT NULL DEFAULT 1,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, system_template_key)
);

CREATE INDEX IF NOT EXISTS idx_flow_template_installs_account ON flow_template_installs(account_id);

ALTER TABLE flow_template_installs ENABLE ROW LEVEL SECURITY;

-- Users can read their account's template installs
CREATE POLICY flow_template_installs_select_policy ON flow_template_installs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM account_memberships
      WHERE user_id = auth.uid()
      AND account_id = flow_template_installs.account_id
      AND role IN ('owner', 'admin')
    )
  );

-- Only service role can modify template installs
CREATE POLICY flow_template_installs_insert_policy ON flow_template_installs
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY flow_template_installs_update_policy ON flow_template_installs
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY flow_template_installs_delete_policy ON flow_template_installs
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================================
-- 4. Update flow_nodes CHECK to allow capability_action
-- ============================================================
ALTER TABLE flow_nodes
  DROP CONSTRAINT IF EXISTS flow_nodes_node_type_check;

ALTER TABLE flow_nodes
  ADD CONSTRAINT flow_nodes_node_type_check
  CHECK (node_type IN (
    'start', 'send_message', 'send_media', 'send_buttons', 'send_list',
    'collect_input', 'condition', 'set_tag', 'handoff', 'end',
    'capability_action'
  ));

-- ============================================================
-- 5. Seed capability nodes for each capability
-- ============================================================

-- Products capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('products', 'list_products', 'List Products', 'Fetch products from the catalog with optional filters', 'read',
   '{"limit": "number", "category": "string", "search": "string", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number", "page": "number"}'::jsonb,
   'catalogService.list'),
  ('products', 'get_product', 'Get Product', 'Fetch a single product by ID', 'read',
   '{"product_id": "string"}'::jsonb,
   '{"item": "object|null"}'::jsonb,
   'catalogService.get'),
  ('products', 'search_products', 'Search Products', 'Search products by name or description', 'search',
   '{"query": "string", "limit": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'catalogService.search'),
  ('products', 'get_categories', 'Get Categories', 'Fetch product categories', 'read',
   '{"parent_id": "string"}'::jsonb,
   '{"items": "array"}'::jsonb,
   'catalogService.categories')
ON CONFLICT DO NOTHING;

-- Menu capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('menu', 'list_menu_items', 'List Menu Items', 'Fetch menu items with optional category filter', 'read',
   '{"limit": "number", "category": "string", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number", "page": "number"}'::jsonb,
   'menuService.list'),
  ('menu', 'get_menu_item', 'Get Menu Item', 'Fetch a single menu item by ID', 'read',
   '{"item_id": "string"}'::jsonb,
   '{"item": "object|null"}'::jsonb,
   'menuService.get'),
  ('menu', 'search_menu_items', 'Search Menu Items', 'Search menu items by name or description', 'search',
   '{"query": "string", "limit": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'menuService.search')
ON CONFLICT DO NOTHING;

-- Orders capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('orders', 'create_order', 'Create Order', 'Create a new customer order', 'action',
   '{"contact_id": "string", "items": "array", "notes": "string", "currency": "string"}'::jsonb,
   '{"order": "object"}'::jsonb,
   'orderService.create'),
  ('orders', 'get_order', 'Get Order', 'Fetch an order by ID or order number', 'read',
   '{"order_id": "string", "order_number": "string"}'::jsonb,
   '{"order": "object|null"}'::jsonb,
   'orderService.get'),
  ('orders', 'list_orders', 'List Orders', 'List orders with optional status filter', 'read',
   '{"status": "string", "limit": "number", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'orderService.list')
ON CONFLICT DO NOTHING;

-- Bookings capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('bookings', 'check_availability', 'Check Availability', 'Check booking availability for a date range', 'check',
   '{"offering_id": "string", "start_date": "string", "end_date": "string", "guests": "number"}'::jsonb,
   '{"available": "boolean", "total": "number"}'::jsonb,
   'bookingService.checkAvailability'),
  ('bookings', 'create_booking', 'Create Booking', 'Create a new booking reservation', 'action',
   '{"contact_id": "string", "offering_id": "string", "start_date": "string", "end_date": "string", "guests": "number", "notes": "string"}'::jsonb,
   '{"booking": "object"}'::jsonb,
   'bookingService.create'),
  ('bookings', 'get_booking', 'Get Booking', 'Fetch a booking by ID or booking number', 'read',
   '{"booking_id": "string", "booking_number": "string"}'::jsonb,
   '{"booking": "object|null"}'::jsonb,
   'bookingService.get'),
  ('bookings', 'list_bookings', 'List Bookings', 'List bookings with optional status filter', 'read',
   '{"status": "string", "limit": "number", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'bookingService.list')
ON CONFLICT DO NOTHING;

-- Courses capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('courses', 'list_courses', 'List Courses', 'Fetch courses with optional filters', 'read',
   '{"limit": "number", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'courseService.list'),
  ('courses', 'get_course', 'Get Course', 'Fetch a single course by ID', 'read',
   '{"course_id": "string"}'::jsonb,
   '{"item": "object|null"}'::jsonb,
   'courseService.get'),
  ('courses', 'search_courses', 'Search Courses', 'Search courses by name or description', 'search',
   '{"query": "string", "limit": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'courseService.search')
ON CONFLICT DO NOTHING;

-- Programs capability nodes (NGO / Education)
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('programs', 'list_programs', 'List Programs', 'Fetch programs with optional filters', 'read',
   '{"limit": "number", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'programService.list'),
  ('programs', 'get_program', 'Get Program', 'Fetch a single program by ID', 'read',
   '{"program_id": "string"}'::jsonb,
   '{"item": "object|null"}'::jsonb,
   'programService.get')
ON CONFLICT DO NOTHING;

-- Property Listings capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('property_listings', 'list_properties', 'List Properties', 'Fetch property listings with optional filters', 'read',
   '{"limit": "number", "page": "number", "min_price": "number", "max_price": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'propertyService.list'),
  ('property_listings', 'get_property', 'Get Property', 'Fetch a single property by ID', 'read',
   '{"property_id": "string"}'::jsonb,
   '{"item": "object|null"}'::jsonb,
   'propertyService.get'),
  ('property_listings', 'search_properties', 'Search Properties', 'Search properties by location or features', 'search',
   '{"query": "string", "limit": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'propertyService.search')
ON CONFLICT DO NOTHING;

-- Services capability nodes
INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('services', 'list_services', 'List Services', 'Fetch available services', 'read',
   '{"limit": "number", "page": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'serviceOfferingService.list'),
  ('services', 'get_service', 'Get Service', 'Fetch a single service by ID', 'read',
   '{"service_id": "string"}'::jsonb,
   '{"item": "object|null"}'::jsonb,
   'serviceOfferingService.get'),
  ('services', 'search_services', 'Search Services', 'Search services by name or description', 'search',
   '{"query": "string", "limit": "number"}'::jsonb,
   '{"items": "array", "total": "number"}'::jsonb,
   'serviceOfferingService.search')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Helper function: get_enabled_capability_nodes
-- ============================================================
CREATE OR REPLACE FUNCTION get_enabled_capability_nodes(p_account_id UUID)
RETURNS TABLE (
  capability_key TEXT,
  node_key TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  input_schema JSONB,
  output_schema JSONB,
  handler TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    cn.capability_key,
    cn.node_key,
    cn.name,
    cn.description,
    cn.category,
    cn.input_schema,
    cn.output_schema,
    cn.handler
  FROM capability_nodes cn
  INNER JOIN account_capabilities ac ON ac.capability_key = cn.capability_key
  WHERE ac.account_id = p_account_id
    AND COALESCE(ac.is_enabled, TRUE) = TRUE
    AND cn.is_enabled = TRUE
  ORDER BY cn.capability_key, cn.category, cn.name;
$$;

ALTER FUNCTION get_enabled_capability_nodes(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_enabled_capability_nodes(UUID) TO authenticated, service_role;
