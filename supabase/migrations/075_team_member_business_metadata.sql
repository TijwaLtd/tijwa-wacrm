-- Add business metadata to account_memberships for business-type-specific attributes
-- All statements are idempotent — safe to re-run if partially applied.

ALTER TABLE account_memberships ADD COLUMN IF NOT EXISTS business_metadata JSONB DEFAULT '{}'::jsonb;

-- Add business-type-specific roles to account_role_enum
-- Matches src/lib/auth/roles.ts AccountRole type exactly
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'manager';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'driver';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'rider';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'receptionist';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'doctor';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'instructor';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'waiter';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'cleaner';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'technician';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'provider';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE account_role_enum ADD VALUE IF NOT EXISTS 'specialist';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add assignment tracking to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_role TEXT DEFAULT 'agent';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_team_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add assignment tracking to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_role TEXT DEFAULT 'agent';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS assigned_team_member_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Create indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_account_memberships_metadata ON account_memberships USING GIN(business_metadata);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_member ON orders(assigned_team_member_id);
CREATE INDEX IF NOT EXISTS idx_bookings_assigned_member ON bookings(assigned_team_member_id);
CREATE INDEX IF NOT EXISTS idx_account_memberships_account_role ON account_memberships(account_id, role);

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
