-- ============================================================
-- 098: tenant_settings.accent_color
-- ============================================================
-- The workspace settings UI (color picker) and both workspace APIs
-- (GET/PATCH /api/workspaces, /api/workspaces/[id]) have always read and
-- written tenant_settings.accent_color, but no migration ever created the
-- column — GET /api/workspaces/[id] failed with 42703 and the settings
-- page could not load (or save). Add the missing column.
-- ============================================================

ALTER TABLE tenant_settings
  ADD COLUMN IF NOT EXISTS accent_color TEXT;
