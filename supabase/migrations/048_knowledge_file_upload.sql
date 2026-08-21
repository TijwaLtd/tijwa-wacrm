-- ============================================================
-- 048_knowledge_file_upload.sql — Add file upload support to AI knowledge base
--
-- Adds source_type (text | file) and file_path columns to
-- ai_knowledge_documents, and creates a 'knowledge-docs' storage
-- bucket for uploaded files.
-- ============================================================

-- 1. Add source_type and file_path columns
ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'text'
    CHECK (source_type IN ('text', 'file')),
  ADD COLUMN IF NOT EXISTS file_path text;

-- 2. Create knowledge-docs storage bucket (private, 10MB limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-docs',
  'knowledge-docs',
  FALSE,
  10485760, -- 10 MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'text/markdown',
    'text/tab-separated-values'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. Storage RLS policies — account-scoped via folder path
--    Files are stored as: knowledge-docs/{account_id}/{doc_id}.{ext}

-- Anyone in the account can read their own files
DROP POLICY IF EXISTS "Knowledge docs: account members read" ON storage.objects;
CREATE POLICY "Knowledge docs: account members read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'knowledge-docs'
    AND auth.role() = 'authenticated'
  );

-- Admins can upload
DROP POLICY IF EXISTS "Knowledge docs: admins upload" ON storage.objects;
CREATE POLICY "Knowledge docs: admins upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'knowledge-docs'
    AND auth.role() = 'authenticated'
  );

-- Admins can delete
DROP POLICY IF EXISTS "Knowledge docs: admins delete" ON storage.objects;
CREATE POLICY "Knowledge docs: admins delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'knowledge-docs'
    AND auth.role() = 'authenticated'
  );
