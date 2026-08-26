import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

// POST /api/team/messages — send a message to a team conversation
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json().catch(() => null);

    const conversationId = body?.conversation_id;
    const contentText = body?.content_text?.trim();

    if (!conversationId || !contentText) {
      return NextResponse.json(
        { error: 'conversation_id and content_text are required' },
        { status: 400 },
      );
    }

    // Verify this is a team conversation in the user's account
    const { data: conv, error: convErr } = await ctx.serviceClient
      .from('conversations')
      .select('id, type, account_id')
      .eq('id', conversationId)
      .eq('account_id', ctx.accountId)
      .eq('type', 'team')
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json(
        { error: 'Team conversation not found' },
        { status: 404 },
      );
    }

    // Verify the user is a participant (or admin/owner)
    const isAdmin = ['owner', 'admin'].includes(ctx.role);
    if (!isAdmin) {
      const { data: participation } = await ctx.serviceClient
        .from('team_conversation_participants')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', ctx.userId)
        .maybeSingle();

      if (!participation) {
        return NextResponse.json(
          { error: 'You are not a participant in this conversation' },
          { status: 403 },
        );
      }
    }

    // Insert the message
    const { data: msg, error: msgErr } = await ctx.serviceClient
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_type: 'agent',
        sender_id: ctx.userId,
        content_type: 'text',
        content_text: contentText,
        status: 'sent',
      })
      .select()
      .single();

    if (msgErr) {
      console.error('[team/messages] insert error:', msgErr);
      return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
    }

    // Update conversation metadata
    await ctx.serviceClient
      .from('conversations')
      .update({
        last_message_text: contentText.slice(0, 200),
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    return NextResponse.json({ message: msg });
  } catch (err) {
    return toErrorResponse(err);
  }
}

// GET /api/team/messages?conversation_id=... — get messages for a team conversation
export async function GET(request: Request) {
  try {
    const ctx = await requireRole('viewer');
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversation_id');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversation_id query parameter is required' },
        { status: 400 },
      );
    }

    // Verify access
    const { data: conv, error: convErr } = await ctx.serviceClient
      .from('conversations')
      .select('id, type, account_id')
      .eq('id', conversationId)
      .eq('account_id', ctx.accountId)
      .eq('type', 'team')
      .maybeSingle();

    if (convErr || !conv) {
      return NextResponse.json(
        { error: 'Team conversation not found' },
        { status: 404 },
      );
    }

    // Verify participation (or admin/owner)
    const isAdmin = ['owner', 'admin'].includes(ctx.role);
    if (!isAdmin) {
      const { data: participation } = await ctx.serviceClient
        .from('team_conversation_participants')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('user_id', ctx.userId)
        .maybeSingle();

      if (!participation) {
        return NextResponse.json(
          { error: 'You are not a participant in this conversation' },
          { status: 403 },
        );
      }
    }

    // Fetch messages
    const { data: messages, error: msgErr } = await ctx.serviceClient
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (msgErr) {
      console.error('[team/messages] fetch error:', msgErr);
      return NextResponse.json({ error: 'Failed to load messages' }, { status: 500 });
    }

    return NextResponse.json({ messages: messages ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}
