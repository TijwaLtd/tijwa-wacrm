-- ============================================================
-- 104_reporting.sql
--
-- Business reporting foundation:
--   1. report_configs     — per-account schedule (weekly/monthly, recipients)
--   2. business_reports   — generated report history (metrics JSON + PDF path)
--   3. Aggregation RPCs   — current vs previous period + daily series
--      (chat, commerce, food, hospitality, property, ngo, services)
--   4. 'reports' capability + backfill for existing accounts
--
-- Periods are UTC windows [p_from, p_to). Daily series keys are
-- UTC calendar days; gap-filling happens app-side.
-- All RPCs are SECURITY DEFINER with an auth guard: any signed-in
-- caller must be a member (agent+); service-role (auth.uid() IS NULL,
-- e.g. cron) passes through.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS report_configs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  frequency     TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly')),
  weekday       INT NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6), -- 0=Sun .. 6=Sat (weekly runs)
  recipients    TEXT[] NOT NULL DEFAULT '{}',
  last_sent_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE report_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view report config" ON report_configs;
CREATE POLICY "Members view report config" ON report_configs FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

DROP POLICY IF EXISTS "Admins manage report config" ON report_configs;
CREATE POLICY "Admins manage report config" ON report_configs FOR ALL
  USING (has_role_in_account(auth.uid(), account_id, 'admin'))
  WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin'));

CREATE TABLE IF NOT EXISTS business_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period        TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'daily', 'custom')),
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL, -- exclusive
  metrics       JSONB NOT NULL DEFAULT '{}',
  pdf_path      TEXT,
  sent_at       TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_reports_account
  ON business_reports(account_id, period_start DESC);

ALTER TABLE business_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view reports" ON business_reports;
CREATE POLICY "Members view reports" ON business_reports FOR SELECT
  USING (has_role_in_account(auth.uid(), account_id, 'agent'));

DROP POLICY IF EXISTS "Admins insert reports" ON business_reports;
CREATE POLICY "Admins insert reports" ON business_reports FOR INSERT
  WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin') OR auth.uid() IS NULL);

DROP POLICY IF EXISTS "Admins delete reports" ON business_reports;
CREATE POLICY "Admins delete reports" ON business_reports FOR DELETE
  USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ------------------------------------------------------------
