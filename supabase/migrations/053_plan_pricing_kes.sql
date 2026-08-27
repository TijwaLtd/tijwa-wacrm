-- ============================================================
-- 053_plan_pricing_kes.sql
-- New pricing tiers + full feature matrix + AI credit allocations
--
-- Pricing strategy:
--   Starter:   KES 2,500/mo — small businesses getting organized
--   Business:  KES 5,000/mo — actively selling on WhatsApp ⭐
--   Growth:    KES 10,000/mo — teams, higher volume
--   Enterprise: KES 25,000+/mo — custom
--
-- Meta WhatsApp charges are paid by customer separately.
-- ============================================================

-- Update get_plan_features with full feature matrix
CREATE OR REPLACE FUNCTION get_plan_features(p_plan TEXT)
RETURNS JSONB AS $$
  SELECT CASE p_plan
    WHEN 'starter' THEN '{
      "max_contacts": 2000,
      "max_team_members": 1,
      "max_broadcasts_per_month": 100,
      "max_automations": 10,
      "max_flows": 5,
      "max_pipelines": 1,
      "max_deals_per_pipeline": 50,
      "ai_replies_per_month": 0,
      "ai_credits_per_month": 0,
      "ai_conversations_per_month": 0,
      "max_whatsapp_numbers": 1,
      "has_ai_assistant": false,
      "has_knowledge_base": false,
      "has_analytics": false,
      "has_priority_support": false,
      "has_custom_integrations": false,
      "price_kes": 2500,
      "price_usd": 19
    }'::jsonb
    WHEN 'business' THEN '{
      "max_contacts": 10000,
      "max_team_members": 3,
      "max_broadcasts_per_month": 500,
      "max_automations": 50,
      "max_flows": 25,
      "max_pipelines": 3,
      "max_deals_per_pipeline": 200,
      "ai_replies_per_month": 2000,
      "ai_credits_per_month": 400,
      "ai_conversations_per_month": 500,
      "max_whatsapp_numbers": 2,
      "has_ai_assistant": true,
      "has_knowledge_base": true,
      "has_analytics": false,
      "has_priority_support": false,
      "has_custom_integrations": false,
      "price_kes": 5000,
      "price_usd": 38
    }'::jsonb
    WHEN 'growth' THEN '{
      "max_contacts": 50000,
      "max_team_members": 5,
      "max_broadcasts_per_month": 2000,
      "max_automations": 200,
      "max_flows": 100,
      "max_pipelines": 10,
      "max_deals_per_pipeline": 1000,
      "ai_replies_per_month": 5000,
      "ai_credits_per_month": 1000,
      "ai_conversations_per_month": 1500,
      "max_whatsapp_numbers": 3,
      "has_ai_assistant": true,
      "has_knowledge_base": true,
      "has_analytics": true,
      "has_priority_support": false,
      "has_custom_integrations": false,
      "price_kes": 10000,
      "price_usd": 75
    }'::jsonb
    WHEN 'enterprise' THEN '{
      "max_contacts": 500000,
      "max_team_members": 999,
      "max_broadcasts_per_month": 999999,
      "max_automations": 9999,
      "max_flows": 9999,
      "max_pipelines": 9999,
      "max_deals_per_pipeline": 999999,
      "ai_replies_per_month": 999999,
      "ai_credits_per_month": 999999,
      "ai_conversations_per_month": 999999,
      "max_whatsapp_numbers": 10,
      "has_ai_assistant": true,
      "has_knowledge_base": true,
      "has_analytics": true,
      "has_priority_support": true,
      "has_custom_integrations": true,
      "price_kes": 25000,
      "price_usd": 188
    }'::jsonb
    ELSE '{
      "max_contacts": 2000,
      "max_team_members": 1,
      "max_broadcasts_per_month": 100,
      "max_automations": 10,
      "max_flows": 5,
      "max_pipelines": 1,
      "max_deals_per_pipeline": 50,
      "ai_replies_per_month": 0,
      "ai_credits_per_month": 0,
      "ai_conversations_per_month": 0,
      "max_whatsapp_numbers": 1,
      "has_ai_assistant": false,
      "has_knowledge_base": false,
      "has_analytics": false,
      "has_priority_support": false,
      "has_custom_integrations": false,
      "price_kes": 2500,
      "price_usd": 19
    }'::jsonb
  END;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_plan_features IS 'Full plan feature matrix. Starter has no AI assistant. Meta WhatsApp charges are paid by customer separately.';

-- Update default plan in tenant_settings (no free tier)
ALTER TABLE tenant_settings ALTER COLUMN plan SET DEFAULT 'starter';
