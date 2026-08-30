-- ============================================================
-- 067_business_classification_and_capabilities.sql
-- Business classification and capability foundation for Phase 1.
--
-- What this migration adds:
--
--   1. `business_capabilities` — system-level capability definitions
--      (centralized registry). These are immutable definitions that
--      describe what capabilities exist in Tijwa.
--
--   2. `account_capabilities` — organization-level capability
--      configuration. Each account can enable/disable capabilities.
--
--   3. Adds `business_type` column to `accounts` table.
--
--   4. Creates helper functions for capability management.
--
-- Design principles:
--   - Capabilities are reusable across business types
--   - Business type is a classification, not a hard application
--   - Capabilities determine available features
--   - System definitions are immutable by organizations
--   - Organization can enable/disable capabilities
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Business capabilities table (system-level definitions)
-- ============================================================
CREATE TABLE IF NOT EXISTS business_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  is_default_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  supported_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_business_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  navigation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_business_capabilities_key ON business_capabilities(key);
CREATE INDEX IF NOT EXISTS idx_business_capabilities_category ON business_capabilities(category);

-- RLS - system-level, admin+ can read, only service role can modify
ALTER TABLE business_capabilities ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read capabilities (for UI display)
CREATE POLICY "business_capabilities_select" ON business_capabilities
  FOR SELECT TO authenticated USING (true);

-- Only service role can insert/update/delete (system definitions)
CREATE POLICY "business_capabilities_insert" ON business_capabilities
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "business_capabilities_update" ON business_capabilities
  FOR UPDATE TO service_role USING (true);
CREATE POLICY "business_capabilities_delete" ON business_capabilities
  FOR DELETE TO service_role USING (true);

