-- Pending property inquiries / viewing requests
CREATE TABLE IF NOT EXISTS pending_property_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID,
  conversation_id UUID,
  user_id UUID,
  offering_id UUID,
  offering_name TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  inquiry_type TEXT NOT NULL DEFAULT 'inquiry',  -- 'inquiry', 'viewing', 'offer'
  preferred_date DATE,
  preferred_time TIME,
  budget NUMERIC(12,2),
  currency TEXT DEFAULT 'KES',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pending_property_inquiries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pending_property_inquiries_account ON pending_property_inquiries(account_id);
CREATE INDEX IF NOT EXISTS idx_pending_property_inquiries_contact ON pending_property_inquiries(contact_id);
CREATE INDEX IF NOT EXISTS idx_pending_property_inquiries_expires ON pending_property_inquiries(expires_at);
