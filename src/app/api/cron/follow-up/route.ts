// ============================================================
// POST /api/cron/follow-up
//
// Cron endpoint to send follow-up messages to customers waiting
// for reply. Can be called by:
//   - pg_cron (via pg_net)
//   - External cron service (cronjob.co, cronitor, etc.)
//   - Manual trigger from admin
//
// Protected by CRON_SECRET to prevent unauthorized calls.
// ============================================================

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  try {
    // Get all accounts with follow-ups enabled
    const { data: accounts } = await db
      .from('tenant_settings')
      .select('account_id, follow_up_timeout_minutes')
      .eq('follow_up_enabled', true)

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: 'No accounts with follow-ups enabled', processed: 0 })
    }

    let totalSent = 0

    for (const account of accounts) {
      const timeoutMinutes = account.follow_up_timeout_minutes || 10
      const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000).toISOString()

      // Find conversations needing follow-up (ONE-TIME ONLY, never repeat)
      const { data: conversations } = await db
        .from('conversations')
        .select('id, contact_id, assigned_agent_id, human_replied')
        .eq('account_id', account.account_id)
        .in('status', ['open', 'pending'])
        .lt('last_message_at', cutoffTime)
        .is('last_follow_up_at', null)

      if (!conversations || conversations.length === 0) continue

      for (const conv of conversations) {
        // Skip if human has replied
        if (conv.human_replied) continue

        // Check if last message is from customer
        const { data: lastMessage } = await db
          .from('messages')
          .select('sender_type')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!lastMessage || lastMessage.sender_type !== 'customer') continue

        // Pick message based on assignment status
        const message = conv.assigned_agent_id
          ? 'Thanks for your patience! A team member is reviewing your message and will respond shortly.'
          : 'Thanks for reaching out! Our team is working on your request and will get back to you soon.'

        // Get WhatsApp config
        const { data: config } = await db
          .from('whatsapp_config')
          .select('id')
          .eq('account_id', account.account_id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle()

        if (!config) continue

        // Store follow-up message
        const { error: msgError } = await db
          .from('messages')
          .insert({
            conversation_id: conv.id,
            sender_type: 'bot',
            content_type: 'text',
            content_text: message,
            status: 'sent',
            ai_generated: false,
          })

        if (msgError) {
          console.error(`[cron/follow-up] failed to insert message for ${conv.id}:`, msgError)
          continue
        }

        // Update conversation
        await db
          .from('conversations')
          .update({
            last_message_text: message,
            last_message_at: new Date().toISOString(),
            last_follow_up_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', conv.id)

        totalSent++
      }
    }

    return NextResponse.json({
      message: 'Follow-ups processed',
      accounts: accounts.length,
      sent: totalSent,
    })
  } catch (err) {
    console.error('[cron/follow-up] error:', err)
    return NextResponse.json(
      { error: 'Failed to process follow-ups' },
      { status: 500 },
    )
  }
}

// Also support GET for health checks
export async function GET() {
  return NextResponse.json({ status: 'ok', endpoint: 'follow-up-cron' })
}
