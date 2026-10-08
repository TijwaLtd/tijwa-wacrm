-- Sidebar label changes for property capabilities (product decision):
--   viewings          "Viewings"  → "Appointments"
--   property_inquiries "Property Inquiries" → "Inquiry"
-- Only navigation.label changes — icon, route and section stay as-is.
-- jsonb_set (rather than a whole-object replace) so any future keys in
-- navigation survive.

UPDATE business_capabilities
SET navigation = jsonb_set(navigation, '{label}', '"Appointments"'::jsonb),
    updated_at = now()
WHERE key = 'viewings';

UPDATE business_capabilities
SET navigation = jsonb_set(navigation, '{label}', '"Inquiry"'::jsonb),
    updated_at = now()
WHERE key = 'property_inquiries';
