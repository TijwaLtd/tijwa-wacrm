import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/account';

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('department_id');

    let query = supabase
      .from('account_schedules')
      .select('*')
      .eq('account_id', accountId)
      .order('day_of_week');

    if (departmentId) {
      query = query.eq('department_id', departmentId);
    } else {
      // Get org-wide schedules (department_id IS NULL)
      query = query.is('department_id', null);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[GET /api/schedules] error:', error);
      return NextResponse.json({ error: 'Failed to load schedules' }, { status: 500 });
    }

    return NextResponse.json({ schedules: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { serviceClient, accountId } = await requireRole('admin');
    const body = await request.json();
    const { schedules, department_id } = body;

    if (!Array.isArray(schedules)) {
      return NextResponse.json({ error: 'schedules array is required' }, { status: 400 });
    }

    // Validate each schedule entry
    for (const s of schedules) {
      if (s.day_of_week < 0 || s.day_of_week > 6) {
        return NextResponse.json({ error: 'day_of_week must be 0-6' }, { status: 400 });
      }
      if (!s.start_time || !s.end_time) {
        return NextResponse.json({ error: 'start_time and end_time are required' }, { status: 400 });
      }
    }

    // Delete existing schedules for this department (or org-wide)
    let deleteQuery = serviceClient
      .from('account_schedules')
      .delete()
      .eq('account_id', accountId);

    if (department_id) {
      deleteQuery = deleteQuery.eq('department_id', department_id);
    } else {
      deleteQuery = deleteQuery.is('department_id', null);
    }

    await deleteQuery;

    // Insert new schedules
    const insertData = schedules.map((s: {
      day_of_week: number;
      start_time: string;
      end_time: string;
      timezone?: string;
      is_active?: boolean;
    }) => ({
      account_id: accountId,
      department_id: department_id || null,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      timezone: s.timezone || 'Africa/Nairobi',
      is_active: s.is_active ?? true,
    }));

    const { data, error } = await serviceClient
      .from('account_schedules')
      .insert(insertData)
      .select();

    if (error) {
      console.error('[PUT /api/schedules] error:', error);
      return NextResponse.json({ error: 'Failed to save schedules' }, { status: 500 });
    }

    return NextResponse.json({ schedules: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return NextResponse.json({ error: message }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