-- 2. AUTH GUARD (shared by all RPCs)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_assert_access(p_account_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service-role callers (cron) have no JWT uid; direct API callers must be members.
  IF auth.uid() IS NOT NULL AND NOT has_role_in_account(auth.uid(), p_account_id, 'agent') THEN
    RAISE EXCEPTION 'not authorized for account %', p_account_id;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 3. RPC: CHAT METRICS (universal — every business type)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_chat_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT jsonb_build_object(
    'current', cur.totals,
    'previous', prev.totals,
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'incoming', COUNT(*) FILTER (WHERE m.sender_type = 'customer'),
      'outgoing', COUNT(*) FILTER (WHERE m.sender_type IN ('agent', 'bot')),
      'bot_replies', COUNT(*) FILTER (WHERE m.sender_type = 'bot'),
      'human_replies', COUNT(*) FILTER (WHERE m.sender_type = 'agent'),
      'conversations_opened', (SELECT COUNT(*) FROM conversations c
        WHERE c.account_id = p_account_id AND c.created_at >= p_from AND c.created_at < p_to),
      'conversations_closed', (SELECT COUNT(*) FROM conversations c
        WHERE c.account_id = p_account_id AND c.status = 'closed'
          AND c.updated_at >= p_from AND c.updated_at < p_to),
      'first_response_avg_seconds', (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (fr.first_reply - fr.first_in))))::int
        FROM (
          SELECT MIN(m.created_at) FILTER (WHERE m.sender_type = 'customer') AS first_in,
                 MIN(m.created_at) FILTER (WHERE m.sender_type IN ('agent', 'bot')) AS first_reply
          FROM conversations c
          JOIN messages m ON m.conversation_id = c.id
          WHERE c.account_id = p_account_id
            AND m.created_at >= p_from AND m.created_at < p_to
          GROUP BY c.id
        ) fr
        WHERE fr.first_in IS NOT NULL AND fr.first_reply IS NOT NULL
          AND fr.first_reply >= fr.first_in
      )
    ) AS totals
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'incoming', COUNT(*) FILTER (WHERE m.sender_type = 'customer'),
      'outgoing', COUNT(*) FILTER (WHERE m.sender_type IN ('agent', 'bot')),
      'bot_replies', COUNT(*) FILTER (WHERE m.sender_type = 'bot'),
      'human_replies', COUNT(*) FILTER (WHERE m.sender_type = 'agent'),
      'conversations_opened', (SELECT COUNT(*) FROM conversations c
        WHERE c.account_id = p_account_id AND c.created_at >= v_prev_from AND c.created_at < p_from),
      'conversations_closed', (SELECT COUNT(*) FROM conversations c
        WHERE c.account_id = p_account_id AND c.status = 'closed'
          AND c.updated_at >= v_prev_from AND c.updated_at < p_from),
      'first_response_avg_seconds', (
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM (fr.first_reply - fr.first_in))))::int
        FROM (
          SELECT MIN(m.created_at) FILTER (WHERE m.sender_type = 'customer') AS first_in,
                 MIN(m.created_at) FILTER (WHERE m.sender_type IN ('agent', 'bot')) AS first_reply
          FROM conversations c
          JOIN messages m ON m.conversation_id = c.id
          WHERE c.account_id = p_account_id
            AND m.created_at >= v_prev_from AND m.created_at < p_from
          GROUP BY c.id
        ) fr
        WHERE fr.first_in IS NOT NULL AND fr.first_reply IS NOT NULL
          AND fr.first_reply >= fr.first_in
      )
    ) AS totals
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'day', day,
        'incoming', incoming,
        'outgoing', outgoing
      ) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT to_char(m.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*) FILTER (WHERE m.sender_type = 'customer') AS incoming,
             COUNT(*) FILTER (WHERE m.sender_type IN ('agent', 'bot')) AS outgoing
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.account_id = p_account_id
        AND m.created_at >= p_from AND m.created_at < p_to
      GROUP BY 1
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 4. RPC: COMMERCE (retailer / wholesaler / product ordering)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_commerce_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT jsonb_build_object(
    'current', cur.t,
    'previous', prev.t,
    'top_items', COALESCE(top.items, '[]'::jsonb),
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'orders', COUNT(*) FILTER (WHERE o.status <> 'cancelled'),
      'revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'aov', COALESCE(AVG(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'items_sold', COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
        JOIN orders o2 ON o2.id = oi.order_id
        WHERE o2.account_id = p_account_id AND o2.created_at >= p_from AND o2.created_at < p_to
          AND o2.status <> 'cancelled'), 0),
      'awaiting_confirmation', COUNT(*) FILTER (WHERE o.status = 'pending'),
      'cancellations', COUNT(*) FILTER (WHERE o.status = 'cancelled'),
      'pending_inquiries', (
        (SELECT COUNT(*) FROM pending_product_orders p WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to)
      + (SELECT COUNT(*) FROM pending_orders p WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to)
      ),
      'repeat_order_pct', (
        SELECT CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE oc.cnt > 1) / COUNT(*)) END
        FROM (
          SELECT COUNT(*) AS cnt FROM orders o3
          WHERE o3.account_id = p_account_id AND o3.created_at >= p_from AND o3.created_at < p_to
            AND o3.status <> 'cancelled' AND o3.contact_id IS NOT NULL
          GROUP BY o3.contact_id
        ) oc
      )::float8
    ) AS t
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'orders', COUNT(*) FILTER (WHERE o.status <> 'cancelled'),
      'revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'aov', COALESCE(AVG(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'items_sold', COALESCE((SELECT SUM(oi.quantity) FROM order_items oi
        JOIN orders o2 ON o2.id = oi.order_id
        WHERE o2.account_id = p_account_id AND o2.created_at >= v_prev_from AND o2.created_at < p_from
          AND o2.status <> 'cancelled'), 0),
      'awaiting_confirmation', COUNT(*) FILTER (WHERE o.status = 'pending'),
      'cancellations', COUNT(*) FILTER (WHERE o.status = 'cancelled'),
      'pending_inquiries', (
        (SELECT COUNT(*) FROM pending_product_orders p WHERE p.account_id = p_account_id AND p.created_at >= v_prev_from AND p.created_at < p_from)
      + (SELECT COUNT(*) FROM pending_orders p WHERE p.account_id = p_account_id AND p.created_at >= v_prev_from AND p.created_at < p_from)
      ),
      'repeat_order_pct', 0::float8
    ) AS t
    FROM orders o
    WHERE o.account_id = p_account_id AND o.created_at >= v_prev_from AND o.created_at < p_from
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(row_json ORDER BY qty DESC, revenue DESC), '[]'::jsonb) AS items
    FROM (
      SELECT jsonb_build_object('name', oi.name, 'quantity', SUM(oi.quantity), 'revenue', SUM(oi.total_price)::float8) AS row_json,
             SUM(oi.quantity) AS qty,
             SUM(oi.total_price) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
        AND o.status <> 'cancelled'
      GROUP BY oi.name
      ORDER BY SUM(oi.quantity) DESC
      LIMIT 5
    ) t
  ) top
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('day', day, 'orders', orders, 'revenue', revenue) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*) FILTER (WHERE o.status <> 'cancelled') AS orders,
             COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8 AS revenue
      FROM orders o
      WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY 1
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 5. RPC: FOOD (restaurant / hotel_restaurant)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_food_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT jsonb_build_object(
    'current', cur.t,
    'previous', prev.t,
    'top_items', COALESCE(top.items, '[]'::jsonb),
    'peak_hours', COALESCE(peak.hours, '[]'::jsonb),
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'orders', COUNT(*) FILTER (WHERE o.status <> 'cancelled'),
      'revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'avg_ticket', COALESCE(AVG(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'reservations', (SELECT COUNT(*) FROM bookings b
        WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
          AND b.metadata->>'type' = 'reservation' AND b.status <> 'cancelled'),
      'pending_inquiries', (SELECT COUNT(*) FROM pending_food_orders p
        WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to)
    ) AS t
    FROM orders o
    WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'orders', COUNT(*) FILTER (WHERE o.status <> 'cancelled'),
      'revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'avg_ticket', COALESCE(AVG(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8,
      'reservations', (SELECT COUNT(*) FROM bookings b
        WHERE b.account_id = p_account_id AND b.created_at >= v_prev_from AND b.created_at < p_from
          AND b.metadata->>'type' = 'reservation' AND b.status <> 'cancelled'),
      'pending_inquiries', (SELECT COUNT(*) FROM pending_food_orders p
        WHERE p.account_id = p_account_id AND p.created_at >= v_prev_from AND p.created_at < p_from)
    ) AS t
    FROM orders o
    WHERE o.account_id = p_account_id AND o.created_at >= v_prev_from AND o.created_at < p_from
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(row_json ORDER BY qty DESC, revenue DESC), '[]'::jsonb) AS items
    FROM (
      SELECT jsonb_build_object('name', oi.name, 'quantity', SUM(oi.quantity), 'revenue', SUM(oi.total_price)::float8) AS row_json,
             SUM(oi.quantity) AS qty,
             SUM(oi.total_price) AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
        AND o.status <> 'cancelled'
        AND EXISTS (SELECT 1 FROM offerings off WHERE off.id = oi.offering_id AND off.type = 'menu_item')
      GROUP BY oi.name
      ORDER BY SUM(oi.quantity) DESC
      LIMIT 5
    ) t
  ) top
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('hour', hr, 'orders', cnt) ORDER BY hr
    ), '[]'::jsonb) AS hours
    FROM (
      SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'UTC')::int AS hr,
             COUNT(*) AS cnt
      FROM orders o
      WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
        AND o.status <> 'cancelled'
      GROUP BY 1
      ORDER BY COUNT(*) DESC
      LIMIT 6
    ) h
  ) peak
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('day', day, 'orders', orders, 'revenue', revenue) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*) FILTER (WHERE o.status <> 'cancelled') AS orders,
             COALESCE(SUM(o.total) FILTER (WHERE o.status IN ('confirmed','processing','shipped','delivered')), 0)::float8 AS revenue
      FROM orders o
      WHERE o.account_id = p_account_id AND o.created_at >= p_from AND o.created_at < p_to
      GROUP BY 1
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 6. RPC: HOSPITALITY (hotel / hotel_restaurant)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_hospitality_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_days NUMERIC := GREATEST(EXTRACT(EPOCH FROM (p_to - p_from)) / 86400, 1);
  v_prev_days NUMERIC := GREATEST(EXTRACT(EPOCH FROM (p_from - v_prev_from)) / 86400, 1);
  v_rooms INT;
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT COUNT(*) INTO v_rooms FROM offerings
  WHERE account_id = p_account_id AND type = 'room' AND status = 'active';

  SELECT jsonb_build_object(
    'current', cur.t,
    'previous', prev.t,
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'bookings', COUNT(*) FILTER (WHERE b.status <> 'cancelled'),
      'revenue', COALESCE(SUM(b.total) FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out')), 0)::float8,
      'room_nights', COALESCE(SUM(GREATEST((b.end_date::date - b.start_date::date), 1))
        FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out') AND b.start_date IS NOT NULL AND b.end_date IS NOT NULL), 0)::float8,
      'adr', CASE WHEN COALESCE(SUM(GREATEST((b.end_date::date - b.start_date::date), 1))
        FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out') AND b.start_date IS NOT NULL AND b.end_date IS NOT NULL), 0) > 0
        THEN (COALESCE(SUM(b.total) FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out')), 0)
              / SUM(GREATEST((b.end_date::date - b.start_date::date), 1))
                FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out') AND b.start_date IS NOT NULL AND b.end_date IS NOT NULL))::float8
        ELSE 0 END,
      'occupancy_pct', CASE WHEN v_rooms = 0 THEN 0 ELSE
        ROUND(100.0 * COALESCE(SUM(GREATEST((b.end_date::date - b.start_date::date), 1))
          FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out') AND b.start_date IS NOT NULL AND b.end_date IS NOT NULL), 0)
          / (v_rooms * v_days), 1)::float8 END,
      'cancellations', COUNT(*) FILTER (WHERE b.status = 'cancelled'),
      'pending_inquiries', (SELECT COUNT(*) FROM pending_bookings p
        WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to)
    ) AS t
    FROM bookings b
    WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'bookings', COUNT(*) FILTER (WHERE b.status <> 'cancelled'),
      'revenue', COALESCE(SUM(b.total) FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out')), 0)::float8,
      'room_nights', COALESCE(SUM(GREATEST((b.end_date::date - b.start_date::date), 1))
        FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out') AND b.start_date IS NOT NULL AND b.end_date IS NOT NULL), 0)::float8,
      'adr', 0::float8,
      'occupancy_pct', 0::float8,
      'cancellations', COUNT(*) FILTER (WHERE b.status = 'cancelled'),
      'pending_inquiries', (SELECT COUNT(*) FROM pending_bookings p
        WHERE p.account_id = p_account_id AND p.created_at >= v_prev_from AND p.created_at < p_from)
    ) AS t
    FROM bookings b
    WHERE b.account_id = p_account_id AND b.created_at >= v_prev_from AND b.created_at < p_from
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('day', day, 'bookings', bookings) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*) FILTER (WHERE b.status <> 'cancelled') AS bookings
      FROM bookings b
      WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
      GROUP BY 1
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 7. RPC: PROPERTY (property_real_estate)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_property_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT jsonb_build_object(
    'current', cur.t,
    'previous', prev.t,
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'new_inquiries', (SELECT COUNT(*) FROM pending_property_inquiries p
        WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to),
      'converted_inquiries', COUNT(*) FILTER (WHERE b.status <> 'cancelled'),
      'viewings', COUNT(*) FILTER (WHERE b.metadata->>'inquiry_type' = 'viewing' AND b.status <> 'cancelled'),
      'offers', COUNT(*) FILTER (WHERE b.metadata->>'inquiry_type' = 'offer'),
      'active_listings', (SELECT COUNT(*) FROM offerings o2
        WHERE o2.account_id = p_account_id AND o2.type = 'property' AND o2.status = 'active')
    ) AS t
    FROM bookings b
    WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
      AND b.metadata->>'type' = 'property_inquiry'
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'new_inquiries', (SELECT COUNT(*) FROM pending_property_inquiries p
        WHERE p.account_id = p_account_id AND p.created_at >= v_prev_from AND p.created_at < p_from),
      'converted_inquiries', COUNT(*) FILTER (WHERE b.status <> 'cancelled'),
      'viewings', COUNT(*) FILTER (WHERE b.metadata->>'inquiry_type' = 'viewing' AND b.status <> 'cancelled'),
      'offers', COUNT(*) FILTER (WHERE b.metadata->>'inquiry_type' = 'offer'),
      'active_listings', 0
    ) AS t
    FROM bookings b
    WHERE b.account_id = p_account_id AND b.created_at >= v_prev_from AND b.created_at < p_from
      AND b.metadata->>'type' = 'property_inquiry'
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('day', day, 'inquiries', inquiries) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT day, SUM(n) AS inquiries
      FROM (
        SELECT to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM pending_property_inquiries p
        WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to
        GROUP BY 1
        UNION ALL
        SELECT to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COUNT(*) AS n
        FROM bookings b
        WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
          AND b.metadata->>'type' = 'property_inquiry'
        GROUP BY 1
      ) u
      GROUP BY day
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 8. RPC: NGO (ngo_nonprofit)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_ngo_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT jsonb_build_object(
    'current', cur.t,
    'previous', prev.t,
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'applications', (SELECT COUNT(*) FROM ngo_applications a
        WHERE a.account_id = p_account_id AND a.created_at >= p_from AND a.created_at < p_to),
      'approved_applications', (SELECT COUNT(*) FROM ngo_applications a
        WHERE a.account_id = p_account_id AND a.created_at >= p_from AND a.created_at < p_to
          AND a.status = 'approved'),
      'enrollments', (SELECT COUNT(*) FROM training_enrollments e
        WHERE e.account_id = p_account_id AND e.created_at >= p_from AND e.created_at < p_to),
      'donations', (SELECT COUNT(*) FROM ngo_donations d
        WHERE d.account_id = p_account_id AND d.created_at >= p_from AND d.created_at < p_to
          AND d.status = 'confirmed'),
      'donation_amount', (SELECT COALESCE(SUM(d.amount), 0) FROM ngo_donations d
        WHERE d.account_id = p_account_id AND d.created_at >= p_from AND d.created_at < p_to
          AND d.status = 'confirmed')::float8,
      'active_programs', (SELECT COUNT(*) FROM ngo_programs p2
        WHERE p2.account_id = p_account_id AND p2.status = 'active')
    ) AS t
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'applications', (SELECT COUNT(*) FROM ngo_applications a
        WHERE a.account_id = p_account_id AND a.created_at >= v_prev_from AND a.created_at < p_from),
      'approved_applications', (SELECT COUNT(*) FROM ngo_applications a
        WHERE a.account_id = p_account_id AND a.created_at >= v_prev_from AND a.created_at < p_from
          AND a.status = 'approved'),
      'enrollments', (SELECT COUNT(*) FROM training_enrollments e
        WHERE e.account_id = p_account_id AND e.created_at >= v_prev_from AND e.created_at < p_from),
      'donations', (SELECT COUNT(*) FROM ngo_donations d
        WHERE d.account_id = p_account_id AND d.created_at >= v_prev_from AND d.created_at < p_from
          AND d.status = 'confirmed'),
      'donation_amount', (SELECT COALESCE(SUM(d.amount), 0) FROM ngo_donations d
        WHERE d.account_id = p_account_id AND d.created_at >= v_prev_from AND d.created_at < p_from
          AND d.status = 'confirmed')::float8,
      'active_programs', 0
    ) AS t
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('day', day, 'applications', applications, 'enrollments', enrollments) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT day, SUM(applications) AS applications, SUM(enrollments) AS enrollments
      FROM (
        SELECT to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
               COUNT(*) AS applications, 0 AS enrollments
        FROM ngo_applications a
        WHERE a.account_id = p_account_id AND a.created_at >= p_from AND a.created_at < p_to
        GROUP BY 1
        UNION ALL
        SELECT to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
               0, COUNT(*)
        FROM training_enrollments e
        WHERE e.account_id = p_account_id AND e.created_at >= p_from AND e.created_at < p_to
        GROUP BY 1
      ) u
      GROUP BY day
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 9. RPC: SERVICES (service_business / professional_services)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION report_services_metrics(
  p_account_id UUID,
  p_from TIMESTAMPTZ,
  p_to   TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_from TIMESTAMPTZ := p_from - (p_to - p_from);
  v_result JSONB;
BEGIN
  PERFORM report_assert_access(p_account_id);

  SELECT jsonb_build_object(
    'current', cur.t,
    'previous', prev.t,
    'top_services', COALESCE(top.items, '[]'::jsonb),
    'daily', COALESCE(daily.days, '[]'::jsonb)
  )
  INTO v_result
  FROM
  (
    SELECT jsonb_build_object(
      'bookings', COUNT(*) FILTER (WHERE b.status <> 'cancelled'),
      'revenue', COALESCE(SUM(b.total) FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out')), 0)::float8,
      'pending_inquiries', (SELECT COUNT(*) FROM pending_service_bookings p
        WHERE p.account_id = p_account_id AND p.created_at >= p_from AND p.created_at < p_to)
    ) AS t
    FROM bookings b
    WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
      AND (b.offering_id IS NULL OR EXISTS (
        SELECT 1 FROM offerings o WHERE o.id = b.offering_id AND o.type = 'service'))
  ) cur
  CROSS JOIN
  (
    SELECT jsonb_build_object(
      'bookings', COUNT(*) FILTER (WHERE b.status <> 'cancelled'),
      'revenue', COALESCE(SUM(b.total) FILTER (WHERE b.status IN ('confirmed','checked_in','checked_out')), 0)::float8,
      'pending_inquiries', (SELECT COUNT(*) FROM pending_service_bookings p
        WHERE p.account_id = p_account_id AND p.created_at >= v_prev_from AND p.created_at < p_from)
    ) AS t
    FROM bookings b
    WHERE b.account_id = p_account_id AND b.created_at >= v_prev_from AND b.created_at < p_from
      AND (b.offering_id IS NULL OR EXISTS (
        SELECT 1 FROM offerings o WHERE o.id = b.offering_id AND o.type = 'service'))
  ) prev
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(row_json ORDER BY n DESC), '[]'::jsonb) AS items
    FROM (
      SELECT jsonb_build_object('name', COALESCE(off.name, 'Unknown'), 'bookings', COUNT(*), 'revenue', COALESCE(SUM(b.total), 0)::float8) AS row_json,
             COUNT(*) AS n
      FROM bookings b
      LEFT JOIN offerings off ON off.id = b.offering_id
      WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
        AND b.status <> 'cancelled'
      GROUP BY COALESCE(off.name, 'Unknown')
      ORDER BY COUNT(*) DESC
      LIMIT 5
    ) t
  ) top
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object('day', day, 'bookings', bookings) ORDER BY day
    ), '[]'::jsonb) AS days
    FROM (
      SELECT to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             COUNT(*) FILTER (WHERE b.status <> 'cancelled') AS bookings
      FROM bookings b
      WHERE b.account_id = p_account_id AND b.created_at >= p_from AND b.created_at < p_to
      GROUP BY 1
    ) d
  ) daily;

  RETURN v_result;
END;
$$;

-- ------------------------------------------------------------
-- 10. GRANTS
-- ------------------------------------------------------------

DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'report_assert_access(UUID)',
    'report_chat_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)',
    'report_commerce_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)',
    'report_food_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)',
    'report_hospitality_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)',
    'report_property_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)',
    'report_ngo_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)',
    'report_services_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 11. CAPABILITY: 'reports' (all business types; sidebar + gating)
-- ------------------------------------------------------------

INSERT INTO business_capabilities (
  key, name, description, category, is_default_enabled,
  recommended_business_types, navigation
)
VALUES (
  'reports',
  'Reports',
  'Periodic business reports with comparisons, charts, and PDF delivery.',
  'general',
  TRUE,
  '["retailer","wholesaler","restaurant","hotel","hotel_restaurant","service_business","professional_services","education","ngo_nonprofit","property_real_estate","healthcare","events","agriculture","other"]'::jsonb,
  '{"label": "Reports", "icon": "BarChart3", "route": "/reports", "section": "operations"}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  navigation = EXCLUDED.navigation,
  recommended_business_types = EXCLUDED.recommended_business_types,
  is_default_enabled = EXCLUDED.is_default_enabled;

-- Backfill: enable for every existing account that doesn't have the row yet
INSERT INTO account_capabilities (account_id, capability_key, is_enabled)
SELECT a.id, 'reports', TRUE
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM account_capabilities ac
  WHERE ac.account_id = a.id AND ac.capability_key = 'reports'
);
