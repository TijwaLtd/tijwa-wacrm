import { NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import { getMediaUrl, downloadMedia } from '@/lib/whatsapp/meta-api'
import { normalizePhone } from '@/lib/whatsapp/phone-utils'
import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'
import { reopenClosedConversation } from '@/lib/conversations/reopen'
import { verifyMetaWebhookSignature } from '@/lib/whatsapp/webhook-signature'
import { runAutomationsForTrigger } from '@/lib/automations/engine'
import { dispatchInboundToFlows } from '@/lib/flows/engine'
import { dispatchInboundToAiReply } from '@/lib/ai/auto-reply'
import { dispatchWebhookEvent } from '@/lib/webhooks/deliver'
import { autoAssignConversation } from '@/lib/assignments/auto-assign'
import { detectConversationTopic } from '@/lib/assignments/topic-detection'
import {
  handleTemplateWebhookChange,
  isTemplateWebhookField,
} from '@/lib/whatsapp/template-webhook'

// The `after()` callback in POST runs within this route's max duration.
// Inbound processing can fan out to per-media Meta verification calls, so
// give it headroom beyond the platform default (Vercel clamps this to the
// plan's ceiling). Tune as needed.
export const maxDuration = 60

// Lazy-initialized to avoid build-time crash when env vars are missing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _adminClient
}

interface WhatsAppMessage {
  id: string
  from: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; mime_type: string; caption?: string }
  video?: { id: string; mime_type: string; caption?: string }
  document?: { id: string; mime_type: string; filename?: string; caption?: string }
  audio?: { id: string; mime_type: string }
  sticker?: { id: string; mime_type: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
  reaction?: { message_id: string; emoji: string }
  /**
   * Set when the customer taps a button or list row on an interactive
   * message we sent. `button_reply.id` / `list_reply.id` is whatever id
   * we put on the button/row when sending — the Flows engine uses this
   * to advance the per-contact run.
   */
  interactive?: {
    type: 'button_reply' | 'list_reply'
    button_reply?: { id: string; title: string }
    list_reply?: { id: string; title: string; description?: string }
  }
  /**
   * Set when the customer taps a QUICK_REPLY button on a *template*
   * message — a broadcast, or any template send. Meta uses a different
   * envelope from `interactive` above: `type: 'button'`, the label in
   * `button.text`, and the payload configured on the template's button
   * in `button.payload`.
   */
  button?: { text?: string; payload?: string }
  /** Present when the customer swipe-replies to one of our messages. */
  context?: { id: string }
}

interface WhatsAppWebhookEntry {
  id: string
  changes: Array<{
    value: {
      messaging_product: string
      metadata: {
        display_phone_number: string
        phone_number_id: string
      }
      contacts?: Array<{
        profile: { name: string }
        wa_id: string
      }>
      messages?: WhatsAppMessage[]
      statuses?: Array<{
        id: string
        status: string
        timestamp: string
        recipient_id: string
      }>
    }
    field: string
  }>
}

