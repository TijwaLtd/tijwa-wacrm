-- Pending service bookings (salon, gym, clinic, etc.)
CREATE TABLE IF NOT EXISTS pending_service_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  user_id UUID,
  offering_id UUID,
  offering_name TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  service_date DATE,
  service_time TIME,
  duration_minutes INTEGER DEFAULT 60,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_service_bookings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_service_bookings_account ON pending_service_bookings(account_id);
CREATE INDEX IF NOT EXISTS idx_pending_service_bookings_contact ON pending_service_bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_service_bookings_date ON pending_service_bookings(service_date);
CREATE INDEX IF NOT EXISTS idx_pending_service_bookings_expires ON pending_service_bookings(expires_at);
