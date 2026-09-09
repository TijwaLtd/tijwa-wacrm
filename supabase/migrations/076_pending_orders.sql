-- ============================================================
-- Pending Orders — staging table for AI-collected order data
--
-- When the AI collects delivery details, it stores them here
-- with a preview price. The customer sees a summary with
-- Confirm/Edit/Cancel buttons.
--
-- On Confirm: handler creates the real order, sends confirmation,
-- then deletes the pending row.
-- On Edit: handler feeds the pending data back to AI as context.
-- On Cancel: handler deletes the pending row.
--
-- Rows auto-expire after 30 minutes via index + cleanup.
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),

  -- Order data collected by AI
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  item_count INTEGER DEFAULT 1,
  pickup_location TEXT,
  dropoff_location TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'local',
  vendor_stops INTEGER DEFAULT 1,
  weight_kg NUMERIC(8,2),
  notes TEXT,
  customer_name TEXT,
  customer_phone TEXT,

  -- Pricing (calculated at preview time)
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  offering_id UUID,
  offering_name TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Expiry
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for lookup by contact + conversation (button click handler)
CREATE INDEX IF NOT EXISTS idx_pending_orders_lookup
  ON pending_orders (account_id, contact_id, conversation_id);

-- Index for cleanup of expired rows
CREATE INDEX IF NOT EXISTS idx_pending_orders_expiry
  ON pending_orders (expires_at);

-- RLS — tenant isolation
ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pending_orders_tenant_isolation" ON pending_orders
  USING (account_id = (SELECT auth.uid() AS uid));

-- Grant service role full access (API routes use service client)
GRANT ALL ON pending_orders TO service_role;

-- Function to clean up expired pending orders
CREATE OR REPLACE FUNCTION cleanup_expired_pending_orders()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM pending_orders WHERE expires_at <= NOW();
END;
$$;

COMMENT ON TABLE pending_orders IS 'Staging table for AI-collected order data before customer confirmation. Auto-expires after 30 minutes.';
COMMENT ON COLUMN pending_orders.items IS 'JSON array of item descriptions, e.g. ["3 bags of cement", "1 box of tiles"]';
COMMENT ON COLUMN pending_orders.zone_type IS 'local or extended — determined by AI via location mapping';
COMMENT ON COLUMN pending_orders.price IS 'Calculated price shown to customer at preview time';
