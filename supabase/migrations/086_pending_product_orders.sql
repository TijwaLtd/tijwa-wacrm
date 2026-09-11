-- ============================================================
-- Pending product orders for retailer / wholesaler
-- Same pattern as pending_food_orders — stores AI-collected
-- data temporarily until user confirms via WhatsApp buttons.
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_product_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  user_id UUID,
  items JSONB NOT NULL DEFAULT '[]',           -- [{name, quantity, unit_price, product_id}]
  item_count INTEGER NOT NULL DEFAULT 0,
  order_type TEXT NOT NULL DEFAULT 'delivery',  -- 'delivery', 'pickup', 'wholesale'
  delivery_address TEXT,
  notes TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_product_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_product_orders_account ON pending_product_orders(account_id);
CREATE INDEX IF NOT EXISTS idx_pending_product_orders_contact ON pending_product_orders(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_product_orders_expires ON pending_product_orders(expires_at);
