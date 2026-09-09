-- ============================================================
-- Migration 077: Payment Methods
--
-- Adds payment_methods JSONB to tenant_settings so each account
-- can configure their accepted payment options (M-Pesa Till,
-- Paybill, Bank, Cash, etc.).
-- ============================================================

-- Add payment_methods column to tenant_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_settings' AND column_name = 'payment_methods'
  ) THEN
    ALTER TABLE tenant_settings ADD COLUMN payment_methods JSONB NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- ============================================================
-- payment_methods format (JSONB array):
-- [
--   {
--     "type": "mpesa_till",
--     "name": "M-Pesa Till",
--     "till_number": "123456",
--     "paybill_number": null,
--     "account_number": null,
--     "is_default": true,
--     "instructions": "Pay to Till before dispatch"
--   },
--   {
--     "type": "mpesa_paybill",
--     "name": "M-Pesa Paybill",
--     "till_number": null,
--     "paybill_number": "7891011",
--     "account_number": "12345",
--     "is_default": false,
--     "instructions": "Use order number as account reference"
--   },
--   {
--     "type": "bank_transfer",
--     "name": "Bank Transfer",
--     "bank_name": "KCB",
--     "account_number": "1234567890",
--     "is_default": false,
--     "instructions": "Send proof of payment"
--   },
--   {
--     "type": "cash",
--     "name": "Cash on Pickup",
--     "is_default": false,
--     "instructions": "Pay rider on pickup"
--   }
-- ]
-- ============================================================

-- Seed a default M-Pesa Till entry for existing accounts
UPDATE tenant_settings
SET payment_methods = '[
  {
    "type": "mpesa_till",
    "name": "M-Pesa Till",
    "till_number": "",
    "is_default": true,
    "instructions": "Pay to Till before dispatch"
  },
  {
    "type": "cash",
    "name": "Cash on Pickup",
    "is_default": false,
    "instructions": "Pay rider on pickup"
  }
]'::jsonb
WHERE payment_methods = '[]'::jsonb;

-- Add catalog_config if it doesn't exist (from migration 071)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tenant_settings' AND column_name = 'catalogue_config'
  ) THEN
    ALTER TABLE tenant_settings ADD COLUMN catalogue_config JSONB NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;
