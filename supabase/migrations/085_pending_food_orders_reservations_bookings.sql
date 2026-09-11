-- ============================================================
-- Pending orders for restaurant, hotel, and food service
-- Same pattern as pending_orders (logistics) — stores AI-collected
-- data temporarily until user confirms via WhatsApp buttons.
-- ============================================================

-- Pending food orders (restaurant / hotel room service)
CREATE TABLE IF NOT EXISTS pending_food_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  user_id UUID,
  items JSONB NOT NULL DEFAULT '[]',           -- [{name, quantity, unit_price, special_instructions}]
  item_count INTEGER NOT NULL DEFAULT 0,
  order_type TEXT NOT NULL DEFAULT 'takeaway',  -- 'dine_in', 'takeaway', 'room_service'
  table_number TEXT,                            -- for dine_in
  room_number TEXT,                             -- for room_service
  pickup_location TEXT,                         -- for takeaway pickup
  notes TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  offering_id UUID,                             -- if ordering a specific menu item
  offering_name TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_food_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_food_orders_account ON pending_food_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_pending_food_orders_contact ON pending_food_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_food_orders_expires ON pending_food_orders(expires_at);

-- Pending reservations (restaurant table reservations)
CREATE TABLE IF NOT EXISTS pending_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  user_id UUID,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  party_size INTEGER NOT NULL DEFAULT 1,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 120,
  special_requests TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_reservations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_reservations_account ON pending_reservations(account_id);
CREATE INDEX IF NOT EXISTS idx_pending_reservations_contact ON pending_reservations(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_reservations_date ON pending_reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_pending_reservations_expires ON pending_reservations(expires_at);

-- Pending bookings (hotel room bookings)
CREATE TABLE IF NOT EXISTS pending_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  user_id UUID,
  offering_id UUID NOT NULL,                    -- room type
  offering_name TEXT NOT NULL,
  guest_name TEXT NOT NULL,
  guest_phone TEXT,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  nights INTEGER NOT NULL DEFAULT 1,
  guests INTEGER NOT NULL DEFAULT 1,
  room_number TEXT,                              -- assigned on confirm
  price_per_night NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  special_requests TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_bookings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_bookings_account ON pending_bookings(account_id);
CREATE INDEX IF NOT EXISTS idx_pending_bookings_contact ON pending_bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_bookings_checkin ON pending_bookings(check_in_date);
CREATE INDEX IF NOT EXISTS idx_pending_bookings_expires ON pending_bookings(expires_at);

-- Auto-cleanup expired pending records (run via pg_cron or application)
-- DELETE FROM pending_food_orders WHERE expires_at < NOW();
-- DELETE FROM pending_reservations WHERE expires_at < NOW();
-- DELETE FROM pending_bookings WHERE expires_at < NOW();
