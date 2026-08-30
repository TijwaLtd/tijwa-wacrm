# Supabase Migration Patterns Guide

This document captures the established patterns used in tijwa-crm's database migrations. All new migrations MUST follow these conventions.

---

## 1. File Naming & Header

```sql
-- ============================================================
-- 00X_name.sql — Short description
--
-- What this migration does (1-2 sentences).
--
-- Design notes (if any):
--   - Why a JSONB column instead of a separate table
--   - Why this index is partial
--   - Why we use FOR UPDATE here
--   - etc.
--
-- Idempotent — safe to run multiple times.
-- ============================================================
```

---

## 2. Core Conventions

### 2.1 Tables — IF NOT EXISTS

```sql
CREATE TABLE IF NOT EXISTS my_table (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  config     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 2.2 Indexes — IF NOT EXISTS

```sql
-- Regular index
CREATE INDEX IF NOT EXISTS idx_my_table_account_id ON my_table(account_id);

-- Partial index (for hot query paths)
CREATE INDEX IF NOT EXISTS idx_my_table_active_trigger
  ON my_table(trigger_type) WHERE is_active = TRUE;

-- Unique partial index (for idempotency constraints)
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_run_per_contact
  ON flow_runs(user_id, contact_id) WHERE status = 'active';
```

### 2.3 RLS — DROP before CREATE

Postgres has no `CREATE POLICY IF NOT EXISTS`. Always DROP first:

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own my_table" ON my_table;
CREATE POLICY "Users can manage own my_table" ON my_table FOR ALL
  USING (auth.uid() = user_id);
```

---

## 3. The account_id Pattern (Tenancy)

Migration 017 introduced multi-tenant accounts. All domain tables now use `account_id` as the tenancy key.

### 3.1 Adding account_id to a new table

```sql
CREATE TABLE IF NOT EXISTS my_table (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_table_account ON my_table(account_id);
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
```

### 3.2 The is_account_member() Helper

This is the core tenancy check function (defined in migration 017):

```sql
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >= CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;
```

### 3.3 RLS Policy Tiers

| Tier | Role | SELECT | INSERT/UPDATE/DELETE |
|------|------|--------|----------------------|
| **viewer** | viewer | Yes | No |
| **agent** | agent, admin, owner | Yes | Yes (operational data) |
| **admin** | admin, owner | Yes | Yes (settings + operational) |

#### Parent table policies (direct account_id):
```sql
-- Operational data (contacts, deals, messages)
CREATE POLICY my_table_select ON my_table FOR SELECT USING (is_account_member(account_id));
CREATE POLICY my_table_insert ON my_table FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY my_table_update ON my_table FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY my_table_delete ON my_table FOR DELETE USING (is_account_member(account_id, 'agent'));

-- Settings-class (tags, custom_fields, api_keys)
CREATE POLICY my_settings_select ON my_settings FOR SELECT USING (is_account_member(account_id));
CREATE POLICY my_settings_insert ON my_settings FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY my_settings_update ON my_settings FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY my_settings_delete ON my_settings FOR DELETE USING (is_account_member(account_id, 'admin'));
```

#### Child table policies (parent-join via EXISTS):
```sql
-- Child table (e.g., messages belongs to conversations)
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id))
);
CREATE POLICY messages_modify ON messages FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND is_account_member(c.account_id, 'agent'))
);
```

---

## 4. Enums and Types

Always use the DO block pattern to avoid duplicates:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'my_enum') THEN
    CREATE TYPE my_enum AS ENUM ('value_one', 'value_two');
  END IF;
