-- ============================================================
-- 079_fix_redeem_seat_limit_plan_lookup.sql
--
-- The redeem_invitation RPC looked up the plan from subscriptions
-- only. If the subscriptions row was stale (e.g. still 'starter'
-- after upgrading), it blocked invites from higher-plan accounts.
--
-- Fix: use tenant_settings.plan as the source of truth for the
-- plan name (that's what the billing UI writes to). Subscriptions
-- is only used for billing metadata (period, status, extra_seats).
--
-- Also: skip seat check if the caller is already a member of the
-- account (e.g. owner accepting their own invite).
-- ============================================================

CREATE OR REPLACE FUNCTION public.redeem_invitation(
  p_token_hash TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_inv account_invitations%ROWTYPE;
  v_plan TEXT;
  v_plan_seats INTEGER;
  v_extra_seats INTEGER;
  v_current_members INTEGER;
  v_total_seats INTEGER;
  v_already_member BOOLEAN;
  v_result JSONB;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- Get invitation
  SELECT * INTO v_inv
  FROM account_invitations
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
  END IF;
  IF v_inv.accepted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invitation has already been used' USING ERRCODE = '22023';
  END IF;
  IF v_inv.expires_at <= NOW() THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = '22023';
  END IF;

  -- Check if caller is already a member (e.g. owner accepting own invite)
  SELECT EXISTS(
    SELECT 1 FROM account_memberships
    WHERE user_id = v_caller_id AND account_id = v_inv.account_id
  ) INTO v_already_member;

  -- If already a member, skip seat check — just mark invite accepted
  IF v_already_member THEN
    UPDATE account_invitations
    SET accepted_at = NOW(), accepted_by_user_id = v_caller_id
    WHERE id = v_inv.id;

    RETURN jsonb_build_object(
      'account_id', v_inv.account_id,
      'role', v_inv.role,
      'seat_limit_reached', false,
      'already_member', true
    );
  END IF;

  -- Plan source of truth: tenant_settings.plan (what the billing UI writes)
  SELECT plan INTO v_plan
  FROM tenant_settings
  WHERE account_id = v_inv.account_id;

  v_plan := COALESCE(v_plan, 'starter');

  -- Get plan seat limit
  v_plan_seats := ((get_plan_features(v_plan)::jsonb ->> 'max_team_members')::INTEGER);
  v_plan_seats := COALESCE(v_plan_seats, 1);

  -- Get extra seats from subscriptions (billing metadata)
  SELECT COALESCE(extra_seats, 0) INTO v_extra_seats
  FROM subscriptions
  WHERE account_id = v_inv.account_id
    AND status IN ('active', 'trialing', 'past_due')
  ORDER BY created_at DESC
  LIMIT 1;

  v_extra_seats := COALESCE(v_extra_seats, 0);
  v_total_seats := v_plan_seats + v_extra_seats;

  -- Count current members
  SELECT COUNT(*) INTO v_current_members
  FROM account_memberships
  WHERE account_id = v_inv.account_id;

  -- Check if over limit
  IF v_current_members >= v_total_seats THEN
    RAISE EXCEPTION 'Team member limit reached. Your % plan allows % seats%.',
      v_plan,
      v_total_seats,
      CASE WHEN v_extra_seats > 0 THEN
        ' (' || v_plan_seats || ' included + ' || v_extra_seats || ' extra)'
      ELSE
        '. Upgrade your plan or ask the admin to purchase extra seats.'
      END
    USING ERRCODE = 'P0001',
      DETAIL = jsonb_build_object(
        'seat_limit_reached', true,
        'plan', v_plan,
        'included_seats', v_plan_seats,
        'extra_seats', v_extra_seats,
        'total_seats', v_total_seats,
        'current_members', v_current_members,
        'seat_price_kes', 750,
        'account_id', v_inv.account_id
      )::text;
  END IF;

  -- M:N JOIN: Insert membership
  INSERT INTO account_memberships (user_id, account_id, role)
  VALUES (v_caller_id, v_inv.account_id, v_inv.role)
  ON CONFLICT (user_id, account_id) DO NOTHING;

  -- Mark invitation accepted
  UPDATE account_invitations
  SET accepted_at = NOW(), accepted_by_user_id = v_caller_id
  WHERE id = v_inv.id;

  -- Return success
  RETURN jsonb_build_object(
    'account_id', v_inv.account_id,
    'role', v_inv.role,
    'seat_limit_reached', false
  );
END;
$$;

ALTER FUNCTION public.redeem_invitation(TEXT) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_invitation(TEXT) TO authenticated;