// ────────────────────────────────────────────────────────────────
// GET — Meta webhook verification
//
// Meta sends a GET with hub.mode=subscribe, hub.verify_token, and
// hub.challenge. We look up the account by slug (subdomain), fetch
// its whatsapp_config, decrypt the verify_token, and compare. If
// the token matches (or is still in legacy CBC format), we return
// the challenge as plain text. Legacy tokens are opportunistically
// upgraded to GCM on every successful verify.
// ────────────────────────────────────────────────────────────────
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const challenge = searchParams.get('hub.challenge')
    const verifyToken = searchParams.get('hub.verify_token')

    console.log('[webhook] GET verify request — slug:', slug, 'mode:', mode, 'token_present:', !!verifyToken, 'challenge_present:', !!challenge)

    if (mode !== 'subscribe' || !challenge || !verifyToken) {
      return NextResponse.json(
        { error: 'Missing verification parameters' },
        { status: 400 },
      )
    }

    // Resolve account from slug (the account's subdomain).
    const { data: account, error: accountError } = await supabaseAdmin()
      .from('accounts')
      .select('id')
      .eq('subdomain', slug)
      .single()

    if (accountError || !account) {
      console.error('[webhook] No account found for slug:', slug, accountError?.message)
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 403 },
      )
    }

    console.log('[webhook] Resolved account', account.id, 'for slug:', slug)

    // Get whatsapp_config for this account.
    const { data: config, error: configError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('id, verify_token')
      .eq('account_id', account.id)
      .single()

    if (configError || !config) {
      console.error('[webhook] No whatsapp_config for account:', account.id, configError?.message)
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 403 },
      )
    }

    if (!config.verify_token) {
      console.error('[webhook] verify_token is null/empty for account:', account.id)
      return NextResponse.json(
        { error: 'Verification failed — no verify token configured' },
        { status: 403 },
      )
    }

    console.log('[webhook] verify_token present, format parts:', config.verify_token.split(':').length, 'meta token length:', verifyToken.length)

    try {
      const decrypted = decrypt(config.verify_token)
      console.log('[webhook] Decrypted token length:', decrypted.length, 'matches:', decrypted === verifyToken)
      if (decrypted === verifyToken) {
        // Fire-and-forget GCM upgrade. Safe to run on every subscribe
        // since it's a no-op once the column is already GCM.
        if (isLegacyFormat(config.verify_token)) {
          void supabaseAdmin()
            .from('whatsapp_config')
            .update({ verify_token: encrypt(verifyToken) })
            .eq('id', config.id)
            .then(({ error }: { error: unknown }) => {
              if (error) {
                console.warn(
                  '[webhook] verify_token GCM upgrade failed:',
                  (error as { message?: string })?.message ?? error,
                )
              }
            })
        }
        return new Response(challenge, {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        })
      }
    } catch (err) {
      // Malformed token or decryption failed
      console.error('[webhook] verify_token decryption failed:', err instanceof Error ? err.message : err)
    }

    console.error('[webhook] Token mismatch for account:', account.id, 'slug:', slug)
    return NextResponse.json(
      { error: 'Verification token mismatch' },
      { status: 403 },
    )
  } catch (error) {
    console.error('[webhook] Error in GET verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

// ────────────────────────────────────────────────────────────────
// POST — Receive inbound messages & status updates
//
// Read raw body first so we can HMAC-verify the exact bytes Meta
// signed. request.json() would re-encode and break the signature.
//
// Process AFTER the response so we ack Meta within their ~20s
// timeout (a slow ack triggers Meta retries + duplicate inserts),
// while still guaranteeing the work runs to completion.
//
// This MUST use `after()` rather than a detached promise: on
// serverless platforms (Vercel) the function can be frozen or
// terminated the moment the response is sent, so a floating
// promise's DB writes are not guaranteed to finish.
// ────────────────────────────────────────────────────────────────
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params

  console.log('[webhook] POST received — slug:', slug)

  const rawBody = await request.text()
  const signature = request.headers.get('x-hub-signature-256')
  console.log('[webhook] body_length:', rawBody.length, 'signature_present:', !!signature)

  if (!verifyMetaWebhookSignature(rawBody, signature)) {
    console.warn('[webhook] rejected request with invalid signature')
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  console.log('[webhook] signature verified OK')

  let body: { entry?: WhatsAppWebhookEntry[] }
  try {
    body = JSON.parse(rawBody)
  } catch {
    console.error('[webhook] Failed to parse JSON body')
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  console.log('[webhook] body parsed — entries:', body.entry?.length ?? 0)

  // Resolve account from slug upfront — one lookup for the whole
  // delivery instead of per-change.
  const { data: account, error: accountError } = await supabaseAdmin()
    .from('accounts')
    .select('id')
    .eq('subdomain', slug)
    .single()

  if (accountError || !account) {
    console.error('[webhook] No account found for slug:', slug, accountError?.message)
    return NextResponse.json({ status: 'received' }, { status: 200 })
  }

  const accountId = account.id
  console.log('[webhook] resolved account:', accountId, 'for slug:', slug)

  // Get whatsapp_config for this account.
  const { data: configs, error: configError } = await supabaseAdmin()
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)

  if (configError || !configs || configs.length === 0) {
    console.error('[webhook] No whatsapp_config for account:', accountId, configError?.message)
    return NextResponse.json({ status: 'received' }, { status: 200 })
  }

  const config = configs[0]
  console.log('[webhook] config found — id:', config.id, 'user_id:', config.user_id, 'phone_number_id:', config.phone_number_id, 'has_access_token:', !!config.access_token)
  const decryptedAccessToken = decrypt(config.access_token)
  console.log('[webhook] access_token decrypted OK')

  // Process AFTER the response — see comment block above.
  after(async () => {
    try {
      console.log('[webhook] after() — starting processWebhook for account:', accountId)
      await processWebhook(body, accountId, config.user_id, decryptedAccessToken)
      console.log('[webhook] after() — processWebhook completed for account:', accountId)
    } catch (error) {
      console.error('[webhook] after() — Error processing webhook:', error)
    }
  })

  return NextResponse.json({ status: 'received' }, { status: 200 })
}

async function processWebhook(
  body: { entry?: WhatsAppWebhookEntry[] },
  accountId: string,
  configOwnerUserId: string,
  accessToken: string,
) {
  if (!body.entry) return

  console.log('[processWebhook] processing', body.entry.length, 'entries')

  for (const entry of body.entry) {
    console.log('[processWebhook] entry id:', entry.id, 'changes:', entry.changes.length)
    for (const change of entry.changes) {
      console.log('[processWebhook] change.field:', change.field, 'has_messages:', !!change.value.messages, 'has_statuses:', !!change.value.statuses, 'has_contacts:', !!change.value.contacts, 'contacts_count:', change.value.contacts?.length ?? 0, 'messages_count:', change.value.messages?.length ?? 0)
      // Template-lifecycle events (status / quality / components
      // updates from Meta) come in on a different change.field and
      // have a different value shape — route them through the
      // dedicated handler. Skip the messaging branches below so we
      // don't try to read message-shaped fields off a template event.
      if (isTemplateWebhookField(change.field)) {
        console.log('[processWebhook] routing to template webhook handler — field:', change.field)
        await handleTemplateWebhookChange(
          { field: change.field, value: change.value as unknown },
          supabaseAdmin(),
        )
        continue
      }

      const value = change.value

      // Handle status updates
      if (value.statuses) {
        console.log('[processWebhook] processing', value.statuses.length, 'status updates')
        for (const status of value.statuses) {
          console.log('[processWebhook] status:', status.status, 'message_id:', status.id, 'recipient_id:', status.recipient_id)
          await handleStatusUpdate(status)
        }
      }

      // Handle incoming messages
      if (!value.messages || !value.contacts) {
        console.log('[processWebhook] skipping — no messages or contacts in change')
        continue
      }

      console.log('[processWebhook] processing', value.messages.length, 'messages with', value.contacts.length, 'contacts')
      for (let i = 0; i < value.messages.length; i++) {
        const message = value.messages[i]
        const contact = value.contacts[i] || value.contacts[0]
        console.log('[processWebhook] message[' + i + ']:', 'id:', message.id, 'from:', message.from, 'type:', message.type, 'wa_id:', contact.wa_id, 'contact_name:', contact.profile.name)

        await processMessage(
          message,
          contact,
          accountId,
          configOwnerUserId,
          accessToken,
        )
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Status updates — broadcast delivery tracking
// ────────────────────────────────────────────────────────────────

const RECIPIENT_STATUS_LADDER = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
] as const

function ladderLevel(s: string): number {
  const idx = (RECIPIENT_STATUS_LADDER as readonly string[]).indexOf(s)
  return idx < 0 ? -1 : idx
}

function isValidStatusTransition(current: string, incoming: string): boolean {
  if (incoming === 'failed') {
    return current === 'pending' || current === 'sent'
  }
  if (current === 'failed') {
    return false
  }
  const ci = ladderLevel(current)
  const ii = ladderLevel(incoming)
  if (ii < 0) return false
  if (ci < 0) return true
  return ii > ci
}

async function handleStatusUpdate(
  status: {
    id: string
    status: string
    timestamp: string
    recipient_id: string
  },
) {
  // 1) Mirror onto messages (legacy behavior).
  const { error: msgErr } = await supabaseAdmin()
    .from('messages')
    .update({ status: status.status })
    .eq('message_id', status.id)

  if (msgErr) {
    console.error('[webhook] Error updating message status:', msgErr)
  }

  // 2) Mirror onto broadcast_recipients via whatsapp_message_id.
  const tsIso = new Date(parseInt(status.timestamp) * 1000).toISOString()

  const { data: recipient, error: recFetchErr } = await supabaseAdmin()
    .from('broadcast_recipients')
    .select('id, status')
    .eq('whatsapp_message_id', status.id)
    .maybeSingle()

  if (recFetchErr) {
    console.error('[webhook] Error fetching broadcast recipient:', recFetchErr)
  } else if (
    recipient &&
    isValidStatusTransition(recipient.status, status.status)
  ) {
    const update: Record<string, unknown> = { status: status.status }
    if (status.status === 'sent' && !('sent_at' in update)) update.sent_at = tsIso
    if (status.status === 'delivered') update.delivered_at = tsIso
    if (status.status === 'read') update.read_at = tsIso

    const { error: recUpdateErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update(update)
      .eq('id', recipient.id)

    if (recUpdateErr) {
      console.error('[webhook] Error updating broadcast recipient status:', recUpdateErr)
    }
  }

  // 3) Webhook fan-out for status changes.
  const { data: msgRow } = await supabaseAdmin()
    .from('messages')
    .select('conversation_id, conversations(account_id)')
    .eq('message_id', status.id)
    .limit(1)
    .maybeSingle()

  if (msgRow) {
    const conv = msgRow.conversations as { account_id: string } | null
    const msgAccountId = conv?.account_id
    if (msgAccountId) {
      await dispatchWebhookEvent(
        supabaseAdmin(),
        msgAccountId,
        'message.status_updated',
        {
          whatsapp_message_id: status.id,
          conversation_id: msgRow.conversation_id,
          status: status.status,
        },
      )
    }
  }
}

async function flagBroadcastReplyIfAny(accountId: string, contactId: string) {
  try {
    const { data: recs, error } = await supabaseAdmin()
      .from('broadcast_recipients')
      .select('id, status, broadcast_id, broadcasts!inner(account_id)')
      .eq('contact_id', contactId)
      .eq('broadcasts.account_id', accountId)
      .in('status', ['sent', 'delivered', 'read'])
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !recs || recs.length === 0) return

    const row = recs[0]
    const { error: updErr } = await supabaseAdmin()
      .from('broadcast_recipients')
      .update({ status: 'replied', replied_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updErr) {
      console.error('[webhook] Error marking broadcast recipient replied:', updErr)
    }
  } catch (err) {
    console.error('[webhook] flagBroadcastReplyIfAny failed:', err)
  }
}

async function lookupInternalIdByMetaId(
  metaId: string,
  conversationId: string,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from('messages')
    .select('id')
    .eq('message_id', metaId)
    .eq('conversation_id', conversationId)
    .maybeSingle()
  if (error) {
    console.error('[webhook] lookupInternalIdByMetaId failed:', error.message)
    return null
  }
  return data?.id ?? null
}

async function handleReaction(
  message: WhatsAppMessage,
  conversationId: string,
  contactId: string,
) {
  const reaction = message.reaction
  if (!reaction?.message_id) return

  const targetInternalId = await lookupInternalIdByMetaId(
    reaction.message_id,
    conversationId,
  )
  if (!targetInternalId) {
    console.warn(
      '[webhook] reaction target message not found; skipping',
      reaction.message_id,
    )
    return
  }

  if (!reaction.emoji) {
    const { error: delError } = await supabaseAdmin()
      .from('message_reactions')
      .delete()
      .eq('message_id', targetInternalId)
      .eq('actor_type', 'customer')
      .eq('actor_id', contactId)
    if (delError) {
      console.error('[webhook] reaction delete failed:', delError.message)
    }
    return
  }

  const { error: upsertError } = await supabaseAdmin()
    .from('message_reactions')
    .upsert(
      {
        message_id: targetInternalId,
        conversation_id: conversationId,
        actor_type: 'customer',
        actor_id: contactId,
        emoji: reaction.emoji,
      },
      { onConflict: 'message_id,actor_type,actor_id' },
    )
  if (upsertError) {
    console.error('[webhook] reaction upsert failed:', upsertError.message)
  }
}

// ────────────────────────────────────────────────────────────────
// Inbound message processing
// ────────────────────────────────────────────────────────────────

async function processMessage(
  message: WhatsAppMessage,
  contact: { profile: { name: string }; wa_id: string },
  accountId: string,
  configOwnerUserId: string,
  accessToken: string,
) {
  const senderPhone = normalizePhone(message.from)
  const contactName = contact.profile.name
  const waId = contact.wa_id || null

  console.log('[processMessage] senderPhone:', senderPhone, 'contactName:', contactName, 'waId:', waId, 'messageId:', message.id)

  const contactOutcome = await findOrCreateContact(
    accountId,
    configOwnerUserId,
    senderPhone,
    contactName,
    waId,
  )
  if (!contactOutcome) {
    console.error('[processMessage] findOrCreateContact returned null — aborting message:', message.id)
    return
  }
  const contactRecord = contactOutcome.contact
  console.log('[processMessage] contact resolved — id:', contactRecord.id, 'wasCreated:', contactOutcome.wasCreated, 'phone:', contactRecord.phone, 'wa_id:', contactRecord.wa_id)

  const convResult = await findOrCreateConversation(
    accountId,
    configOwnerUserId,
    contactRecord.id,
  )
  if (!convResult) {
    console.error('[processMessage] findOrCreateConversation returned null — aborting message:', message.id)
    return
  }
  const conversation = convResult.conversation
  console.log('[processMessage] conversation resolved — id:', conversation.id, 'created:', convResult.created)

  // Parse message content early — needed below for auto-assign topic detection
  const { contentText, mediaUrl, mediaType, interactiveReplyId } =
    await parseMessageContent(message, accessToken)
  console.log('[processMessage] content parsed — type:', message.type, 'contentText:', contentText?.slice(0, 100) ?? 'null', 'hasMedia:', !!mediaUrl, 'interactiveReplyId:', interactiveReplyId ?? 'null')

  if (convResult.created) {
    await dispatchWebhookEvent(supabaseAdmin(), accountId, 'conversation.created', {
      conversation_id: conversation.id,
      contact_id: contactRecord.id,
    })

    // Detect topic + auto-assign newly created conversations (fire-and-forget)
    after(async () => {
      try {
        // Detect language and department from first message
        if (contentText) {
          await detectConversationTopic(supabaseAdmin(), accountId, conversation.id, contentText)
        }
        await autoAssignConversation(supabaseAdmin(), accountId, conversation.id)
      } catch (err) {
        console.error('[processMessage] auto-assign failed:', err)
      }
    })
  } else if (!conversation.assigned_agent_id && contentText) {
    // Existing unassigned conversation received a new message — try to assign
    after(async () => {
      try {
        await autoAssignConversation(supabaseAdmin(), accountId, conversation.id)
      } catch (err) {
        console.error('[processMessage] re-assign failed:', err)
      }
    })
  }

  if (message.type === 'reaction') {
    console.log('[processMessage] handling reaction for message:', message.id)
    await handleReaction(message, conversation.id, contactRecord.id)
    return
  }

  // Persist inbound media to public storage so we don't depend on
  // the auth-gated proxy. If persistence fails, fall back to the
  // proxy URL (best-effort — message is still saved).
  let finalMediaUrl = mediaUrl
  if (mediaUrl && message.type !== 'reaction') {
    const metaMediaId = mediaUrl.replace('/api/whatsapp/media/', '')
    console.log('[processMessage] persisting inbound media — metaMediaId:', metaMediaId)
    const publicUrl = await persistInboundMedia(
      accountId,
      metaMediaId,
      accessToken,
      `${contactName.replace(/[^a-zA-Z0-9]+/g, '_')}_${message.type}`,
    )
    if (publicUrl) {
      finalMediaUrl = publicUrl
      console.log('[processMessage] media persisted to public bucket')
    } else {
      console.warn('[processMessage] media persistence failed — falling back to proxy URL')
    }
  }

  let replyToInternalId: string | null = null
  if (message.context?.id) {
    replyToInternalId = await lookupInternalIdByMetaId(
      message.context.id,
      conversation.id,
    )
    if (!replyToInternalId) {
      console.warn(
        '[webhook] reply context parent not found:',
        message.context.id,
      )
    }
  }

  void mediaType

  const ALLOWED_CONTENT_TYPES = new Set([
    'text', 'image', 'document', 'audio', 'video',
    'location', 'template', 'interactive',
  ])
  const contentType = ALLOWED_CONTENT_TYPES.has(message.type)
    ? message.type
    : message.type === 'sticker'
      ? 'image'
      : message.type === 'button'
        ? 'interactive'
        : 'text'

  const { count: priorCustomerMsgCount } = await supabaseAdmin()
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .eq('sender_type', 'customer')
  const isFirstInboundMessage = (priorCustomerMsgCount ?? 0) === 0
  console.log('[processMessage] priorCustomerMsgCount:', priorCustomerMsgCount, 'isFirstInbound:', isFirstInboundMessage)

  const { data: insertedRows, error: msgError } = await supabaseAdmin()
    .from('messages')
    .upsert(
      {
        conversation_id: conversation.id,
        sender_type: 'customer',
        content_type: contentType,
        content_text: contentText,
        media_url: finalMediaUrl,
        message_id: message.id,
        status: 'delivered',
        created_at: new Date(parseInt(message.timestamp) * 1000).toISOString(),
        reply_to_message_id: replyToInternalId,
        interactive_reply_id: interactiveReplyId,
      },
      { onConflict: 'conversation_id,message_id', ignoreDuplicates: true },
    )
    .select('id')

  if (msgError) {
    console.error('[processMessage] Error inserting message:', msgError.message, msgError.code, msgError.details)
    return
  }

  if (!insertedRows || insertedRows.length === 0) {
    console.info(
      '[processMessage] duplicate inbound message ignored (idempotent replay):',
      message.id,
    )
    return
  }
  console.log('[processMessage] message inserted — id:', insertedRows[0].id, 'meta_message_id:', message.id)

  const { error: convError } = await supabaseAdmin().rpc(
    'bump_conversation_on_inbound',
    {
      p_conversation_id: conversation.id,
      p_last_message_text: contentText || `[${message.type}]`,
    },
  )

  if (convError) {
    console.error('[processMessage] Error bumping conversation:', convError.message, convError.code)
  }

  await reopenClosedConversation(supabaseAdmin(), conversation)

  await flagBroadcastReplyIfAny(accountId, contactRecord.id)

  // When a customer taps a button/list row, look up the quick reply
  // linked to that reply_id to find its flow. The Postgres function
  // does the JSONB traversal (buttons[].id / sections[].rows[].id) in
  // a single query — no application-side iteration needed.
  let quickReplyFlowId: string | null = null
  if (interactiveReplyId) {
    const { data } = await supabaseAdmin()
      .rpc('find_quick_reply_flow_by_reply_id', {
        p_reply_id:   interactiveReplyId,
        p_account_id: accountId,
      })
      .maybeSingle()

    if (data) {
      quickReplyFlowId = data as string
      console.log('[processMessage] quick reply linked to flow:', quickReplyFlowId)
    }
  }

  const flowResult = await dispatchInboundToFlows({
    accountId,
    userId: configOwnerUserId,
    contactId: contactRecord.id,
    conversationId: conversation.id,
    quickReplyFlowId,
    message:
      interactiveReplyId
        ? {
            kind: 'interactive_reply',
            reply_id: interactiveReplyId,
            reply_title: contentText ?? '',
            meta_message_id: message.id,
          }
        : {
            kind: 'text',
            text: contentText ?? message.text?.body ?? '',
            meta_message_id: message.id,
          },
    isFirstInboundMessage,
  })
  const flowConsumed = flowResult.consumed
  console.log('[processMessage] flow dispatch — consumed:', flowConsumed)

  const inboundText = contentText ?? message.text?.body ?? ''
  const automationTriggers: (
    | 'new_contact_created'
    | 'first_inbound_message'
    | 'new_message_received'
    | 'keyword_match'
    | 'interactive_reply'
  )[] = []

  if (!flowConsumed) {
    automationTriggers.push('new_message_received', 'keyword_match')
    if (interactiveReplyId) {
      automationTriggers.push('interactive_reply')
    }
  }

  if (contactOutcome.wasCreated) automationTriggers.unshift('new_contact_created')
  if (isFirstInboundMessage) automationTriggers.unshift('first_inbound_message')
  console.log('[processMessage] automation triggers:', automationTriggers)

  for (const triggerType of automationTriggers) {
    await runAutomationsForTrigger({
      accountId,
      triggerType,
      contactId: contactRecord.id,
      context: {
        message_text: inboundText,
        conversation_id: conversation.id,
        interactive_reply_id: interactiveReplyId ?? undefined,
      },
    }).catch((err) => console.error('[automations] dispatch failed:', err))
  }

  if (!flowConsumed && !interactiveReplyId && inboundText.trim()) {
    console.log('[processMessage] dispatching AI auto-reply for conversation:', conversation.id)
    await dispatchInboundToAiReply({
      accountId,
      conversationId: conversation.id,
      contactId: contactRecord.id,
      configOwnerUserId,
    })
  }

  await dispatchWebhookEvent(supabaseAdmin(), accountId, 'message.received', {
    conversation_id: conversation.id,
    contact_id: contactRecord.id,
    whatsapp_message_id: message.id,
    content_type: contentType,
    text: contentText,
  })
}

async function parseMessageContent(
  message: WhatsAppMessage,
  accessToken: string,
): Promise<{
  contentText: string | null
  mediaUrl: string | null
  mediaType: string | null
  interactiveReplyId: string | null
}> {
  const verifyAndBuildUrl = async (
    mediaId: string,
  ): Promise<string | null> => {
    try {
      await getMediaUrl({ mediaId, accessToken })
      return `/api/whatsapp/media/${mediaId}`
    } catch (error) {
      console.error(
        `[webhook] Failed to verify media ${mediaId} with Meta:`,
        error instanceof Error ? error.message : error,
      )
      return null
    }
  }

  const empty = {
    contentText: null,
    mediaUrl: null,
    mediaType: null,
    interactiveReplyId: null,
  }

  switch (message.type) {
    case 'text':
      return { ...empty, contentText: message.text?.body || null }

    case 'image':
      if (message.image?.id) {
        return {
          ...empty,
          contentText: message.image.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.image.id),
          mediaType: message.image.mime_type,
        }
      }
      return empty

    case 'video':
      if (message.video?.id) {
        return {
          ...empty,
          contentText: message.video.caption || null,
          mediaUrl: await verifyAndBuildUrl(message.video.id),
          mediaType: message.video.mime_type,
        }
      }
      return empty

    case 'document':
      if (message.document?.id) {
        return {
          ...empty,
          contentText:
            message.document.caption || message.document.filename || null,
          mediaUrl: await verifyAndBuildUrl(message.document.id),
          mediaType: message.document.mime_type,
        }
      }
      return empty

    case 'audio':
      if (message.audio?.id) {
        return {
          ...empty,
          mediaUrl: await verifyAndBuildUrl(message.audio.id),
          mediaType: message.audio.mime_type,
        }
      }
      return empty

    case 'sticker':
      if (message.sticker?.id) {
        return {
          ...empty,
          mediaUrl: await verifyAndBuildUrl(message.sticker.id),
          mediaType: message.sticker.mime_type,
        }
      }
      return empty

    case 'location':
      if (message.location) {
        const loc = message.location
        const locationText = [loc.name, loc.address, `${loc.latitude},${loc.longitude}`]
          .filter(Boolean)
          .join(' - ')
        return { ...empty, contentText: locationText }
      }
      return empty

    case 'reaction':
      return { ...empty, contentText: message.reaction?.emoji || null }

    case 'interactive': {
      const reply =
        message.interactive?.button_reply ?? message.interactive?.list_reply
      if (reply?.id) {
        return {
          ...empty,
          contentText: reply.title || reply.id,
          interactiveReplyId: reply.id,
        }
      }
      return { ...empty, contentText: '[Interactive reply]' }
    }

    case 'button': {
      const payload = message.button?.payload || null
      const label = message.button?.text || null
      return {
        ...empty,
        contentText: label || payload,
        interactiveReplyId: payload || label,
      }
    }

    default:
      return {
        ...empty,
        contentText: `[Unsupported message type: ${message.type}]`,
      }
  }
}

// ────────────────────────────────────────────────────────────────
// Inbound media persistence
//
// Instead of storing a proxy URL (/api/whatsapp/media/<id>) that
// requires auth + Meta round-trip on every page load, we download
// the bytes from Meta once during webhook processing and upload them
// to the public chat-media bucket. The stored public URL works like
// any other image — no proxy, no auth, no blob cache needed.
// ────────────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/aac': 'aac',
  'audio/mp4': 'm4a',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/msword': 'doc',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.ms-excel': 'xls',
  'text/plain': 'txt',
}

function extForMime(contentType: string): string {
  return MIME_TO_EXT[contentType.split(';')[0].trim()] || 'bin'
}

const BUCKET = 'chat-media'

/**
 * Download media from Meta and upload to the public chat-media bucket.
 * Returns the public URL on success, or null on failure (logged and
 * swallowed — the message is still saved, just without media).
 */
async function persistInboundMedia(
  accountId: string,
  mediaId: string,
  accessToken: string,
  contentLabel: string,
): Promise<string | null> {
  try {
    // Step 1: Resolve Meta CDN URL + MIME type
    const mediaInfo = await getMediaUrl({ mediaId, accessToken })
    console.log('[persistMedia] Meta resolved — mimeType:', mediaInfo.mimeType)

    // Step 2: Download binary bytes
    const { buffer, contentType } = await downloadMedia({
      downloadUrl: mediaInfo.url,
      accessToken,
    })
    console.log('[persistMedia] downloaded — size:', buffer.byteLength, 'bytes')

    // Step 3: Build account-scoped storage path
    const ext = extForMime(contentType)
    const safeLabel = contentLabel.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40) || 'media'
    const path = `account-${accountId}/${Date.now()}-${safeLabel}.${ext}`

    // Step 4: Upload to chat-media bucket (service-role bypasses RLS)
    const { error: upErr } = await supabaseAdmin()
      .storage
      .from(BUCKET)
      .upload(path, buffer, {
        cacheControl: '3600',
        upsert: false,
        contentType,
      })

    if (upErr) {
      console.error('[persistMedia] upload failed:', upErr.message)
      return null
    }

    // Step 5: Get public URL
    const { data: urlData } = supabaseAdmin()
      .storage
      .from(BUCKET)
      .getPublicUrl(path)

    console.log('[persistMedia] persisted — publicUrl:', urlData.publicUrl)
    return urlData.publicUrl
  } catch (err) {
    console.error('[persistMedia] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContactRow = any

interface ContactOutcome {
  contact: ContactRow
  wasCreated: boolean
}

async function findOrCreateContact(
  accountId: string,
  configOwnerUserId: string,
  phone: string,
  name: string,
  waId: string | null,
): Promise<ContactOutcome | null> {
  console.log('[findOrCreateContact] accountId:', accountId, 'phone:', phone, 'waId:', waId, 'name:', name)

  // 1. Try lookup by Meta's wa_id (business-scoped user ID) first —
  //    this is the most reliable identifier Meta provides.
  if (waId) {
    console.log('[findOrCreateContact] step 1: looking up by wa_id:', waId)
    const { data: byWaId } = await supabaseAdmin()
      .from('contacts')
      .select('*')
      .eq('account_id', accountId)
      .eq('wa_id', waId)
      .maybeSingle()

    if (byWaId) {
      console.log('[findOrCreateContact] step 1: found contact by wa_id — id:', byWaId.id, 'phone:', byWaId.phone, 'existing_wa_id:', byWaId.wa_id)
      // Backfill wa_id on contacts created before this migration.
      if (!byWaId.wa_id) {
        console.log('[findOrCreateContact] backfilling wa_id on contact:', byWaId.id)
        await supabaseAdmin()
          .from('contacts')
          .update({ wa_id: waId, updated_at: new Date().toISOString() })
          .eq('id', byWaId.id)
      }
      // Update name if it changed.
      if (name && name !== byWaId.name) {
        console.log('[findOrCreateContact] updating name on contact:', byWaId.id, 'old:', byWaId.name, 'new:', name)
        await supabaseAdmin()
          .from('contacts')
          .update({ name, updated_at: new Date().toISOString() })
          .eq('id', byWaId.id)
      }
      return { contact: byWaId, wasCreated: false }
    }
    console.log('[findOrCreateContact] step 1: no contact found by wa_id')
  }

  // 2. Fall back to phone-based lookup.
  console.log('[findOrCreateContact] step 2: looking up by phone:', phone)
  const existingContact = await findExistingContact(
    supabaseAdmin(),
    accountId,
    phone,
  )

  if (existingContact) {
    console.log('[findOrCreateContact] step 2: found contact by phone — id:', existingContact.id, 'phone:', existingContact.phone)
    // Backfill wa_id on contacts created before this migration.
    if (waId && !existingContact.wa_id) {
      console.log('[findOrCreateContact] backfilling wa_id on phone-matched contact:', existingContact.id)
      await supabaseAdmin()
        .from('contacts')
        .update({ wa_id: waId, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
    }
    if (name && name !== existingContact.name) {
      console.log('[findOrCreateContact] updating name on phone-matched contact:', existingContact.id, 'old:', existingContact.name, 'new:', name)
      await supabaseAdmin()
        .from('contacts')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existingContact.id)
    }
    return { contact: existingContact, wasCreated: false }
  }

  // 3. Create new contact — store wa_id alongside phone.
  console.log('[findOrCreateContact] step 3: creating new contact — phone:', phone, 'wa_id:', waId, 'name:', name || phone)
  const { data: newContact, error: createError } = await supabaseAdmin()
    .from('contacts')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      phone,
      name: name || phone,
      wa_id: waId,
    })
    .select()
    .single()

  if (createError) {
    console.error('[findOrCreateContact] step 3: create error:', createError.message, createError.code, createError.details)
    if (isUniqueViolation(createError)) {
      console.log('[findOrCreateContact] step 3: unique violation — retrying phone lookup')
      const raced = await findExistingContact(supabaseAdmin(), accountId, phone)
      if (raced) {
        console.log('[findOrCreateContact] step 3: race-resolved contact — id:', raced.id)
        return { contact: raced, wasCreated: false }
      }
    }
    return null
  }

  console.log('[findOrCreateContact] step 3: new contact created — id:', newContact.id, 'phone:', newContact.phone, 'wa_id:', newContact.wa_id)
  return { contact: newContact, wasCreated: true }
}

async function findOrCreateConversation(
  accountId: string,
  configOwnerUserId: string,
  contactId: string,
) {
  const { data: existingRows, error: findError } = await supabaseAdmin()
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (findError) {
    console.error('[findOrCreateConversation] Error finding conversation:', findError.message, findError.code)
    return null
  }

  if (existingRows && existingRows.length > 0) {
    console.log('[findOrCreateConversation] found existing conversation — id:', existingRows[0].id, 'created_at:', existingRows[0].created_at)
    return { conversation: existingRows[0], created: false }
  }

  console.log('[findOrCreateConversation] no existing conversation — creating new for contact:', contactId)
  const { data: newConv, error: createError } = await supabaseAdmin()
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: configOwnerUserId,
      contact_id: contactId,
    })
    .select()
    .single()

  if (createError) {
    console.error('[findOrCreateConversation] create error:', createError.message, createError.code, createError.details)
    if (isUniqueViolation(createError)) {
      console.log('[findOrCreateConversation] unique violation — retrying find')
      const { data: raced } = await supabaseAdmin()
        .from('conversations')
        .select('*')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (raced && raced.length > 0) {
        console.log('[findOrCreateConversation] race-resolved conversation — id:', raced[0].id)
        return { conversation: raced[0], created: false }
      }
    }
    return null
  }

  console.log('[findOrCreateConversation] new conversation created — id:', newConv.id)
  return { conversation: newConv, created: true }
}
