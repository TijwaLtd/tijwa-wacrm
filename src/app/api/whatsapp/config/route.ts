import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { sendWhatsappConfigEmail, sendWhatsappResetEmail } from '@/lib/email/send'
import crypto from 'crypto'

// Lazy-initialised service-role client. We need it to detect a
// phone_number_id already claimed by a *different* account — under RLS,
// the user's own session can't see other accounts' rows, so the conflict
// would be invisible without the service role.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _adminClient: any = null
function supabaseAdmin() {
  if (!_adminClient) {
    _adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return _adminClient
}

/**
 * GET /api/whatsapp/config
 *
 * Used by the "Test API Connection" button and by the page to check
 * whether the saved config is healthy. Returns 200 in all non-auth cases
 * so the UI can render an appropriate message rather than show a 500.
 *
 * Response shape:
 *   { connected: true,  phone_info: {...} }
 *   { connected: false, reason: 'no_config',        message: '...' }
 *   { connected: false, reason: 'token_corrupted',  message: '...', needs_reset: true }
 *   { connected: false, reason: 'meta_api_error',   message: '...' }
 */
export async function GET() {
  try {
    const ctx = await requireRole('viewer')

    console.log('[whatsapp/config GET] accountId:', ctx.accountId, 'userId:', ctx.userId, 'role:', ctx.role)

    const { data: config, error: configError } = await ctx.supabase
      .from('whatsapp_config')
      .select('phone_number_id, access_token, status, waba_id, verify_token, registered_at, last_registration_error')
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    if (configError) {
      console.error('[whatsapp/config GET] DB error:', configError)
      return NextResponse.json(
        { connected: false, reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!config) {
      console.log('[whatsapp/config GET] No config row for account:', ctx.accountId)
      return NextResponse.json(
        {
          connected: false,
          reason: 'no_config',
          message: 'No WhatsApp configuration saved yet. Fill in the form and click Save Configuration.',
        },
        { status: 200 }
      )
    }

    console.log('[whatsapp/config GET] Found config for account:', ctx.accountId, 'phone:', config.phone_number_id, 'has_verify_token:', Boolean(config.verify_token))

    // Build a safe config object for the client — NEVER send the
    // encrypted access_token back. The verify_token is auto-generated
    // and the user needs to see it to configure Meta's webhook, so
    // we decrypt and return it.
    let verifyTokenPlaintext: string | null = null
    if (config.verify_token) {
      try {
        verifyTokenPlaintext = decrypt(config.verify_token)
      } catch {
        console.warn('[whatsapp/config GET] Could not decrypt verify_token for display')
      }
    }

    const safeConfig = {
      phone_number_id: config.phone_number_id,
      waba_id: config.waba_id,
      registered_at: config.registered_at,
      last_registration_error: config.last_registration_error,
      verify_token: verifyTokenPlaintext,
    }

    // Try to decrypt the stored token with the current ENCRYPTION_KEY.
    // If this fails, the key changed (or was never consistent across envs).
    let accessToken: string
    try {
      accessToken = decrypt(config.access_token)
    } catch (err) {
      console.error('[whatsapp/config GET] Token decryption failed:', err)
      return NextResponse.json(
        {
          connected: false,
          reason: 'token_corrupted',
          needs_reset: true,
          message:
            'The stored access token cannot be decrypted with the current ENCRYPTION_KEY. This usually means the key changed, or it differs between environments (local vs Hostinger vs Vercel). Click "Reset Configuration" below, then re-save.',
          config: safeConfig,
        },
        { status: 200 }
      )
    }

    // Validate credentials against Meta
    try {
      const phoneInfo = await verifyPhoneNumber({
        phoneNumberId: config.phone_number_id,
        accessToken,
      })
      console.log('[whatsapp/config GET] Meta verification succeeded for phone:', config.phone_number_id)
      return NextResponse.json({ connected: true, phone_info: phoneInfo, config: safeConfig })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/config GET] Meta API verification failed:', message)
      return NextResponse.json(
        {
          connected: false,
          reason: 'meta_api_error',
          message: `Meta API rejected the credentials: ${message}`,
          config: safeConfig,
        },
        { status: 200 }
      )
    }
  } catch (error) {
    return toErrorResponse(error)
  }
}

/**
 * POST /api/whatsapp/config
 *
 * Saves or updates the WhatsApp config for the authenticated user.
 * Verifies credentials with Meta first, then encrypts and stores.
 */
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin')

    console.log('[whatsapp/config POST] accountId:', ctx.accountId, 'userId:', ctx.userId, 'role:', ctx.role)

    const body = await request.json()
    const { phone_number_id, waba_id, access_token, verify_token, pin } = body

    if (!access_token || !phone_number_id) {
      return NextResponse.json(
        { error: 'Phone Number ID and Access Token are required. Please re-enter your Access Token if updating existing configuration.' },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    // Look up any pre-existing row for this account FIRST — we need it
    // to (a) preserve existing verify_token, (b) detect same-number
    // re-saves, and (c) decide INSERT vs UPDATE. This must happen
    // before encryption and before the Meta verification call.
    const { data: existing } = await ctx.supabase
      .from('whatsapp_config')
      .select('id, registered_at, phone_number_id, verify_token')
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    console.log('[whatsapp/config POST] Existing config:', existing ? 'yes (id: ' + existing.id + ')' : 'no')

    // Reject if another account has already claimed this phone_number_id.
    // tijwa-crm is single-tenant-per-WhatsApp-number — letting two accounts
    // bind the same number causes the webhook's `.single()` lookup to
    // throw PGRST116 ("multiple rows"), silently dropping every
    // inbound message. See issue #136. We use supabaseAdmin() here
    // because RLS would hide other accounts' rows.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone_number_id)
      .neq('account_id', ctx.accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('[whatsapp/config POST] Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance. Each phone number can only be connected to one tijwa-crm user.',
        },
        { status: 409 }
      )
    }

    // Verify credentials with Meta BEFORE saving
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[whatsapp/config POST] Meta API verification failed:', message)
      // Provide actionable guidance based on common Meta errors
      let hint = ''
      if (message.includes('Invalid OAuth access token') || message.includes('expired')) {
        hint = ' Your access token may be expired. Generate a new System User token in Meta Business Manager.'
      } else if (message.includes('Invalid parameter') || message.includes('does not exist')) {
        hint = ' The Phone Number ID may be incorrect. Check it in Meta Business Manager > WhatsApp Manager > Phone Numbers.'
      } else if (message.includes('Permission denied') || message.includes('permission')) {
        hint = ' Your token is missing required permissions. Ensure it has whatsapp_business_management and business_management scopes.'
      }
      return NextResponse.json(
        { error: `Meta verification failed: ${message}.${hint}` },
        { status: 400 }
      )
    }

    // Encrypt sensitive tokens before storing
    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    let autoGeneratedVerifyToken: string | null = null
    try {
      encryptedAccessToken = encrypt(access_token)

      if (verify_token) {
        // User provided a new verify token — encrypt it.
        encryptedVerifyToken = encrypt(verify_token)
      } else if (existing?.verify_token) {
        // No verify_token in request but config already exists with
        // one saved — preserve the existing encrypted token. Setting
        // this to null would break webhook verification.
        encryptedVerifyToken = existing.verify_token
      } else {
        // First-time save, no verify_token provided — auto-generate
        // one so webhook verification works out of the box.
        autoGeneratedVerifyToken = `wacrm_${crypto.randomUUID().replace(/-/g, '')}`
        encryptedVerifyToken = encrypt(autoGeneratedVerifyToken)
        console.log('[whatsapp/config POST] Auto-generated verify_token for account:', ctx.accountId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('[whatsapp/config POST] Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 }
      )
    }

    const sameNumber =
      existing?.phone_number_id === phone_number_id &&
      existing?.registered_at != null

    // Step 1: register the phone number for inbound webhooks.
    //
    // Attempted on first save AND whenever the user supplies a fresh
    // PIN (e.g. they rotated the 2FA PIN in Meta Manager). Skipped
    // when the same number is already registered and no PIN was
    // supplied — re-registering an already-active number with a
    // stale PIN would actually fail and undo the active subscription.
    let registeredAt: string | null = existing?.registered_at ?? null
    let registrationError: string | null = null
    // True when registration was deliberately skipped because no PIN
    // was supplied (see below). Distinct from registrationError — this
    // is not a failure, just an incomplete-but-valid save.
    let registrationSkipped = false

    const needsRegistration = !sameNumber || (typeof pin === 'string' && pin.length > 0)
    if (needsRegistration) {
      if (!pin) {
        // No PIN provided. Meta TEST numbers (Developer Console) are
        // pre-registered by Meta and expose no two-step verification
        // PIN to set, so requiring one made them impossible to connect
        // (issue #242). The /register + PIN step only matters for
        // production numbers under a shared WABA (issue #136), so treat
        // it as best-effort: skip it, save the (already Meta-verified)
        // credentials as connected, and leave registered_at null. The
        // UI surfaces a separate "Not registered" banner with a path to
        // add a PIN later for users who do need inbound webhook routing.
        registrationSkipped = true
      } else {
        try {
          await registerPhoneNumber({
            phoneNumberId: phone_number_id,
            accessToken: access_token,
            pin,
          })
          registeredAt = new Date().toISOString()
        } catch (err) {
          registrationError =
            err instanceof Error ? err.message : 'Unknown Meta API error'
          console.error('[whatsapp/config POST] Phone number /register failed:', registrationError)
          // We deliberately fall through and still save the row so the
          // user can retry without re-entering everything. The UI
          // surfaces `last_registration_error` so they see WHY it's
          // not actually live yet.
        }
      }
    }

    // Step 2: subscribe the WABA to this app. Idempotent on Meta's
    // side, so we call on every save and persist the timestamp.
    // Skipped only when there's no waba_id (legacy rows from before
    // we required it).
    let subscribedAppsAt: string | null = null
    if (waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id,
          accessToken: access_token,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('[whatsapp/config POST] WABA subscribed_apps failed (non-fatal):', message)
        // Subscription failures are rare once the App has the right
        // permissions; we don't block save on them — the diagnostic
        // endpoint surfaces this state too.
      }
    }

    // Persist everything in one shot. If /register failed we still
    // store the credentials and the error so the UI can guide the
    // user through a retry.
    const baseRow = {
      phone_number_id,
      waba_id: waba_id || null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: registrationError ? 'disconnected' : 'connected',
      connected_at: registrationError ? null : new Date().toISOString(),
      registered_at: registrationError ? null : registeredAt,
      subscribed_apps_at: subscribedAppsAt ?? null,
      last_registration_error: registrationError,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error: updateError } = await ctx.supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('account_id', ctx.accountId)

      if (updateError) {
        console.error('[whatsapp/config POST] Error updating whatsapp_config:', updateError)
        const message =
          updateError.code === '42501' || updateError.message?.includes('permission')
            ? 'Only workspace admins can update WhatsApp configuration.'
            : 'Failed to update configuration. Please try again.'
        return NextResponse.json(
          { error: message },
          { status: 403 }
        )
      }

      console.log('[whatsapp/config POST] Updated config for account:', ctx.accountId)
    } else {
      // Insert with both columns: `account_id` is the tenancy key
      // (NOT NULL post-017, UNIQUE so duplicates trip the constraint
      // up-front), `user_id` is the audit column identifying which
      // member of the account saved the config.
      const { error: insertError } = await ctx.supabase
        .from('whatsapp_config')
        .insert({
          account_id: ctx.accountId,
          user_id: ctx.userId,
          ...baseRow,
        })

      if (insertError) {
        console.error('[whatsapp/config POST] Error inserting whatsapp_config:', insertError)
        const message =
          insertError.code === '42501' || insertError.message?.includes('permission')
            ? 'Only workspace admins can save WhatsApp configuration.'
            : insertError.code === '23505'
              ? 'A configuration already exists for this workspace. Please update instead of creating a new one.'
              : 'Failed to save configuration. Please try again.'
        return NextResponse.json(
          { error: message },
          { status: insertError.code === '42501' ? 403 : 500 }
        )
      }

      console.log('[whatsapp/config POST] Inserted config for account:', ctx.accountId)
    }

    // ── Fire-and-forget: send config confirmation email ──────────
    // Don't block the response on email delivery.
    const plainVerifyToken = autoGeneratedVerifyToken || (existing?.verify_token ? decrypt(existing.verify_token) : null)

    // Fetch user email from auth (best-effort, non-blocking)
    createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ).auth.admin.getUserById(ctx.userId)
      .then(({ data: { user } }) => {
        if (!user?.email) {
          console.log('[whatsapp/config POST] No email for user, skipping notification')
          return
        }
        return sendWhatsappConfigEmail(user.email, {
          name: 'there',
          phoneNumberId: phone_number_id,
          wabaId: waba_id || undefined,
          verifyToken: plainVerifyToken || undefined,
        })
      })
      .then((result) => {
        if (result?.success) console.log('[whatsapp/config POST] Config confirmation email sent')
      })
      .catch((err) => console.error('[whatsapp/config POST] Config confirmation email failed:', err))

    if (registrationError) {
      // Save succeeded but the number isn't actually live. Return
      // 200 with a structured error so the UI can show the specific
      // remediation step instead of a generic toast.
      return NextResponse.json({
        success: false,
        saved: true,
        registered: false,
        registration_error: registrationError,
        phone_info: phoneInfo,
        ...(autoGeneratedVerifyToken ? { generated_verify_token: autoGeneratedVerifyToken } : {}),
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: registeredAt != null,
      // Credentials are valid and saved, but inbound webhook
      // registration was skipped because no PIN was supplied (e.g. a
      // Meta test number). The UI shows the "Not registered" banner
      // rather than claiming the number is fully live.
      registration_skipped: registrationSkipped,
      phone_info: phoneInfo,
      ...(autoGeneratedVerifyToken ? { generated_verify_token: autoGeneratedVerifyToken } : {}),
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

/**
 * DELETE /api/whatsapp/config
 *
 * Removes the authenticated user's WhatsApp configuration row.
 * Used by the "Reset Configuration" button to recover from a corrupted
 * encrypted token (mismatched ENCRYPTION_KEY across environments).
 */
export async function DELETE() {
  try {
    const ctx = await requireRole('admin')

    console.log('[whatsapp/config DELETE] accountId:', ctx.accountId)

    // Fetch existing config before deleting (need phone_number_id for email)
    const { data: existing } = await ctx.supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', ctx.accountId)
      .single()

    const { error: deleteError } = await ctx.supabase
      .from('whatsapp_config')
      .delete()
      .eq('account_id', ctx.accountId)

    if (deleteError) {
      console.error('[whatsapp/config DELETE] Error deleting whatsapp_config:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete configuration' },
        { status: 500 }
      )
    }

    // ── Fire-and-forget: send reset confirmation email ──────────
    createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ).auth.admin.getUserById(ctx.userId)
      .then(({ data: { user } }) => {
        if (!user?.email) {
          console.log('[whatsapp/config DELETE] No email for user, skipping notification')
          return
        }
        return sendWhatsappResetEmail(user.email, {
          name: 'there',
          phoneNumberId: existing?.phone_number_id || undefined,
        })
      })
      .then((result) => {
        if (result?.success) console.log('[whatsapp/config DELETE] Reset confirmation email sent')
      })
      .catch((err) => console.error('[whatsapp/config DELETE] Reset confirmation email failed:', err))

    return NextResponse.json({ success: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
