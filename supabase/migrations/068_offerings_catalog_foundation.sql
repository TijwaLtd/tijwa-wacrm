-- ============================================================
-- 068_offerings_catalog_foundation.sql — Catalog & Universal Offerings Foundation
--
-- What this migration adds:
--
--   1. `offering_types` — controlled enum of offering types
--   2. `offering_statuses` — controlled enum of offering statuses
--   3. `price_types` — controlled enum of price types
--   4. `offering_categories` — shared + org-specific categories
--   5. `offerings` — universal offering table (products, services, rooms, etc.)
--   6. `offering_media` — images and media for offerings
--   7. `offering_embeddings` — vector embeddings for AI image search
--   8. `capability_offering_types` — maps capabilities to allowed offering types
--   9. RPCs for search and AI matching
--  10. Storage bucket for offering images
--
-- Design principles:
--   - Universal offering table (not separate tables per type)
--   - Capability-driven: which offering types are available depends on enabled capabilities
--   - AI-searchable: vector embeddings for image matching
--   - Mobile-first: simple status model, flexible identification
--   - Future-proof: supports external system references
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. Types/Enums
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offering_type') THEN
    CREATE TYPE offering_type AS ENUM (
      'product', 'service', 'room', 'menu_item', 'course', 'program',
      'property', 'package', 'membership', 'event', 'resource', 'other'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offering_status') THEN
    CREATE TYPE offering_status AS ENUM ('draft', 'active', 'inactive', 'archived');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'price_type') THEN
    CREATE TYPE price_type AS ENUM ('fixed', 'starting_from', 'contact_for_price', 'free');
  END IF;
END $$;

-- ============================================================
-- 2. Offering categories (shared + org-specific)
-- ============================================================
CREATE TABLE IF NOT EXISTS offering_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,  -- NULL = system/global category
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  parent_id   UUID REFERENCES offering_categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_offering_categories_account ON offering_categories(account_id);
CREATE INDEX IF NOT EXISTS idx_offering_categories_parent ON offering_categories(parent_id);

ALTER TABLE offering_categories ENABLE ROW LEVEL SECURITY;

-- Global categories (account_id IS NULL) are readable by all authenticated users
-- Org-specific categories are readable by org members
DROP POLICY IF EXISTS "offering_categories_select" ON offering_categories;
CREATE POLICY offering_categories_select ON offering_categories
  FOR SELECT USING (
    account_id IS NULL OR has_role_in_account(auth.uid(), account_id, 'viewer')
  );

