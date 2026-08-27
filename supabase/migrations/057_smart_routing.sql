-- ============================================================
-- 057_smart_routing.sql
--
-- Smart routing system: departments, skills, working hours,
-- AI topic detection, presence-aware assignment.
--
-- Tables created:
--   1. departments           — per-account routing queues
--   2. agent_departments     — agent ↔ department junction
--   3. agent_skills          — agent expertise tags
--   4. account_schedules     — org-wide working hours
--   5. conversation_topics   — AI-detected topic/language
--
-- Columns added:
--   conversations: department_id, priority, detected_language
--   tenant_settings: auto_assign_config (JSONB)
-- ============================================================

-- ============================================================
-- 1. DEPARTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_assign_enabled BOOLEAN NOT NULL DEFAULT true,
  priority INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_account ON departments(account_id);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_tenant_isolation_select ON departments;
CREATE POLICY departments_tenant_isolation_select ON departments
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS departments_tenant_isolation_modify ON departments;
CREATE POLICY departments_tenant_isolation_modify ON departments
  FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- 2. AGENT ↔ DEPARTMENT JUNCTION
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_departments (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  skill_level INT NOT NULL DEFAULT 3 CHECK (skill_level BETWEEN 1 AND 5),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_departments_account ON agent_departments(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_departments_dept ON agent_departments(department_id);

ALTER TABLE agent_departments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_departments_tenant_isolation_select ON agent_departments;
CREATE POLICY agent_departments_tenant_isolation_select ON agent_departments
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS agent_departments_tenant_isolation_modify ON agent_departments;
CREATE POLICY agent_departments_tenant_isolation_modify ON agent_departments
  FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- 3. AGENT SKILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  level INT NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, account_id, skill)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_account ON agent_skills(account_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_user ON agent_skills(user_id);

ALTER TABLE agent_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_skills_tenant_isolation_select ON agent_skills;
CREATE POLICY agent_skills_tenant_isolation_select ON agent_skills
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS agent_skills_tenant_isolation_modify ON agent_skills;
CREATE POLICY agent_skills_tenant_isolation_modify ON agent_skills
  FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- 4. ACCOUNT-WIDE WORKING HOURS (per-department overrides optional later)
-- ============================================================
CREATE TABLE IF NOT EXISTS account_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL DEFAULT '09:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, department_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_account_schedules_account ON account_schedules(account_id);

ALTER TABLE account_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_schedules_tenant_isolation_select ON account_schedules;
CREATE POLICY account_schedules_tenant_isolation_select ON account_schedules
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS account_schedules_tenant_isolation_modify ON account_schedules;
CREATE POLICY account_schedules_tenant_isolation_modify ON account_schedules
  FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- 5. CONVERSATION TOPICS (AI-detected)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  detected_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  detected_language TEXT,
  detected_topic TEXT,
  confidence FLOAT DEFAULT 0,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_topics_account ON conversation_topics(account_id);
CREATE INDEX IF NOT EXISTS idx_conversation_topics_dept ON conversation_topics(detected_department_id);

ALTER TABLE conversation_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversation_topics_tenant_isolation_select ON conversation_topics;
CREATE POLICY conversation_topics_tenant_isolation_select ON conversation_topics
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS conversation_topics_tenant_isolation_modify ON conversation_topics;
CREATE POLICY conversation_topics_tenant_isolation_modify ON conversation_topics
  FOR ALL USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- ============================================================
-- 6. ADD COLUMNS TO CONVERSATIONS
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS detected_language TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_department ON conversations(department_id);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(account_id, priority DESC);

-- ============================================================
-- 7. AUTO-ASSIGN CONFIG ON TENANT_SETTINGS
-- ============================================================
ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS auto_assign_config JSONB NOT NULL DEFAULT '{
    "skip_offline": true,
    "max_active_per_agent": 20,
    "skill_weight": 0.3,
    "presence_weight": 0.3,
    "load_weight": 0.4,
    "after_hours_mode": "queue"
  }'::jsonb;

-- ============================================================
-- 8. HELPER: CHECK IF ACCOUNT IS WITHIN WORKING HOURS
-- ============================================================
CREATE OR REPLACE FUNCTION is_within_working_hours(
  p_account_id UUID,
  p_department_id UUID DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_day INT;
  v_time TIME;
  v_tz TEXT;
  v_sched RECORD;
  v_has_schedule BOOLEAN := false;
BEGIN
  -- Get the schedule entries for today
  v_day := EXTRACT(DOW FROM v_now);

  FOR v_sched IN
    SELECT start_time, end_time, timezone
    FROM account_schedules
    WHERE account_id = p_account_id
      AND department_id IS NOT DISTINCT FROM p_department_id
      AND day_of_week = v_day
      AND is_active = true
  LOOP
    v_has_schedule := true;
    v_tz := v_sched.timezone;
    v_time := (v_now AT TIME ZONE v_tz)::TIME;

    IF v_time >= v_sched.start_time AND v_time < v_sched.end_time THEN
      RETURN true;
    END IF;
  END LOOP;

  -- No schedule found = always open (no working hours configured)
  IF NOT v_has_schedule THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

ALTER FUNCTION is_within_working_hours(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_within_working_hours(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- 9. HELPER: GET DEPARTMENT AGENTS (eligible for assignment)
-- ============================================================
CREATE OR REPLACE FUNCTION get_department_agents(
  p_account_id UUID,
  p_department_id UUID
) RETURNS TABLE (
  user_id UUID,
  skill_level INT,
  is_primary BOOLEAN,
  full_name TEXT,
  email TEXT,
  is_online BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ad.user_id,
    ad.skill_level,
    ad.is_primary,
    p.full_name,
    p.email,
    CASE
      WHEN mp.status = 'online'
        AND mp.last_seen_at > NOW() - INTERVAL '75 seconds'
      THEN true
      ELSE false
    END AS is_online
  FROM agent_departments ad
  JOIN profiles p ON p.user_id = ad.user_id
  LEFT JOIN member_presence mp ON mp.user_id = ad.user_id AND mp.account_id = ad.account_id
  WHERE ad.account_id = p_account_id
    AND ad.department_id = p_department_id
    AND EXISTS (
      SELECT 1 FROM account_memberships am
      WHERE am.user_id = ad.user_id
        AND am.account_id = p_account_id
        AND am.role IN ('owner', 'admin', 'agent')
    );
$$;

ALTER FUNCTION get_department_agents(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_department_agents(UUID, UUID) TO authenticated, service_role;

-- ============================================================
-- 10. HELPER: GET ALL ELIGIBLE AGENTS FOR AN ACCOUNT
-- ============================================================
CREATE OR REPLACE FUNCTION get_eligible_agents(
  p_account_id UUID
) RETURNS TABLE (
  user_id UUID,
  full_name TEXT,
  email TEXT,
  is_online BOOLEAN,
  active_conversation_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    am.user_id,
    p.full_name,
    p.email,
    CASE
      WHEN mp.status = 'online'
        AND mp.last_seen_at > NOW() - INTERVAL '75 seconds'
      THEN true
      ELSE false
    END AS is_online,
    COALESCE(
      (SELECT COUNT(*) FROM conversations c
       WHERE c.assigned_agent_id = am.user_id
         AND c.account_id = p_account_id
         AND c.status IN ('open', 'pending')),
      0
    ) AS active_conversation_count
  FROM account_memberships am
  JOIN profiles p ON p.user_id = am.user_id
  LEFT JOIN member_presence mp ON mp.user_id = am.user_id AND mp.account_id = p_account_id
  WHERE am.account_id = p_account_id
    AND am.role IN ('owner', 'admin', 'agent');
$$;

ALTER FUNCTION get_eligible_agents(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION get_eligible_agents(UUID) TO authenticated, service_role;

-- ============================================================
-- 11. TRIGGER: auto-update updated_at on departments
-- ============================================================
CREATE OR REPLACE FUNCTION update_departments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS departments_updated_at ON departments;
CREATE TRIGGER departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_departments_updated_at();

DROP TRIGGER IF EXISTS account_schedules_updated_at ON account_schedules;
CREATE TRIGGER account_schedules_updated_at
  BEFORE UPDATE ON account_schedules
  FOR EACH ROW EXECUTE FUNCTION update_departments_updated_at();
