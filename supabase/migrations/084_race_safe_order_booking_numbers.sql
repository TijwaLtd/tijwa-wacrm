-- ============================================================
-- Fix: Race-condition-safe order and booking number generators
--
-- The old RPCs used SELECT MAX()+1 which is vulnerable to race
-- conditions (two concurrent requests get the same number).
-- Sequences are atomic and safe for concurrent use.
-- ============================================================

-- 1. Create per-account sequences (idempotent)
-- We use a naming convention: order_seq_{account_id} and booking_seq_{account_id}
-- Sequences are created on-demand by the RPC functions below.

-- 2. Replace next_order_number with sequence-based version
CREATE OR REPLACE FUNCTION next_order_number(p_account_id UUID)
RETURNS TEXT AS $$
DECLARE
  seq_name TEXT;
  next_num INTEGER;
BEGIN
  seq_name := 'order_seq_' || REPLACE(p_account_id::TEXT, '-', '_');

  -- Create sequence if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = seq_name) THEN
    -- Seed from existing max order number for this account
    DECLARE
      max_num INTEGER;
    BEGIN
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(o.order_number FROM 'ORD-([0-9]+)') AS INTEGER)
      ), 0) INTO max_num
      FROM orders o
      WHERE o.account_id = p_account_id;

      EXECUTE FORMAT(
        'CREATE SEQUENCE %I START WITH %s INCREMENT BY 1 NO CACHE',
        seq_name, max_num + 1
      );
    END;
  END IF;

  next_num := nextval(seq_name);
  RETURN 'ORD-' || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Replace next_booking_number with sequence-based version
CREATE OR REPLACE FUNCTION next_booking_number(p_account_id UUID)
RETURNS TEXT AS $$
DECLARE
  seq_name TEXT;
  next_num INTEGER;
BEGIN
  seq_name := 'booking_seq_' || REPLACE(p_account_id::TEXT, '-', '_');

  -- Create sequence if it doesn't exist
  IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = seq_name) THEN
    DECLARE
      max_num INTEGER;
    BEGIN
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(b.booking_number FROM 'BK-([0-9]+)') AS INTEGER)
      ), 0) INTO max_num
      FROM bookings b
      WHERE b.account_id = p_account_id;

      EXECUTE FORMAT(
        'CREATE SEQUENCE %I START WITH %s INCREMENT BY 1 NO CACHE',
        seq_name, max_num + 1
      );
    END;
  END IF;

  next_num := nextval(seq_name);
  RETURN 'BK-' || LPAD(next_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
