-- ============================================================
-- Create workspaces storage bucket for workspace logos
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspaces',
  'workspaces',
  TRUE,
  2097152, -- 2 MB
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Workspaces bucket is publicly readable" ON storage.objects;
CREATE POLICY "Workspaces bucket is publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'workspaces');

DROP POLICY IF EXISTS "Authenticated users can upload workspace logos" ON storage.objects;
CREATE POLICY "Authenticated users can upload workspace logos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'workspaces'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Users can update their workspace logos" ON storage.objects;
CREATE POLICY "Users can update their workspace logos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'workspaces'
    AND auth.role() = 'authenticated'
  );
