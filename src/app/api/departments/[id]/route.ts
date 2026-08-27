import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.is_active !== undefined) updates.is_active = body.is_active;
    if (body.auto_assign_enabled !== undefined) updates.auto_assign_enabled = body.auto_assign_enabled;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from('departments')
      .update(updates)
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/departments/[id]] error:', error);
      return NextResponse.json({ error: 'Failed to update department' }, { status: 500 });
    }

    return NextResponse.json({ department: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const { id } = await params;

    const { error } = await serviceClient
      .from('departments')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);

    if (error) {
      console.error('[DELETE /api/departments/[id]] error:', error);
      return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 });
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
