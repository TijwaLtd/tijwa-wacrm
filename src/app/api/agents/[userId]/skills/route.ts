import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { userId } = await params;

    const { data, error } = await supabase
      .from('agent_skills')
      .select('*')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .order('skill');

    if (error) {
      console.error('[GET /api/agents/[userId]/skills] error:', error);
      return NextResponse.json({ error: 'Failed to load skills' }, { status: 500 });
    }

    return NextResponse.json({ skills: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const { userId } = await params;
    const body = await request.json();

    const { skill, level } = body;

    if (!skill || typeof skill !== 'string' || skill.trim().length === 0) {
      return NextResponse.json({ error: 'Skill name is required' }, { status: 400 });
    }

    if (skill.length > 50) {
      return NextResponse.json({ error: 'Skill name must be 50 characters or fewer' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('agent_skills')
      .upsert({
        user_id: userId,
        account_id: accountId,
        skill: skill.trim().toLowerCase(),
        level: level ?? 3,
      }, { onConflict: 'user_id,account_id,skill' })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/agents/[userId]/skills] error:', error);
      return NextResponse.json({ error: 'Failed to add skill' }, { status: 500 });
    }

    return NextResponse.json({ skill: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const { userId } = await params;
    const { searchParams } = new URL(request.url);
    const skillId = searchParams.get('skill_id');

    if (!skillId) {
      return NextResponse.json({ error: 'skill_id query param is required' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('agent_skills')
      .delete()
      .eq('id', skillId)
      .eq('user_id', userId)
      .eq('account_id', accountId);

    if (error) {
      console.error('[DELETE /api/agents/[userId]/skills] error:', error);
      return NextResponse.json({ error: 'Failed to remove skill' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
