import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

// POST /api/team/conversations — create a team conversation
export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json().catch(() => null);

    const name = body?.name?.trim() || null;
    const participantIds: string[] = body?.participant_ids;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
      return NextResponse.json(
        { error: 'participant_ids is required and must be a non-empty array' },
        { status: 400 },
      );
    }

    // Deduplicate and ensure the caller is included
    const uniqueIds = Array.from(new Set([ctx.userId, ...participantIds]));

    // Verify all participants are members of this account
    const { data: members, error: membersErr } = await ctx.serviceClient
      .from('account_memberships')
      .select('user_id')
      .eq('account_id', ctx.accountId)
      .in('user_id', uniqueIds);

    if (membersErr) {
      console.error('[team/conversations] membership check error:', membersErr);
      return NextResponse.json({ error: 'Failed to verify participants' }, { status: 500 });
    }

    const memberSet = new Set((members ?? []).map((m: { user_id: string }) => m.user_id));
    const validIds = uniqueIds.filter((id) => memberSet.has(id));

    if (validIds.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 account members are required' },
        { status: 400 },
      );
    }

    // Create the conversation (contact_id is NULL for team conversations)
    const { data: conv, error: convErr } = await ctx.serviceClient
      .from('conversations')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        type: 'team',
        team_name: name,
        contact_id: null,
      })
      .select()
      .single();

    if (convErr) {
      console.error('[team/conversations] create error:', convErr);
      return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 });
    }

    // Add participants
    const participants = validIds.map((uid) => ({
      conversation_id: conv.id,
      user_id: uid,
    }));

    const { error: partErr } = await ctx.serviceClient
      .from('team_conversation_participants')
      .insert(participants);

    if (partErr) {
      console.error('[team/conversations] participants insert error:', partErr);
      // Clean up the conversation if participants fail
      await ctx.serviceClient.from('conversations').delete().eq('id', conv.id);
      return NextResponse.json({ error: 'Failed to add participants' }, { status: 500 });
    }

    return NextResponse.json({
      conversation: {
        ...conv,
        team_participant_ids: validIds,
      },
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

// GET /api/team/conversations — list team conversations for the current account
export async function GET() {
  try {
    const ctx = await requireRole('viewer');

    // Admin/owner see all team conversations, others see only ones they participate in
    const isAdmin = ['owner', 'admin'].includes(ctx.role);

    let query = ctx.serviceClient
      .from('conversations')
      .select(`
        *,
        team_conversation_participants(user_id)
      `)
      .eq('account_id', ctx.accountId)
      .eq('type', 'team')
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (!isAdmin) {
      // Non-admins: only conversations where they are a participant
      const { data: participantConvIds, error: partErr } = await ctx.serviceClient
        .from('team_conversation_participants')
        .select('conversation_id')
        .eq('user_id', ctx.userId);

      if (partErr) {
        console.error('[team/conversations] participant lookup error:', partErr);
        return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
      }

      const convIds = (participantConvIds ?? []).map((p: { conversation_id: string }) => p.conversation_id);
      if (convIds.length === 0) {
        return NextResponse.json({ conversations: [] });
      }

      query = query.in('id', convIds);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[team/conversations] list error:', error);
      return NextResponse.json({ error: 'Failed to load conversations' }, { status: 500 });
    }

    // Normalize participants
    const conversations = (data ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      team_participant_ids: Array.isArray(c.team_conversation_participants)
        ? (c.team_conversation_participants as { user_id: string }[]).map((p) => p.user_id)
        : [],
      team_conversation_participants: undefined,
    }));

    return NextResponse.json({ conversations });
  } catch (err) {
    return toErrorResponse(err);
  }
}
