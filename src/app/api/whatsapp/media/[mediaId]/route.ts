import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import {
  sniffMime,
  isAllowedInboundMime,
  MAX_INBOUND_MEDIA_BYTES,
} from '@/lib/media/file-guard'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const { mediaId } = await params
  console.log('[media-proxy] GET request — mediaId:', mediaId)

  if (!mediaId) {
    return NextResponse.json(
      { error: 'Media ID is required' },
      { status: 400 }
    )
  }

  // Meta media IDs are opaque base64-ish tokens. Reject anything that
  // isn't one before it reaches the Graph API — this keeps the proxy
  // from being used as an open fetcher for arbitrary URLs/paths.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(mediaId)) {
    console.warn('[media-proxy] rejected malformed mediaId')
    return NextResponse.json({ error: 'Invalid media ID' }, { status: 400 })
  }

  // Use requireRole to resolve the active account from
  // account_memberships + wacrm_active_account cookie — NOT from
  // profiles.account_id which can be out of sync.
  let ctx
  try {
    ctx = await requireRole('viewer')
  } catch (err) {
    console.error('[media-proxy] auth failed:', (err as Error).message)
    return toErrorResponse(err)
  }
  console.log('[media-proxy] auth OK — accountId:', ctx.accountId, 'userId:', ctx.userId)

  // Fetch whatsapp_config using the service-role client (bypasses RLS)
  const { data: config, error: configError } = await ctx.serviceClient
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', ctx.accountId)
    .single()

  if (configError || !config) {
    console.error('[media-proxy] No whatsapp_config for account:', ctx.accountId, configError?.message)
    return NextResponse.json(
      { error: 'WhatsApp not configured' },
      { status: 400 }
    )
  }
  console.log('[media-proxy] config found — id:', config.id, 'has_access_token:', !!config.access_token)

  const accessToken = decrypt(config.access_token)
  console.log('[media-proxy] access_token decrypted — calling Meta getMediaUrl')

  // Get the download URL from Meta
  const mediaInfo = await getMediaUrl({ mediaId, accessToken })
  console.log('[media-proxy] Meta media URL resolved — mimeType:', mediaInfo.mimeType)

  // Download the binary data (capped at the chat-media bucket limit)
  let downloaded: { buffer: Buffer; contentType: string }
  try {
    downloaded = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
      maxBytes: MAX_INBOUND_MEDIA_BYTES,
    })
  } catch (err) {
    console.error('[media-proxy] download rejected/failed:', (err as Error).message)
    return NextResponse.json({ error: 'Media unavailable' }, { status: 502 })
  }
  const { buffer, contentType } = downloaded
  console.log('[media-proxy] media downloaded — size:', buffer.byteLength, 'bytes, contentType:', contentType)

  // Identify from BYTES, never from the upstream header. Anything we
  // can't vouch for is refused rather than streamed back to the browser.
  const sniffed = sniffMime(buffer)
  if (!sniffed || !isAllowedInboundMime(sniffed)) {
    console.warn(
      '[media-proxy] blocked unsupported media — sniffed:',
      sniffed,
      'claimed:',
      contentType
    )
    return NextResponse.json({ error: 'Unsupported media type' }, { status: 415 })
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': sniffed,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