END $$;
```

---

## 5. Functions (RPCs)

### 5.1 SECURITY DEFINER Pattern

Functions that need to bypass RLS use `SECURITY DEFINER`:

```sql
CREATE OR REPLACE FUNCTION public.my_function(
  p_param UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;
  -- ... function body
END;
$$;

ALTER FUNCTION public.my_function(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.my_function(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_function(UUID) TO authenticated;
```

### 5.2 Error Codes

| SQLSTATE | Meaning | HTTP Mapping |
|----------|---------|--------------|
| 42501 | insufficient_privilege | 403 Forbidden |
| 22023 | invalid_parameter_value | 400 Bad Request |
| 23505 | unique_violation | 409 Conflict |
| 42883 | undefined_function | 500 (bug) |

### 5.3 Atomic Operations — FOR UPDATE

When concurrent calls could cause race conditions:

```sql
-- Lock the row to prevent concurrent modification
SELECT * INTO v_inv FROM account_invitations WHERE token_hash = p_token_hash FOR UPDATE;

IF NOT FOUND THEN
  RAISE EXCEPTION 'Invitation not found' USING ERRCODE = '22023';
END IF;
```

---

## 6. updated_at Triggers

Reuse the helper from migration 001:

```sql
DROP TRIGGER IF EXISTS set_updated_at ON my_table;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON my_table
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

## 7. Service-Role-Only Tables

Tables that are only written by server-side code (not the browser):

```sql
CREATE TABLE IF NOT EXISTS automation_pending_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- ... columns
);

ALTER TABLE automation_pending_executions ENABLE ROW LEVEL SECURITY;
-- No SELECT/INSERT/UPDATE/DELETE policy for authenticated users — all
-- access is server-side via the service-role key.
```

---

## 8. Hashing Secrets (Never Store Plaintext)

For tokens and API keys, store only the hash:

```sql
-- Store SHA-256 hash, never the plaintext
key_hash TEXT NOT NULL UNIQUE,

-- The plaintext is returned exactly once at creation and never persisted
```

Pattern for invitations (migration 017/019):
- Store `token_hash` (SHA-256 of plaintext)
- Plaintext returned once at creation, then discarded
- Lookup happens by hash comparison

---

## 9. Backfilling account_id (Migration 017 Pattern)

```sql
DO $$
DECLARE
  v_table TEXT;
  v_tables TEXT[] := ARRAY['contacts', 'deals', 'broadcasts'];
BEGIN
  -- Step 1: Create accounts for existing users
  INSERT INTO accounts (name, owner_user_id)
  SELECT COALESCE(NULLIF(p.full_name, ''), p.email, 'My account'), p.user_id
  FROM profiles p
  WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.owner_user_id = p.user_id);

  -- Step 2: Stamp profile.account_id
  UPDATE profiles p
  SET account_id = a.id, account_role = 'owner'
  FROM accounts a
  WHERE a.owner_user_id = p.user_id AND p.account_id IS NULL;

  -- Step 3: Propagate to domain tables
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format($f$
      UPDATE %I t SET account_id = p.account_id
      FROM profiles p WHERE t.user_id = p.user_id AND t.account_id IS NULL
    $f$, v_table);
  END LOOP;
END $$;

-- Step 4: Apply NOT NULL
ALTER TABLE contacts ALTER COLUMN account_id SET NOT NULL;
```

---

## 10. Realtime Publication

Add tables to realtime when the UI needs live updates:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'my_table'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE my_table;
  END IF;
END $$;
```

---

## 11. UUID Generation Fallback

For Supabase instances where `uuid_generate_v4()` isn't available:

```sql
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS UUID
LANGUAGE SQL IMMUTABLE AS $$ SELECT gen_random_uuid() $$;
```

---

## 12. Migration Order Rules

1. **Types/Enums first** — before tables that use them
2. **Tables second** — before policies/triggers/indexes
3. **Indexes third** — after tables
4. **Policies fourth** — after tables and helper functions
5. **Triggers last** — after tables exist
6. **Backfills in DO blocks** — after all tables exist
7. **NOT NULL after backfill** — separate from DO block for DDL

---

## 13. Checklist for New Migrations

- [ ] Header with description and design notes
- [ ] `CREATE TABLE IF NOT EXISTS` (or `ALTER TABLE ADD COLUMN IF NOT EXISTS`)
- [ ] `CREATE INDEX IF NOT EXISTS` (including partial indexes for hot paths)
- [ ] `ALTER TABLE ENABLE ROW LEVEL SECURITY`
- [ ] `DROP POLICY IF EXISTS` + `CREATE POLICY` for each operation
- [ ] `updated_at` trigger if table has `updated_at` column
- [ ] `GRANT` statements for functions
- [ ] `REVOKE FROM PUBLIC` before custom grants on functions
- [ ] Realtime publication if needed (in DO block)
- [ ] Comments explaining *why*, not just *what*

---

## 14. Anti-Patterns to Avoid

❌ **Don't** use `user_id` as the tenancy key for new tables — use `account_id`

❌ **Don't** create policies without dropping first (use `DROP POLICY IF EXISTS`)

❌ **Don't** store plaintext secrets — always hash

❌ **Don't** use `SELECT *` in production code — list specific columns

❌ **Don't** skip the `SET search_path = public` on SECURITY DEFINER functions

❌ **Don't** use CHECK constraints for state machines when an Enum type is cleaner

❌ **Don't** forget to `GRANT EXECUTE` on new functions to `authenticated`

---

## 15. Example: Complete New Table Migration

```sql
-- ============================================================
-- 038_my_feature.sql — Short description
--
-- What this migration adds:
--   1. `my_feature` — does X
--   2. `my_feature_items` — does Y (child table)
--
-- Design notes:
--   - Why JSONB for config (flexible, no schema changes needed)
--   - Why partial index (only active rows queried frequently)
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- Types (if any)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_enum') THEN
    CREATE TYPE status_enum AS ENUM ('pending', 'active', 'archived');
  END IF;
END $$;

-- ============================================================
-- 1. my_feature
-- ============================================================
CREATE TABLE IF NOT EXISTS my_feature (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  status      status_enum NOT NULL DEFAULT 'pending',
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_feature_account    ON my_feature(account_id);
CREATE INDEX IF NOT EXISTS idx_my_feature_active    ON my_feature(status) WHERE status = 'active';

ALTER TABLE my_feature ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own my_feature" ON my_feature;
CREATE POLICY my_feature_select ON my_feature FOR SELECT USING (is_account_member(account_id));
CREATE POLICY my_feature_insert ON my_feature FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY my_feature_update ON my_feature FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY my_feature_delete ON my_feature FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON my_feature;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON my_feature
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 2. my_feature_items (child table)
-- ============================================================
CREATE TABLE IF NOT EXISTS my_feature_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  my_feature_id UUID NOT NULL REFERENCES my_feature(id) ON DELETE CASCADE,
  account_id    UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  item_name     TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_feature_items_feature ON my_feature_items(my_feature_id);

ALTER TABLE my_feature_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage items on their my_feature" ON my_feature_items;
CREATE POLICY my_feature_items_select ON my_feature_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM my_feature f WHERE f.id = my_feature_items.my_feature_id AND is_account_member(f.account_id))
);
CREATE POLICY my_feature_items_modify ON my_feature_items FOR ALL USING (
  EXISTS (SELECT 1 FROM my_feature f WHERE f.id = my_feature_items.my_feature_id AND is_account_member(f.account_id, 'agent'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM my_feature f WHERE f.id = my_feature_items.my_feature_id AND is_account_member(f.account_id, 'agent'))
);

-- ============================================================
-- 3. Realtime (if needed by UI)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'my_feature'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE my_feature;
  END IF;
END $$;
```
