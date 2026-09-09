-- Add business metadata to account_memberships for business-type-specific attributes
ALTER TABLE account_memberships ADD COLUMN business_metadata JSONB DEFAULT '{}'::jsonb;

-- Add business-type-specific roles to account_role_enum
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'driver';
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'technician';
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'provider';
ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'specialist';

-- Add assignment tracking to orders table
ALTER TABLE orders ADD COLUMN assigned_role TEXT DEFAULT 'agent';
ALTER TABLE orders ADD COLUMN assigned_team_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add assignment tracking to bookings table
ALTER TABLE bookings ADD COLUMN assigned_role TEXT DEFAULT 'agent';
ALTER TABLE bookings ADD COLUMN assigned_team_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Create indexes for metadata queries
CREATE INDEX idx_account_memberships_metadata ON account_memberships USING GIN(business_metadata);
CREATE INDEX idx_orders_assigned member ON orders(assigned_team_member_id);
CREATE INDEX idx_bookings_assigned_member ON bookings(assigned_team_member_id);

-- Create index for role-based queries
CREATE INDEX idx_account_memberships_account_role ON account_memberships(account_id, role);

-- Add comment to document business_metadata structure
COMMENT ON COLUMN account_memberships.business_metadata IS 
'Business-type-specific metadata for team members. Structure by business type:
- logistics: {vehicle_type, freight_capacity, zone_coverage[], current_location{lat,lng}, max_active_orders, license_plate}
- service: {certifications[], service_areas[], availability_calendar{day:[]}, max_concurrent_appointments}
- healthcare: {specialization, license_number, available_hours[], max_patients_per_day}
- beauty: {services_offered[], station_number, max_appointments_per_day}
- automotive: {specializations[], certifications[], service_areas[]}
- fitness: {certifications[], specializations[], max_clients_per_session}
- pet_services: {specializations[], certifications[], service_areas[]}
- cleaning: {specializations[], service_areas[], max_jobs_per_day}
';

-- Update RLS policies to include new roles in role checks
-- The existing has_role_in_account function should handle new enum values automatically
-- No policy changes needed as they use the enum type directly
