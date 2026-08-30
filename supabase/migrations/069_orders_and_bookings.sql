-- ============================================================
-- 069_orders_and_bookings.sql — Orders & Bookings tables
--
-- Adds:
--   1. `orders` — customer orders (retail, wholesale, food)
--   2. `order_items` — line items per order
--   3. `bookings` — reservations (rooms, events, services)
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Order statuses
-- ============================================================
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. Booking statuses
-- ============================================================
DO $$ BEGIN
  CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 3. Orders table
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL,
  contact_id      UUID,
  status          order_status NOT NULL DEFAULT 'pending',
  currency        TEXT NOT NULL DEFAULT 'USD',
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, order_number)
);

CREATE INDEX IF NOT EXISTS idx_orders_account ON orders(account_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(account_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_contact ON orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(account_id, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY orders_select ON orders
  FOR SELECT USING (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = orders.account_id)
  );

DROP POLICY IF EXISTS "orders_insert" ON orders;
CREATE POLICY orders_insert ON orders
  FOR INSERT WITH CHECK (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = orders.account_id)
    AND has_role_in_account(auth.uid(), orders.account_id, 'agent')
  );

DROP POLICY IF EXISTS "orders_update" ON orders;
CREATE POLICY orders_update ON orders
  FOR UPDATE USING (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = orders.account_id)
    AND has_role_in_account(auth.uid(), orders.account_id, 'agent')
  );

DROP POLICY IF EXISTS "orders_delete" ON orders;
CREATE POLICY orders_delete ON orders
  FOR DELETE USING (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = orders.account_id)
    AND has_role_in_account(auth.uid(), orders.account_id, 'admin')
  );

-- ============================================================
-- 4. Order items table
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  offering_id  UUID REFERENCES offerings(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  quantity     INTEGER NOT NULL DEFAULT 1,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price  NUMERIC(12,2) NOT NULL DEFAULT 0,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY order_items_select ON order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM orders WHERE account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "order_items_insert" ON order_items;
CREATE POLICY order_items_insert ON order_items
  FOR INSERT WITH CHECK (
    order_id IN (SELECT id FROM orders WHERE account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "order_items_update" ON order_items;
CREATE POLICY order_items_update ON order_items
  FOR UPDATE USING (
    order_id IN (SELECT id FROM orders WHERE account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "order_items_delete" ON order_items;
CREATE POLICY order_items_delete ON order_items
  FOR DELETE USING (
    order_id IN (SELECT id FROM orders WHERE account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid()))
  );

-- ============================================================
-- 5. Bookings table
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  booking_number  TEXT NOT NULL,
  contact_id      UUID,
  offering_id     UUID REFERENCES offerings(id) ON DELETE SET NULL,
  status          booking_status NOT NULL DEFAULT 'pending',
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  guests          INTEGER NOT NULL DEFAULT 1,
  currency        TEXT NOT NULL DEFAULT 'USD',
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, booking_number)
);

CREATE INDEX IF NOT EXISTS idx_bookings_account ON bookings(account_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(account_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_contact ON bookings(contact_id);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bookings_select" ON bookings;
CREATE POLICY bookings_select ON bookings
  FOR SELECT USING (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = bookings.account_id)
  );

DROP POLICY IF EXISTS "bookings_insert" ON bookings;
CREATE POLICY bookings_insert ON bookings
  FOR INSERT WITH CHECK (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = bookings.account_id)
    AND has_role_in_account(auth.uid(), bookings.account_id, 'agent')
  );

DROP POLICY IF EXISTS "bookings_update" ON bookings;
CREATE POLICY bookings_update ON bookings
  FOR UPDATE USING (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = bookings.account_id)
    AND has_role_in_account(auth.uid(), bookings.account_id, 'agent')
  );

DROP POLICY IF EXISTS "bookings_delete" ON bookings;
CREATE POLICY bookings_delete ON bookings
  FOR DELETE USING (
    account_id = (SELECT account_id FROM account_memberships WHERE user_id = auth.uid() AND account_id = bookings.account_id)
    AND has_role_in_account(auth.uid(), bookings.account_id, 'admin')
  );

-- ============================================================
-- 6. Auto-update updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at ON orders;
CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

CREATE OR REPLACE FUNCTION update_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bookings_updated_at ON bookings;
CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION update_bookings_updated_at();

-- ============================================================
-- 7. RPC: Generate next order number
-- ============================================================
CREATE OR REPLACE FUNCTION next_order_number(p_account_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  order_num TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(o.order_number FROM 'ORD-([0-9]+)') AS INTEGER)
  ), 0) + 1 INTO next_num
  FROM orders o
  WHERE o.account_id = p_account_id;

  order_num := 'ORD-' || LPAD(next_num::TEXT, 5, '0');
  RETURN order_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. RPC: Generate next booking number
-- ============================================================
CREATE OR REPLACE FUNCTION next_booking_number(p_account_id UUID)
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  booking_num TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(b.booking_number FROM 'BK-([0-9]+)') AS INTEGER)
  ), 0) + 1 INTO next_num
  FROM bookings b
  WHERE b.account_id = p_account_id;

  booking_num := 'BK-' || LPAD(next_num::TEXT, 5, '0');
  RETURN booking_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
