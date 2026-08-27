import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('viewer');

    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('account_id', accountId)
      .order('priority', { ascending: true });

    if (error) {
      console.error('[GET /api/departments] error:', error);
      return NextResponse.json({ error: 'Failed to load departments' }, { status: 500 });
    }

    return NextResponse.json({ departments: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const body = await request.json();

    const { name, description, color, priority, auto_assign_enabled } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Department name is required' }, { status: 400 });
    }

    if (name.length > 50) {
      return NextResponse.json({ error: 'Name must be 50 characters or fewer' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('departments')
      .insert({
        account_id: accountId,
        name: name.trim(),
        description: description || null,
        color: color || '#6366f1',
        priority: priority ?? 0,
        auto_assign_enabled: auto_assign_enabled ?? true,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/departments] error:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A department with this name already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create department' }, { status: 500 });
    }

    return NextResponse.json({ department: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
