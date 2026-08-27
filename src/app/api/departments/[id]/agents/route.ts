import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { id } = await params;

    const { data, error } = await supabase
      .from('agent_departments')
      .select(`
        user_id,
        skill_level,
        is_primary,
        profiles:user_id (full_name, email, avatar_url)
      `)
      .eq('account_id', accountId)
      .eq('department_id', id);

    if (error) {
      console.error('[GET /api/departments/[id]/agents] error:', error);
      return NextResponse.json({ error: 'Failed to load agents' }, { status: 500 });
    }

    return NextResponse.json({ agents: data });
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const { id } = await params;
    const body = await request.json();

    const { user_id, skill_level, is_primary } = body;

    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    // Check if user is a member of this account
    const { data: membership } = await serviceClient
      .from('account_memberships')
      .select('user_id')
      .eq('account_id', accountId)
      .eq('user_id', user_id)
      .in('role', ['owner', 'admin', 'agent'])
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: 'User is not a team member' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('agent_departments')
      .upsert({
        user_id,
        account_id: accountId,
        department_id: id,
        skill_level: skill_level ?? 3,
        is_primary: is_primary ?? false,
      }, { onConflict: 'user_id,department_id' })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/departments/[id]/agents] error:', error);
      return NextResponse.json({ error: 'Failed to add agent to department' }, { status: 500 });
    }

    return NextResponse.json({ agent_department: data }, { status: 201 });
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (!userId) {
      return NextResponse.json({ error: 'user_id query param is required' }, { status: 400 });
    }

    const { error } = await serviceClient
      .from('agent_departments')
      .delete()
      .eq('department_id', id)
      .eq('user_id', userId)
      .eq('account_id', accountId);

    if (error) {
      console.error('[DELETE /api/departments/[id]/agents] error:', error);
      return NextResponse.json({ error: 'Failed to remove agent from department' }, { status: 500 });
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
