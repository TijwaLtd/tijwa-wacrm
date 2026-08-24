-- ============================================================
-- EMAIL LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  template_name TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed', 'bounced')),
  resend_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_account_created
  ON email_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_created
  ON email_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status
  ON email_logs(status);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Only service-role (server) can write logs. Users can read their own.
CREATE POLICY email_logs_select ON email_logs FOR SELECT
  USING (
    auth.uid() = user_id
    OR account_id IN (
      SELECT account_id FROM account_memberships WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- USER EMAIL PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS user_email_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  plan_changes BOOLEAN NOT NULL DEFAULT true,
  invitations BOOLEAN NOT NULL DEFAULT true,
  ai_credits_low BOOLEAN NOT NULL DEFAULT true,
  weekly_digest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_email_preferences ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own preferences.
CREATE POLICY user_email_preferences_select ON user_email_preferences FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY user_email_preferences_insert ON user_email_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_email_preferences_update ON user_email_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- FUNCTION: auto-create email prefs on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user_email_prefs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_email_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

ALTER FUNCTION handle_new_user_email_prefs() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_created_email_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_email_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_email_prefs();
