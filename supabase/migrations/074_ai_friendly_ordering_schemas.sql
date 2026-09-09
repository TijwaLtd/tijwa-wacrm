-- ============================================================
-- 074_ai_friendly_ordering_schemas.sql
--
-- Adds AI-friendly structures for catalogue agents and ordering:
--   1. Enhance capability_nodes with AI descriptions and examples
--   2. Add order_schema to offerings metadata for structured ordering
--   3. Add ai_response_templates for consistent catalogue responses
--   4. Add field_descriptions to capability_nodes for semantic understanding
-- ============================================================

-- ============================================================
-- 1. Add AI-friendly columns to capability_nodes
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capability_nodes' AND column_name = 'ai_description'
  ) THEN
    ALTER TABLE capability_nodes ADD COLUMN ai_description TEXT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capability_nodes' AND column_name = 'ai_examples'
  ) THEN
    ALTER TABLE capability_nodes ADD COLUMN ai_examples JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'capability_nodes' AND column_name = 'field_descriptions'
  ) THEN
    ALTER TABLE capability_nodes ADD COLUMN field_descriptions JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ============================================================
-- 2. Update capability_nodes with AI descriptions
-- ============================================================

-- Products capability
UPDATE capability_nodes SET 
  ai_description = 'Fetches products from the catalog. Use when customer asks about available products, wants to browse catalog, or needs product information.',
  field_descriptions = '{
    "limit": "Maximum number of products to return (default 20)",
    "category": "Filter by product category slug",
    "search": "Text search query to find matching products",
    "page": "Page number for pagination (0-indexed)"
  }'::jsonb,
  ai_examples = '[
    {"input": {"limit": 10, "category": "electronics"}, "description": "Get 10 electronics products"},
    {"input": {"search": "laptop", "limit": 5}, "description": "Search for laptops, return 5 results"}
  ]'::jsonb
WHERE capability_key = 'products' AND node_key = 'list_products';

UPDATE capability_nodes SET 
  ai_description = 'Fetches a single product by ID. Use when customer asks about a specific product.',
  field_descriptions = '{
    "product_id": "UUID of the product to fetch"
  }'::jsonb,
  ai_examples = '[
    {"input": {"product_id": "uuid-123"}, "description": "Get product with ID uuid-123"}
  ]'::jsonb
WHERE capability_key = 'products' AND node_key = 'get_product';

-- Services capability
UPDATE capability_nodes SET 
  ai_description = 'Fetches available services. Use when customer asks about services offered.',
  field_descriptions = '{
    "limit": "Maximum number of services to return (default 20)",
    "page": "Page number for pagination (0-indexed)"
  }'::jsonb,
  ai_examples = '[
    {"input": {"limit": 10}, "description": "Get 10 services"}
  ]'::jsonb
WHERE capability_key = 'services' AND node_key = 'list_services';

-- Orders capability
UPDATE capability_nodes SET 
  ai_description = 'Creates a new customer order. Use when customer confirms they want to place an order. Must have structured order data from the offering''s order_schema.',
  field_descriptions = '{
    "contact_id": "UUID of the customer contact",
    "items": "Array of order items (structure depends on offering type)",
    "notes": "Additional notes from customer",
    "currency": "Currency code (e.g., KES, USD)"
  }'::jsonb,
  ai_examples = '[
    {"input": {"contact_id": "uuid-123", "items": [{"name": "Product A", "quantity": 2, "unit_price": 100}], "currency": "KES"}, "description": "Create order with 2 items"}
  ]'::jsonb
WHERE capability_key = 'orders' AND node_key = 'create_order';

-- Delivery capability
UPDATE capability_nodes SET 
  ai_description = 'Calculates service price using the offering''s pricing formula. Reads pricing parameters from offering metadata.',
  field_descriptions = '{
    "offering_id": "UUID of the service offering",
    "params": "Object containing pricing parameters (items, stops, weight, distance, etc.)"
  }'::jsonb,
  ai_examples = '[
    {"input": {"offering_id": "uuid-123", "params": {"items": 3, "stops": 2, "weight_kg": 5, "distance_km": 10}}, "description": "Calculate price for 3 items, 2 stops, 5kg, 10km"}
  ]'::jsonb
WHERE capability_key = 'delivery' AND node_key = 'calculate_service_price';

UPDATE capability_nodes SET 
  ai_description = 'Matches the appropriate service offering based on pickup and dropoff locations. Uses zone information from offering metadata.',
  field_descriptions = '{
    "pickup_location": "Pickup location name or address",
    "dropoff_location": "Dropoff location name or address",
    "offering_type": "Type of offering to match (e.g., ''service'', ''package'')"
  }'::jsonb,
  ai_examples = '[
    {"input": {"pickup_location": "Fedha", "dropoff_location": "Taj Mall", "offering_type": "service"}, "description": "Find delivery service for Fedha to Taj Mall"}
  ]'::jsonb
WHERE capability_key = 'delivery' AND node_key = 'match_offering_by_location';

UPDATE capability_nodes SET 
  ai_description = 'Checks if the business is currently operating based on tenant_settings.operating_hours.',
  field_descriptions = '{}',
  ai_examples = '[
    {"input": {}, "description": "Check if business is open now"}
  ]'::jsonb
WHERE capability_key = 'delivery' AND node_key = 'check_operating_hours';

-- ============================================================
-- 3. Add order_schema documentation to offerings metadata
-- ============================================================

-- Example: Update existing offerings with order_schema if they don't have it
-- This is a template - actual implementation would be per-offering

