import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadEmbeddingsKey } from '@/lib/ai/config'
import { ingestDocument } from '@/lib/ai/knowledge'
import {
  extractText,
  mimeFromFilename,
  isAcceptedFileType,
  DocumentExtractionError,
} from '@/lib/ai/extract-text'
import { AiError } from '@/lib/ai/types'

/**
 * POST /api/ai/knowledge/upload  (admin+)
 *
 * Multipart form upload. Fields:
 *   - file: the document (PDF, DOCX, TXT, CSV, MD, TSV)
 *   - title: optional override; defaults to the filename
 *
 * Stores the original file in Supabase Storage under the account's
 * folder, extracts text, creates a knowledge document, and ingests
 * chunks for retrieval.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Expected multipart/form-data' },
        { status: 400 },
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Determine MIME type — trust the upload header first, fall back to extension
    const uploadMime = file.type || mimeFromFilename(file.name)
    if (!uploadMime || !isAcceptedFileType(uploadMime)) {
      return NextResponse.json(
        {
          error:
            'Unsupported file type. Accepted: PDF, DOCX, TXT, CSV, MD, TSV',
        },
        { status: 400 },
      )
    }

    const title =
      typeof formData.get('title') === 'string' &&
      (formData.get('title') as string).trim()
        ? (formData.get('title') as string).trim()
        : file.name.replace(/\.[^.]+$/, '')

    // Read file into buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Extract text
    let content: string
    try {
      content = await extractText(buffer, uploadMime, file.name)
    } catch (err) {
      const message =
        err instanceof DocumentExtractionError
          ? err.message
          : 'Failed to extract text from file'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Upload original file to storage (best-effort — don't block on failure)
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    const storagePath = `${accountId}/${crypto.randomUUID()}${ext}`
    let filePath: string | null = null
    try {
      const { error: uploadErr } = await supabase.storage
        .from('knowledge-docs')
        .upload(storagePath, buffer, {
          contentType: uploadMime,
          upsert: false,
        })
      if (!uploadErr) filePath = storagePath
    } catch (err) {
      console.error('[ai/knowledge/upload] storage upload failed:', err)
      // Continue — the document is still saved and indexed
    }

    // Insert document record
    const { data: doc, error } = await supabase
      .from('ai_knowledge_documents')
      .insert({
        account_id: accountId,
        created_by: userId,
        title,
        content,
        source_type: 'file',
        file_path: filePath,
      })
      .select('id')
      .single()
    if (error || !doc) {
      console.error('[ai/knowledge/upload] insert error:', error)
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 },
      )
    }

    // Ingest chunks
    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      supabase,
      accountId,
    )
    try {
      await ingestDocument(
        supabase,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content,
      )
    } catch (err) {
      const message = err instanceof AiError ? err.message : 'indexing failed'
      console.error('[ai/knowledge/upload] ingest error:', err)
      return NextResponse.json(
        {
          success: true,
          id: doc.id,
          warning: `Saved, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
        },
        { status: 200 },
      )
    }

    if (corrupt) {
      return NextResponse.json({
        success: true,
        id: doc.id,
        warning:
          'Saved with keyword search only — your embeddings key could not be decrypted.',
      })
    }
    return NextResponse.json({ success: true, id: doc.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
