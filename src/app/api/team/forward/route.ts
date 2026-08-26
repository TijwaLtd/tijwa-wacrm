import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { requireActiveSubscription } from '@/lib/subscription/check';

// POST /api/team/forward — forward a WhatsApp message to a team conversation
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    await requireActiveSubscription(ctx.serviceClient, ctx.accountId);
    const body = await request.json().catch(() => null);

    const sourceMessageId = body?.source_message_id;
    const targetConversationId = body?.target_conversation_id;

    if (!sourceMessageId || !targetConversationId) {
      return NextResponse.json(
        { error: 'source_message_id and target_conversation_id are required' },
        { status: 400 },
      );
    }

    // 1. Load the source message (must be in the user's account)
    const { data: sourceMsg, error: srcErr } = await ctx.serviceClient
      .from('messages')
      .select('*, conversation:conversations(account_id, type)')
      .eq('id', sourceMessageId)
      .maybeSingle();

    if (srcErr || !sourceMsg) {
      return NextResponse.json(
        { error: 'Source message not found' },
        { status: 404 },
      );
    }

    const srcConv = sourceMsg.conversation as { account_id: string; type: string } | null;
    if (!srcConv || srcConv.account_id !== ctx.accountId) {
      return NextResponse.json(
        { error: 'Source message not found' },
        { status: 404 },
      );
    }

    // 2. Verify target is a team conversation the user has access to
    const { data: targetConv, error: tgtErr } = await ctx.serviceClient
      .from('conversations')
      .select('id, type, account_id')
      .eq('id', targetConversationId)
      .eq('account_id', ctx.accountId)
      .eq('type', 'team')
      .maybeSingle();

    if (tgtErr || !targetConv) {
      return NextResponse.json(
        { error: 'Target team conversation not found' },
        { status: 404 },
      );
    }

    // Verify participation (or admin/owner)
    const isAdmin = ['owner', 'admin'].includes(ctx.role);
    if (!isAdmin) {
      const { data: participation } = await ctx.serviceClient
        .from('team_conversation_participants')
        .select('id')
        .eq('conversation_id', targetConversationId)
        .eq('user_id', ctx.userId)
        .maybeSingle();

      if (!participation) {
        return NextResponse.json(
          { error: 'You are not a participant in the target conversation' },
          { status: 403 },
        );
      }
    }

    // 3. Build forwarded message content
    const forwardedText = sourceMsg.content_text
      ? `[Forwarded]\n\n${sourceMsg.content_text}`
      : `[Forwarded ${sourceMsg.content_type} message]`;

    // 4. Insert the forwarded message
    const { data: newMsg, error: insertErr } = await ctx.serviceClient
      .from('messages')
      .insert({
        conversation_id: targetConversationId,
        sender_type: 'agent',
        sender_id: ctx.userId,
        content_type: sourceMsg.content_type === 'text' ? 'text' : sourceMsg.content_type,
        content_text: forwardedText,
        media_url: sourceMsg.media_url,
        status: 'sent',
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[team/forward] insert error:', insertErr);
      return NextResponse.json({ error: 'Failed to forward message' }, { status: 500 });
    }

    // 5. Update conversation metadata
    await ctx.serviceClient
      .from('conversations')
      .update({
        last_message_text: forwardedText.slice(0, 200),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', targetConversationId);

    return NextResponse.json({ message: newMsg });
  } catch (err) {
    return toErrorResponse(err);
  }
}
