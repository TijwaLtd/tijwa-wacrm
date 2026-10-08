import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { mimeFromFilename } from '@/lib/ai/extract-text'

type Params = { params: Promise<{ id: string }> }

const SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * GET /api/ai/knowledge/[id]/file (any member)
 *
 * Short-lived signed URL for the original uploaded file, so the client
 * can embed PDFs / offer downloads. The bucket is private — nothing
 * long-lived ever leaves the server.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { id } = await params
    const { data: doc, error } = await supabase
      .from('ai_knowledge_documents')
      .select('source_type, file_path')
      .eq('account_id', accountId)
      .eq('id', id)
      .maybeSingle()
    if (error) {
      console.error('[ai/knowledge/file GET] error:', error)
      return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
    }
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.source_type !== 'file' || !doc.file_path) {
      return NextResponse.json(
        { error: 'No stored file for this document' },
        { status: 404 },
      )
    }

    const { data, error: signError } = await supabase.storage
      .from('knowledge-docs')
      .createSignedUrl(doc.file_path, SIGNED_URL_TTL_SECONDS)
    if (signError || !data?.signedUrl) {
      console.error('[ai/knowledge/file GET] sign error:', signError)
      return NextResponse.json(
        { error: 'Failed to sign file URL' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      url: data.signedUrl,
      mime: mimeFromFilename(doc.file_path) ?? 'application/octet-stream',
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}
