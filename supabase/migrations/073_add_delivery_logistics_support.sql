-- ============================================================
-- 073_add_delivery_logistics_support.sql
--
-- Adds support for logistics/delivery businesses like Tuma Morgan:
--   1. New business types (logistics_delivery, courier, transportation, etc.)
--   2. operating_hours to tenant_settings (generic for all businesses)
--   3. delivery capability with custom nodes (works with offerings + metadata)
--   4. Updated capability_offering_types mapping
--   5. New business_capabilities for delivery
--
-- Note: Zones are offerings (type='service' or 'package') with pricing formulas in metadata
-- ============================================================

-- ============================================================
-- 1. Add new business types to accounts constraint
-- ============================================================

-- First, drop the existing constraint
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_business_type_check;

-- Re-add with expanded list
ALTER TABLE accounts
  ADD CONSTRAINT accounts_business_type_check
  CHECK (business_type IN (
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
    'logistics_delivery',
    'courier',
    'transportation',
    'cleaning_services',
    'maintenance',
    'beauty_wellness',
    'fitness',
    'automotive',
    'pet_services',
    'healthcare_clinic',
    'other'
  ));

-- ============================================================
-- 2. Add operating_hours to tenant_settings (generic for all businesses)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_settings' AND column_name = 'operating_hours'
  ) THEN
    ALTER TABLE tenant_settings ADD COLUMN operating_hours JSONB NOT NULL DEFAULT '{"days": ["mon","tue","wed","thu","fri","sat","sun"], "start": "00:00", "end": "23:59", "timezone": "UTC"}'::jsonb;
  END IF;
END $$;

-- ============================================================
-- 3. Add delivery capability to business_capabilities
-- ============================================================

INSERT INTO business_capabilities (key, name, description, category, is_default_enabled, recommended_business_types, navigation) VALUES
  ('delivery', 'Delivery & Logistics', 'Manage delivery services, zones, pricing, and rider assignments', 'services', FALSE,
   '["logistics_delivery", "courier", "transportation", "restaurant", "hotel_restaurant"]'::jsonb,
   '{"label": "Delivery", "icon": "Truck", "route": "/delivery", "section": "operations"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 4. Update capability_offering_types for delivery
-- ============================================================

INSERT INTO capability_offering_types (capability_key, offering_type) VALUES
  ('delivery', 'service'),
  ('delivery', 'package')
ON CONFLICT (capability_key, offering_type) DO NOTHING;

-- ============================================================
-- 5. Add delivery capability nodes (works with offerings + metadata)
-- ============================================================

INSERT INTO capability_nodes (capability_key, node_key, name, description, category, input_schema, output_schema, handler) VALUES
  ('delivery', 'calculate_service_price', 'Calculate Service Price', 'Calculate price using offering metadata formula (items, stops, weight, distance, day-of-week)', 'action',
   '{"offering_id": "string", "params": "object"}'::jsonb,
   '{"price": "number", "currency": "string", "breakdown": "object"}'::jsonb,
   'pricingService.calculate'),

  ('delivery', 'match_offering_by_location', 'Match Offering by Location', 'Find applicable service offering based on pickup/dropoff locations', 'check',
   '{"pickup_location": "string", "dropoff_location": "string", "offering_type": "string"}'::jsonb,
   '{"offering_id": "string", "offering_name": "string", "zone_type": "string", "requires_prepayment": "boolean"}'::jsonb,
   'catalogService.matchByLocation'),

  ('delivery', 'assign_agent', 'Assign Agent', 'Assign job to available agent using round-robin or custom logic', 'action',
   '{"order_id": "string", "offering_id": "string"}'::jsonb,
   '{"agent_id": "string", "agent_name": "string", "assigned_at": "string"}'::jsonb,
   'assignmentService.assign'),

  ('delivery', 'check_operating_hours', 'Check Operating Hours', 'Check if business is currently operating (uses tenant_settings.operating_hours)', 'check',
   '{}'::jsonb,
   '{"is_operating": "boolean", "next_open_time": "string", "message": "string"}'::jsonb,
   'businessService.checkOperatingHours'),

  ('delivery', 'update_order_status', 'Update Order Status', 'Update order status and notify customer', 'action',
   '{"order_id": "string", "status": "string", "notes": "string"}'::jsonb,
   '{"order": "object"}'::jsonb,
   'orderService.updateStatus'),

  ('delivery', 'list_service_offerings', 'List Service Offerings', 'List service offerings with pricing formulas in metadata', 'read',
   '{"type": "string", "active_only": "boolean"}'::jsonb,
   '{"offerings": "array"}'::jsonb,
   'catalogService.listServices'),

  ('delivery', 'get_pricing_formula', 'Get Pricing Formula', 'Get pricing formula from offering metadata', 'read',
   '{"offering_id": "string"}'::jsonb,
   '{"formula": "object", "variables": "array"}'::jsonb,
   'pricingService.getFormula')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Update existing capabilities to recommend new business types
-- ============================================================

-- Services capability now includes logistics
UPDATE business_capabilities
SET recommended_business_types = recommended_business_types || '["logistics_delivery", "courier", "transportation"]'::jsonb
WHERE key = 'services';

-- Orders capability now includes logistics
UPDATE business_capabilities
SET recommended_business_types = recommended_business_types || '["logistics_delivery", "courier"]'::jsonb
WHERE key = 'orders';

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT operating_hours FROM tenant_settings LIMIT 1;
-- SELECT * FROM business_capabilities WHERE key = 'delivery';
-- SELECT * FROM capability_nodes WHERE capability_key = 'delivery';
-- SELECT * FROM capability_offering_types WHERE capability_key = 'delivery';
-- 
-- Example: Tuma Morgan would create offerings like:
-- - Offering 1: "Local Zone Delivery" (type='service', metadata contains pricing formula for local areas)
-- - Offering 2: "Extended Zone Delivery" (type='service', metadata contains pricing formula for extended areas)
-- 
-- Example metadata structure for pricing formula:
-- {
--   "pricing": {
--     "formula": "base + (items * item_price) + (stops * stop_price) + (weight * weight_price) + (distance * km_price)",
--     "base": 300,
--     "item_price": 50,
--     "stop_price": 100,
--     "weight_price": 20,
--     "km_price": 50,
--     "wednesday_discount": 0.1,
--     "zones": ["Fedha", "Nyayo", "Tassia", "Pipeline", "Donholm", "Taj Mall", "Church Road", "Gate A", "Gate B", "Gate D"]
--   },
--   "requires_prepayment": false,
--   "zone_type": "local"
-- }