-- ============================================================
-- 4. Create catalogue_ai_response_templates table
-- ============================================================

CREATE TABLE IF NOT EXISTS catalogue_ai_response_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  capability_key TEXT REFERENCES business_capabilities(key) ON DELETE CASCADE,
  offering_type offering_type,
  template_type TEXT NOT NULL CHECK (template_type IN ('list', 'detail', 'confirmation', 'error', 'pricing')),
  template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_catalogue_ai_templates_account ON catalogue_ai_response_templates(account_id);
CREATE INDEX IF NOT EXISTS idx_catalogue_ai_templates_capability ON catalogue_ai_response_templates(capability_key);
CREATE INDEX IF NOT EXISTS idx_catalogue_ai_templates_type ON catalogue_ai_response_templates(template_type);

ALTER TABLE catalogue_ai_response_templates ENABLE ROW LEVEL SECURITY;

-- Members can view templates
CREATE POLICY catalogue_ai_templates_select ON catalogue_ai_response_templates
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

-- Admin+ can manage templates
CREATE POLICY catalogue_ai_templates_insert ON catalogue_ai_response_templates
  FOR INSERT WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin'));
CREATE POLICY catalogue_ai_templates_update ON catalogue_ai_response_templates
  FOR UPDATE USING (has_role_in_account(auth.uid(), account_id, 'admin'));
CREATE POLICY catalogue_ai_templates_delete ON catalogue_ai_response_templates
  FOR DELETE USING (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON catalogue_ai_response_templates;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON catalogue_ai_response_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 5. Seed default AI response templates
-- ============================================================

INSERT INTO catalogue_ai_response_templates (account_id, template_key, name, description, capability_key, offering_type, template_type, template, variables, is_default) VALUES
  (NULL, 'products_list', 'Products List Response', 'Default template for listing products', 'products', 'product', 'list',
   'Here are our {{count}} products:\n\n{{#each items}}\n• {{name}} - {{price}} {{currency}}\n  {{short_description}}\n{{/each}}\n\nWould you like more details on any product?',
   '{"count": "number", "items": "array", "currency": "string"}'::jsonb,
   TRUE),

  (NULL, 'services_list', 'Services List Response', 'Default template for listing services', 'services', 'service', 'list',
   'Here are our services:\n\n{{#each items}}\n• {{name}}\n  {{short_description}}\n  {{#if price}}Starting from {{price}} {{currency}}{{/if}}\n{{/each}}\n\nWhich service would you like to know more about?',
   '{"items": "array", "currency": "string"}'::jsonb,
   TRUE),

  (NULL, 'delivery_pricing', 'Delivery Pricing Response', 'Template for delivery pricing calculation', 'delivery', 'service', 'pricing',
   'Based on your delivery details:\n• Items: {{item_count}}\n• Stops: {{stop_count}}\n• Distance: {{distance_km}} km\n• Weight: {{weight_kg}} kg\n\n**Total: {{price}} {{currency}}**\n\n{{#if requires_prepayment}}Prepayment required for this zone.{{/if}}\n\nWould you like to proceed with this order?',
   '{"item_count": "number", "stop_count": "number", "distance_km": "number", "weight_kg": "number", "price": "number", "currency": "string", "requires_prepayment": "boolean"}'::jsonb,
   TRUE),

  (NULL, 'order_confirmation', 'Order Confirmation', 'Template for order confirmation', 'orders', NULL, 'confirmation',
   'Your order has been confirmed!\n\nOrder #{{order_number}}\nTotal: {{total}} {{currency}}\n\nItems:\n{{#each items}}\n• {{name}} x{{quantity}} - {{total_price}} {{currency}}\n{{/each}}\n\nWe will process your order shortly.',
   '{"order_number": "string", "total": "number", "currency": "string", "items": "array"}'::jsonb,
   TRUE),

  (NULL, 'operating_hours_closed', 'Operating Hours Closed', 'Template when business is closed', 'delivery', NULL, 'error',
   'We are currently closed.\n\nOperating hours: {{days}} {{start}} - {{end}}\nNext opening: {{next_open_time}}\n\nPlease contact us during operating hours.',
   '{"days": "string", "start": "string", "end": "string", "next_open_time": "string"}'::jsonb,
   TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. Add order_schema structure documentation
-- ============================================================

-- This is a comment block showing the expected order_schema structure in offerings.metadata
-- AI agents should read this from offering metadata to structure orders correctly

-- Example order_schema for delivery services:
-- {
--   "order_schema": {
--     "required_fields": ["pickup_location", "dropoff_location", "item_count"],
--     "optional_fields": ["stops", "weight_kg", "distance_km", "special_instructions"],
--     "field_types": {
--       "pickup_location": "string",
--       "dropoff_location": "string",
--       "item_count": "number",
--       "stops": "array",
--       "weight_kg": "number",
--       "distance_km": "number",
--       "special_instructions": "string"
--     },
--     "field_descriptions": {
--       "pickup_location": "Where to pick up the items",
--       "dropoff_location": "Where to deliver the items",
--       "item_count": "Number of items to deliver",
--       "stops": "Additional stop locations",
--       "weight_kg": "Total weight in kilograms",
--       "distance_km": "Estimated distance in kilometers",
--       "special_instructions": "Any special handling instructions"
--     }
--   }
-- }

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT ai_description, field_descriptions FROM capability_nodes WHERE capability_key = 'delivery';
-- SELECT * FROM catalogue_ai_response_templates WHERE is_default = TRUE;