-- Admin+ can manage their org's categories
DROP POLICY IF EXISTS "offering_categories_insert" ON offering_categories;
CREATE POLICY offering_categories_insert ON offering_categories
  FOR INSERT WITH CHECK (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP POLICY IF EXISTS "offering_categories_update" ON offering_categories;
CREATE POLICY offering_categories_update ON offering_categories
  FOR UPDATE USING (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP POLICY IF EXISTS "offering_categories_delete" ON offering_categories;
CREATE POLICY offering_categories_delete ON offering_categories
  FOR DELETE USING (has_role_in_account(auth.uid(), account_id, 'admin'));

-- ============================================================
-- 3. Offerings (universal catalog table)
-- ============================================================
CREATE TABLE IF NOT EXISTS offerings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type              offering_type NOT NULL,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL,
  short_description TEXT,
  description       TEXT,
  status            offering_status NOT NULL DEFAULT 'draft',
  category_id       UUID REFERENCES offering_categories(id),
  price             DECIMAL(12,2),
  currency          TEXT,
  price_type        price_type NOT NULL DEFAULT 'fixed',
  reference_code    TEXT,  -- SKU, code, external ID (flexible)
  external_provider TEXT,
  external_id       TEXT,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_text       TSVECTOR,  -- Generated column for full-text search
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_offerings_account ON offerings(account_id);
CREATE INDEX IF NOT EXISTS idx_offerings_type ON offerings(type);
CREATE INDEX IF NOT EXISTS idx_offerings_status ON offerings(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_offerings_category ON offerings(category_id);
CREATE INDEX IF NOT EXISTS idx_offerings_search ON offerings USING GIN(search_text);
CREATE INDEX IF NOT EXISTS idx_offerings_metadata ON offerings USING GIN(metadata);

-- Trigger to update search_text on insert/update
CREATE OR REPLACE FUNCTION update_offerings_search_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_text := to_tsvector('simple',
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.short_description, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.reference_code, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_offerings_search_text ON offerings;
CREATE TRIGGER trg_offerings_search_text
  BEFORE INSERT OR UPDATE ON offerings
  FOR EACH ROW EXECUTE FUNCTION update_offerings_search_text();

ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offerings_select" ON offerings;
CREATE POLICY offerings_select ON offerings
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS "offerings_insert" ON offerings;
CREATE POLICY offerings_insert ON offerings
  FOR INSERT WITH CHECK (has_role_in_account(auth.uid(), account_id, 'agent'));

DROP POLICY IF EXISTS "offerings_update" ON offerings;
CREATE POLICY offerings_update ON offerings
  FOR UPDATE USING (has_role_in_account(auth.uid(), account_id, 'agent'));

DROP POLICY IF EXISTS "offerings_delete" ON offerings;
CREATE POLICY offerings_delete ON offerings
  FOR DELETE USING (has_role_in_account(auth.uid(), account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON offerings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON offerings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 4. Offering media (images)
-- ============================================================
CREATE TABLE IF NOT EXISTS offering_media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  alt_text    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_primary  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offering_media_offering ON offering_media(offering_id);
CREATE INDEX IF NOT EXISTS idx_offering_media_account ON offering_media(account_id);

ALTER TABLE offering_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "offering_media_select" ON offering_media;
CREATE POLICY offering_media_select ON offering_media
  FOR SELECT USING (has_role_in_account(auth.uid(), account_id, 'viewer'));

DROP POLICY IF EXISTS "offering_media_insert" ON offering_media;
CREATE POLICY offering_media_insert ON offering_media
  FOR INSERT WITH CHECK (has_role_in_account(auth.uid(), account_id, 'agent'));

DROP POLICY IF EXISTS "offering_media_delete" ON offering_media;
CREATE POLICY offering_media_delete ON offering_media
  FOR DELETE USING (has_role_in_account(auth.uid(), account_id, 'agent'));

-- ============================================================
-- 5. Offering embeddings (AI image search)
-- ============================================================
CREATE TABLE IF NOT EXISTS offering_embeddings (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offering_id            UUID NOT NULL REFERENCES offerings(id) ON DELETE CASCADE,
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  image_url              TEXT NOT NULL,
  embedding              vector(1536),  -- CLIP image embedding
  description_embedding  vector(1536),  -- Vision model description embedding
  vision_description     TEXT,          -- AI-generated description of the image
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offering_embeddings_offering ON offering_embeddings(offering_id);
CREATE INDEX IF NOT EXISTS idx_offering_embeddings_account ON offering_embeddings(account_id);
CREATE INDEX IF NOT EXISTS idx_offering_embeddings_image ON offering_embeddings USING HNSW(embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_offering_embeddings_desc ON offering_embeddings USING HNSW(description_embedding vector_cosine_ops);

ALTER TABLE offering_embeddings ENABLE ROW LEVEL SECURITY;

-- Service-role only for embeddings (generated server-side)
DROP POLICY IF EXISTS "offering_embeddings_insert" ON offering_embeddings;
CREATE POLICY offering_embeddings_insert ON offering_embeddings
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "offering_embeddings_select" ON offering_embeddings;
CREATE POLICY offering_embeddings_select ON offering_embeddings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "offering_embeddings_delete" ON offering_embeddings;
CREATE POLICY offering_embeddings_delete ON offering_embeddings
  FOR DELETE TO service_role USING (true);

-- ============================================================
-- 6. Capability → Offering Type mapping
-- ============================================================
CREATE TABLE IF NOT EXISTS capability_offering_types (
  capability_key TEXT NOT NULL REFERENCES business_capabilities(key) ON DELETE CASCADE,
  offering_type  offering_type NOT NULL,
  PRIMARY KEY (capability_key, offering_type)
);

CREATE INDEX IF NOT EXISTS idx_capability_offering_types_type ON capability_offering_types(offering_type);

ALTER TABLE capability_offering_types ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read the mapping
DROP POLICY IF EXISTS "capability_offering_types_select" ON capability_offering_types;
CREATE POLICY capability_offering_types_select ON capability_offering_types
  FOR SELECT TO authenticated USING (true);

-- Only service role can modify
DROP POLICY IF EXISTS "capability_offering_types_insert" ON capability_offering_types;
CREATE POLICY capability_offering_types_insert ON capability_offering_types
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS "capability_offering_types_delete" ON capability_offering_types;
CREATE POLICY capability_offering_types_delete ON capability_offering_types
  FOR DELETE TO service_role USING (true);

-- ============================================================
-- 7. RPCs for search and AI matching
-- ============================================================

-- Search offerings by text
CREATE OR REPLACE FUNCTION search_offerings(
  p_account_id UUID,
  p_query TEXT,
  p_type offering_type DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_status offering_status DEFAULT 'active',
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type offering_type,
  short_description TEXT,
  price DECIMAL,
  price_type price_type,
  category_id UUID,
  status offering_status,
  rank REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.type,
    o.short_description,
    o.price,
    o.price_type,
    o.category_id,
    o.status,
    ts_rank(o.search_text, plainto_tsquery('simple', p_query))::REAL AS rank
  FROM offerings o
  WHERE o.account_id = p_account_id
    AND (p_type IS NULL OR o.type = p_type)
    AND (p_category_id IS NULL OR o.category_id = p_category_id)
    AND (p_status IS NULL OR o.status = p_status)
    AND o.search_text @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

ALTER FUNCTION search_offerings(UUID, TEXT, offering_type, UUID, offering_status, INT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION search_offerings(UUID, TEXT, offering_type, UUID, offering_status, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_offerings(UUID, TEXT, offering_type, UUID, offering_status, INT, INT) TO authenticated;

-- Match offerings by image embedding (for AI image search)
CREATE OR REPLACE FUNCTION match_offering_by_image(
  p_account_id UUID,
  p_query_embedding TEXT,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  offering_id UUID,
  name TEXT,
  type offering_type,
  short_description TEXT,
  description TEXT,
  price DECIMAL,
  price_type price_type,
  image_url TEXT,
  similarity REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.type,
    o.short_description,
    o.description,
    o.price,
    o.price_type,
    oe.image_url,
    (1 - (oe.embedding <=> p_query_embedding::vector(1536)))::REAL AS similarity
  FROM offering_embeddings oe
  JOIN offerings o ON o.id = oe.offering_id
  WHERE oe.account_id = p_account_id
    AND o.status = 'active'
  ORDER BY oe.embedding <=> p_query_embedding::vector(1536)
  LIMIT p_match_count;
END;
$$;

ALTER FUNCTION match_offering_by_image(UUID, TEXT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION match_offering_by_image(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_offering_by_image(UUID, TEXT, INT) TO authenticated;

-- Match offerings by description embedding (for text queries)
CREATE OR REPLACE FUNCTION match_offering_by_description(
  p_account_id UUID,
  p_query_embedding TEXT,
  p_match_count INT DEFAULT 5
)
RETURNS TABLE (
  offering_id UUID,
  name TEXT,
  type offering_type,
  short_description TEXT,
  description TEXT,
  price DECIMAL,
  price_type price_type,
  similarity REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.name,
    o.type,
    o.short_description,
    o.description,
    o.price,
    o.price_type,
    (1 - (oe.description_embedding <=> p_query_embedding::vector(1536)))::REAL AS similarity
  FROM offering_embeddings oe
  JOIN offerings o ON o.id = oe.offering_id
  WHERE oe.account_id = p_account_id
    AND o.status = 'active'
  ORDER BY oe.description_embedding <=> p_query_embedding::vector(1536)
  LIMIT p_match_count;
END;
$$;

ALTER FUNCTION match_offering_by_description(UUID, TEXT, INT) OWNER TO postgres;
REVOKE ALL ON FUNCTION match_offering_by_description(UUID, TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_offering_by_description(UUID, TEXT, INT) TO authenticated;

-- Get offering types allowed by account's enabled capabilities
CREATE OR REPLACE FUNCTION get_allowed_offering_types(p_account_id UUID)
RETURNS TABLE (
  offering_type offering_type,
  capability_key TEXT,
  capability_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    cot.offering_type,
    bc.key AS capability_key,
    bc.name AS capability_name
  FROM capability_offering_types cot
  JOIN business_capabilities bc ON bc.key = cot.capability_key
  JOIN account_capabilities ac ON ac.capability_key = bc.key
  WHERE ac.account_id = p_account_id
    AND ac.is_enabled = TRUE
  ORDER BY cot.offering_type;
END;
$$;

ALTER FUNCTION get_allowed_offering_types(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION get_allowed_offering_types(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_allowed_offering_types(UUID) TO authenticated;

-- ============================================================
-- 8. Storage bucket for offering images
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'offerings',
  'offerings',
  true,
  5242880,  -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for offerings bucket
DROP POLICY IF EXISTS "Offerings images public read" ON storage.objects;
CREATE POLICY "Offerings images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'offerings');

DROP POLICY IF EXISTS "Offerings images insert" ON storage.objects;
CREATE POLICY "Offerings images insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'offerings' AND
    has_role_in_account(auth.uid(), (storage.foldername(name))[1]::uuid, 'agent')
  );

DROP POLICY IF EXISTS "Offerings images delete" ON storage.objects;
CREATE POLICY "Offerings images delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'offerings' AND
    has_role_in_account(auth.uid(), (storage.foldername(name))[1]::uuid, 'agent')
  );

-- ============================================================
-- 9. Seed capability → offering type mappings
-- ============================================================
INSERT INTO capability_offering_types (capability_key, offering_type) VALUES
  -- Commerce
  ('products', 'product'),
  ('product_catalog', 'product'),
  ('inventory', 'product'),

  -- Food & Hospitality
  ('menu', 'menu_item'),
  ('food_orders', 'menu_item'),
  ('accommodation', 'room'),
  ('bookings', 'room'),
  ('hospitality_services', 'service'),

  -- Services
  ('services', 'service'),
  ('appointments', 'service'),
  ('service_requests', 'service'),

  -- Education
  ('courses', 'course'),
  ('education_programs', 'program'),
  ('applications', 'course'),

  -- NGO
  ('programs', 'program'),
  ('ngo_services', 'service'),
  ('resources', 'resource'),
  ('donations', 'resource'),

  -- Property
  ('property_listings', 'property'),
  ('property_inquiries', 'property'),
  ('viewings', 'property'),

  -- Events
  ('events', 'event'),
  ('registrations', 'event')
ON CONFLICT (capability_key, offering_type) DO NOTHING;

-- ============================================================
-- 10. Seed default categories
-- ============================================================
INSERT INTO offering_categories (account_id, name, slug, description, sort_order) VALUES
  -- Commerce
  (NULL, 'Electronics', 'electronics', 'Electronic devices and accessories', 1),
  (NULL, 'Clothing', 'clothing', 'Apparel and fashion items', 2),
  (NULL, 'Food & Beverages', 'food-beverages', 'Food and drink items', 3),
  (NULL, 'Home & Garden', 'home-garden', 'Home and garden products', 4),

  -- Food & Hospitality
  (NULL, 'Breakfast', 'breakfast', 'Morning meals', 10),
  (NULL, 'Main Course', 'main-course', 'Primary dishes', 11),
  (NULL, 'Drinks', 'drinks', 'Beverages', 12),
  (NULL, 'Desserts', 'desserts', 'Sweet dishes', 13),
  (NULL, 'Room Types', 'room-types', 'Different room categories', 14),

  -- Services
  (NULL, 'Consultation', 'consultation', 'Advisory services', 20),
  (NULL, 'Maintenance', 'maintenance', 'Repair and upkeep services', 21),
  (NULL, 'Installation', 'installation', 'Setup services', 22),

  -- Education
  (NULL, 'Short Courses', 'short-courses', 'Brief training programs', 30),
  (NULL, 'Diplomas', 'diplomas', 'Extended certification programs', 31),
  (NULL, 'Professional Training', 'professional-training', 'Career development courses', 32),

  -- NGO
  (NULL, 'Youth Programs', 'youth-programs', 'Programs for young people', 40),
  (NULL, 'Community Development', 'community-development', 'Community improvement initiatives', 41),
  (NULL, 'Health Programs', 'health-programs', 'Health-related services', 42),

  -- Property
  (NULL, 'Residential', 'residential', 'Residential properties', 50),
  (NULL, 'Commercial', 'commercial', 'Commercial properties', 51),

  -- Events
  (NULL, 'Workshops', 'workshops', 'Hands-on learning sessions', 60),
  (NULL, 'Conferences', 'conferences', 'Large-scale meetings', 61),
  (NULL, 'Social Events', 'social-events', 'Community gatherings', 62)
ON CONFLICT DO NOTHING;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- SELECT count(*) FROM offering_types;           -- Should show offering types
-- SELECT count(*) FROM offering_categories;      -- Should show ~20+ categories
-- SELECT count(*) FROM capability_offering_types; -- Should show ~20+ mappings
-- SELECT * FROM get_allowed_offering_types('(SELECT id FROM accounts LIMIT 1)');
-- SELECT * FROM search_offerings('(SELECT id FROM accounts LIMIT 1)', 'test');
