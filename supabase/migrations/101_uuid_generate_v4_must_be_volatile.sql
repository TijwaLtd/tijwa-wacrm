-- Migration 101: fix duplicate primary keys on multi-row inserts.
--
-- 001_initial_schema.sql created:
--   CREATE OR REPLACE FUNCTION public.uuid_generate_v4() ... IMMUTABLE
-- This shadows uuid-ossp's real uuid_generate_v4(). Because the wrapper is
-- marked IMMUTABLE (but is non-deterministic), PostgreSQL evaluates
-- `DEFAULT uuid_generate_v4()` ONCE PER INSERT STATEMENT instead of once
-- per row. Any multi-row insert into a table using that default therefore
-- gives every row the same id:
--
--   duplicate key value violates unique constraint "..._pkey"
--
-- Symptom seen on POST /api/team/conversations: inserting 2 rows into
-- team_conversation_participants failed with
--   Key (id)=(<fresh-uuid>) already exists
-- (every other insert in the app is single-row, so the bug stayed hidden;
-- broadcast batch inserts are exposed to it as well).
--
-- Marking the function VOLATILE restores per-row evaluation of the DEFAULT.
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
RETURNS UUID
LANGUAGE SQL
VOLATILE AS $$
  SELECT gen_random_uuid()
$$;