DROP TRIGGER IF EXISTS set_updated_at ON business_capabilities;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON business_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. Account capabilities table (organization configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS account_capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL REFERENCES business_capabilities(key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, capability_key)
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_account_capabilities_account ON account_capabilities(account_id);
CREATE INDEX IF NOT EXISTS idx_account_capabilities_capability ON account_capabilities(capability_key);

-- RLS - tenant isolation
ALTER TABLE account_capabilities ENABLE ROW LEVEL SECURITY;

-- Members can read their account's capabilities
CREATE POLICY "account_capabilities_select" ON account_capabilities
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Admin+ can modify their account's capabilities
CREATE POLICY "account_capabilities_insert" ON account_capabilities
  FOR INSERT WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin'));
CREATE POLICY "account_capabilities_update" ON account_capabilities
  FOR UPDATE USING (has_role_in_account(auth.uid(), account_id, 'admin'));
CREATE POLICY "account_capabilities_delete" ON account_capabilities
  FOR DELETE USING (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON account_capabilities;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON account_capabilities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. Add business_type to accounts table
-- ============================================================
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS business_type TEXT;

-- Add constraint for valid business types (extensible enum)
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_business_type_check;
ALTER TABLE accounts
  ADD CONSTRAINT accounts_business_type_check
  CHECK (business_type IS NULL OR business_type IN (
    'retailer',
    'wholesaler',
    'restaurant',
    'hotel',
    'hotel_restaurant',
    'service_business',
    'professional_services',
    'education',
    'ngo_nonprofit',
    'property_real_estate',
    'healthcare',
    'events',
    'other'
  ));

-- ============================================================
-- 4. Helper functions
-- ============================================================

-- Get all capabilities for an account
CREATE OR REPLACE FUNCTION get_account_capabilities(p_account_id UUID)
RETURNS TABLE (
  capability_key TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  is_enabled BOOLEAN,
  config JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bc.key,
    bc.name,
    bc.description,
    bc.category,
    COALESCE(ac.is_enabled, bc.is_default_enabled),
    COALESCE(ac.config, '{}'::jsonb)
  FROM business_capabilities bc
  LEFT JOIN account_capabilities ac ON ac.capability_key = bc.key AND ac.account_id = p_account_id
  ORDER BY bc.category, bc.name;
$$;

ALTER FUNCTION get_account_capabilities(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_account_capabilities(UUID) TO authenticated, service_role;

-- Get enabled capabilities for an account (simplified for sidebar)
CREATE OR REPLACE FUNCTION get_enabled_capability_keys(p_account_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT bc.key
      FROM business_capabilities bc
      LEFT JOIN account_capabilities ac ON ac.capability_key = bc.key AND ac.account_id = p_account_id
      WHERE COALESCE(ac.is_enabled, bc.is_default_enabled) = TRUE
      ORDER BY bc.category, bc.name
    ),
    ARRAY[]::text[]
  );
$$;

ALTER FUNCTION get_enabled_capability_keys(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_enabled_capability_keys(UUID) TO authenticated, service_role;

-- Get recommended capabilities for a business type
CREATE OR REPLACE FUNCTION get_recommended_capabilities(p_business_type TEXT)
RETURNS TABLE (
  capability_key TEXT,
  name TEXT,
  description TEXT,
  category TEXT,
  is_recommended BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    bc.key,
    bc.name,
    bc.description,
    bc.category,
    (bc.recommended_business_types @> to_jsonb(p_business_type)) as is_recommended
  FROM business_capabilities bc
  ORDER BY bc.category, bc.name;
$$;

ALTER FUNCTION get_recommended_capabilities(TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_recommended_capabilities(TEXT) TO authenticated, service_role;

-- ============================================================
-- 5. Seed initial business types and capabilities
-- ============================================================

-- Insert capability definitions
INSERT INTO business_capabilities (key, name, description, category, is_default_enabled, recommended_business_types, navigation) VALUES
  -- Commerce capabilities
  ('products', 'Products', 'Manage product catalog and listings', 'commerce', FALSE,
   '["retailer", "wholesaler"]'::jsonb,
   '{"label": "Products", "icon": "Package", "route": "/products", "section": "catalog"}'::jsonb),

  ('product_catalog', 'Product Catalog', 'Full product catalog management', 'commerce', FALSE,
   '["retailer", "wholesaler"]'::jsonb,
   '{"label": "Catalog", "icon": "LayoutGrid", "route": "/catalog", "section": "catalog"}'::jsonb),

  ('inventory', 'Inventory', 'Track stock levels and inventory management', 'commerce', FALSE,
   '["retailer", "wholesaler"]'::jsonb,
   '{"label": "Inventory", "icon": "Warehouse", "route": "/inventory", "section": "operations"}'::jsonb),

  ('orders', 'Orders', 'Process and manage customer orders', 'commerce', FALSE,
   '["retailer", "wholesaler", "restaurant"]'::jsonb,
   '{"label": "Orders", "icon": "ShoppingCart", "route": "/orders", "section": "operations"}'::jsonb),

  ('wholesale', 'Wholesale', 'Wholesale pricing and bulk orders', 'commerce', FALSE,
   '["wholesaler"]'::jsonb,
   '{"label": "Wholesale", "icon": "Hash", "route": "/wholesale", "section": "operations"}'::jsonb),

  ('pricing', 'Pricing', 'Advanced pricing rules and tiers', 'commerce', FALSE,
   '["wholesaler"]'::jsonb,
   '{"label": "Pricing", "icon": "Tag", "route": "/pricing", "section": "operations"}'::jsonb),

  -- Food & Hospitality capabilities
  ('menu', 'Menu', 'Manage food and beverage menu items', 'food_hospitality', FALSE,
   '["restaurant", "hotel_restaurant"]'::jsonb,
   '{"label": "Menu", "icon": "UtensilsCrossed", "route": "/menu", "section": "catalog"}'::jsonb),

  ('food_orders', 'Food Orders', 'Process food and beverage orders', 'food_hospitality', FALSE,
   '["restaurant", "hotel_restaurant"]'::jsonb,
   '{"label": "Food Orders", "icon": "Utensils", "route": "/food-orders", "section": "operations"}'::jsonb),

  ('accommodation', 'Accommodation', 'Manage rooms and lodging', 'food_hospitality', FALSE,
   '["hotel", "hotel_restaurant"]'::jsonb,
   '{"label": "Rooms", "icon": "Bed", "route": "/rooms", "section": "catalog"}'::jsonb),

  ('bookings', 'Bookings', 'Handle reservations and bookings', 'food_hospitality', FALSE,
   '["hotel", "hotel_restaurant", "events"]'::jsonb,
   '{"label": "Bookings", "icon": "Calendar", "route": "/bookings", "section": "operations"}'::jsonb),

  ('reservations', 'Reservations', 'Table and venue reservations', 'food_hospitality', FALSE,
   '["restaurant", "hotel_restaurant"]'::jsonb,
   '{"label": "Reservations", "icon": "CalendarCheck", "route": "/reservations", "section": "operations"}'::jsonb),

  ('hospitality_services', 'Hospitality Services', 'Additional hotel services', 'food_hospitality', FALSE,
   '["hotel", "hotel_restaurant"]'::jsonb,
   '{"label": "Services", "icon": "ConciergeBell", "route": "/services", "section": "operations"}'::jsonb),

  -- Services capabilities
  ('services', 'Services', 'Manage service offerings', 'services', FALSE,
   '["service_business", "professional_services", "hotel", "hotel_restaurant"]'::jsonb,
   '{"label": "Services", "icon": "Wrench", "route": "/services", "section": "catalog"}'::jsonb),

  ('appointments', 'Appointments', 'Schedule and manage appointments', 'services', FALSE,
   '["service_business", "professional_services", "healthcare"]'::jsonb,
   '{"label": "Appointments", "icon": "Clock", "route": "/appointments", "section": "operations"}'::jsonb),

  ('service_requests', 'Service Requests', 'Handle service inquiries and requests', 'services', FALSE,
   '["service_business", "professional_services"]'::jsonb,
   '{"label": "Service Requests", "icon": "Headphones", "route": "/service-requests", "section": "operations"}'::jsonb),

  ('inquiries', 'Inquiries', 'General inquiry management', 'general', TRUE,
   '["retailer", "wholesaler", "restaurant", "hotel", "hotel_restaurant", "service_business", "professional_services", "education", "ngo_nonprofit", "property_real_estate", "healthcare", "events"]'::jsonb,
   NULL),

  -- Education capabilities
  ('courses', 'Courses', 'Manage educational courses', 'education', FALSE,
   '["education"]'::jsonb,
   '{"label": "Courses", "icon": "GraduationCap", "route": "/courses", "section": "catalog"}'::jsonb),

  ('education_programs', 'Education Programs', 'Academic programs and curricula', 'education', FALSE,
   '["education", "ngo_nonprofit"]'::jsonb,
   '{"label": "Programs", "icon": "BookOpen", "route": "/programs", "section": "catalog"}'::jsonb),

  ('applications', 'Applications', 'Process applications and enrollments', 'education', FALSE,
   '["education", "ngo_nonprofit"]'::jsonb,
   '{"label": "Applications", "icon": "FileText", "route": "/applications", "section": "operations"}'::jsonb),

  ('registrations', 'Registrations', 'Event and course registrations', 'education', FALSE,
   '["education", "events"]'::jsonb,
   '{"label": "Registrations", "icon": "UserPlus", "route": "/registrations", "section": "operations"}'::jsonb),

  -- NGO / Nonprofit capabilities
  ('programs', 'Programs', 'Community programs and initiatives', 'ngo', FALSE,
   '["ngo_nonprofit"]'::jsonb,
   '{"label": "Programs", "icon": "Heart", "route": "/programs", "section": "catalog"}'::jsonb),

  ('ngo_services', 'NGO Services', 'Services offered to beneficiaries', 'ngo', FALSE,
   '["ngo_nonprofit"]'::jsonb,
   '{"label": "Services", "icon": "HandHelping", "route": "/ngo-services", "section": "catalog"}'::jsonb),

  ('resources', 'Resources', 'Educational and community resources', 'ngo', FALSE,
   '["ngo_nonprofit", "education"]'::jsonb,
   '{"label": "Resources", "icon": "Library", "route": "/resources", "section": "catalog"}'::jsonb),

  ('donations', 'Donations', 'Manage donations and fundraising', 'ngo', FALSE,
   '["ngo_nonprofit"]'::jsonb,
   '{"label": "Donations", "icon": "HandCoins", "route": "/donations", "section": "operations"}'::jsonb),

  -- Property capabilities
  ('property_listings', 'Property Listings', 'Real estate property listings', 'property', FALSE,
   '["property_real_estate"]'::jsonb,
   '{"label": "Properties", "icon": "Home", "route": "/properties", "section": "catalog"}'::jsonb),

  ('property_inquiries', 'Property Inquiries', 'Handle property inquiries', 'property', FALSE,
   '["property_real_estate"]'::jsonb,
   '{"label": "Property Inquiries", "icon": "HelpCircle", "route": "/property-inquiries", "section": "operations"}'::jsonb),

  ('viewings', 'Viewings', 'Schedule property viewings', 'property', FALSE,
   '["property_real_estate"]'::jsonb,
   '{"label": "Viewings", "icon": "Eye", "route": "/viewings", "section": "operations"}'::jsonb),

  -- Events capabilities
  ('events', 'Events', 'Manage events and venues', 'events', FALSE,
   '["events", "hotel", "hotel_restaurant", "ngo_nonprofit", "education"]'::jsonb,
   '{"label": "Events", "icon": "CalendarDays", "route": "/events", "section": "catalog"}'::jsonb),

  -- General capabilities
  ('customer_self_service', 'Customer Self-Service', 'Enable customer self-service portal', 'general', FALSE,
   '["retailer", "wholesaler", "restaurant", "hotel", "hotel_restaurant", "service_business", "professional_services", "education", "ngo_nonprofit", "property_real_estate", "healthcare", "events"]'::jsonb,
   NULL)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 6. Create default capabilities for existing accounts
-- ============================================================
-- This is a no-op for now - capabilities are enabled per-account
-- when they set their business type in the future.

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM business_capabilities;  -- Should show ~30 capabilities
-- SELECT count(*) FROM account_capabilities;   -- Initially 0
-- SELECT * FROM get_account_capabilities('(SELECT id FROM accounts LIMIT 1)');
-- SELECT * FROM get_enabled_capability_keys('(SELECT id FROM accounts LIMIT 1)');
-- SELECT * FROM get_recommended_capabilities('hotel');
