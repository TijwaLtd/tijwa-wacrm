-- ============================================================
-- 053_plan_pricing_kes.sql
-- Add KES pricing to plan features + per-conversation AI cost
-- ============================================================

-- Update get_plan_features with KES prices and AI credit details
CREATE OR REPLACE FUNCTION get_plan_features(p_plan TEXT)
RETURNS JSONB AS $$
  SELECT CASE p_plan
    WHEN 'starter' THEN '{
      "max_contacts": 1000,
      "max_team_members": 5,
      "max_broadcasts_per_month": 50,
      "max_automations": 20,
      "max_flows": 10,
      "ai_replies_per_month": 100,
      "ai_credits_per_month": 100,
      "ai_credits_per_conversation": 1,
      "price_kes": 0,
      "price_usd": 0
    }'::jsonb
    WHEN 'pro' THEN '{
      "max_contacts": 25000,
      "max_team_members": 25,
      "max_broadcasts_per_month": 500,
      "max_automations": 100,
      "max_flows": 50,
      "ai_replies_per_month": 1000,
      "ai_credits_per_month": 1000,
      "ai_credits_per_conversation": 1,
      "price_kes": 3900,
      "price_usd": 29
    }'::jsonb
    WHEN 'enterprise' THEN '{
      "max_contacts": 1000000,
      "max_team_members": 999,
      "max_broadcasts_per_month": 999999,
      "max_automations": 9999,
      "max_flows": 9999,
      "ai_replies_per_month": 999999,
      "ai_credits_per_month": 999999,
      "ai_credits_per_conversation": 1,
      "price_kes": 0,
      "price_usd": 0
    }'::jsonb
    ELSE '{
      "max_contacts": 1000,
      "max_team_members": 5,
      "max_broadcasts_per_month": 50,
      "max_automations": 20,
      "max_flows": 10,
      "ai_replies_per_month": 100,
      "ai_credits_per_month": 100,
      "ai_credits_per_conversation": 1,
      "price_kes": 0,
      "price_usd": 0
    }'::jsonb
  END;
$$ LANGUAGE sql STABLE;

-- Per-conversation AI cost (flat fee per AI reply, in addition to token costs)
-- This ensures even cheap conversations consume at least 1 credit
COMMENT ON FUNCTION get_plan_features IS 'Returns plan limits. price_kes is monthly cost in Kenya Shillings. ai_credits_per_conversation is the flat credit cost per AI reply.';
