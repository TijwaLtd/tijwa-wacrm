import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// GET /api/account/members/[userId]/metadata
// Get business metadata for a team member
export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get the member's account_id
  const { data: membership } = await serviceClient
    .from('account_memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Check if the requesting user is a member of the same account
  const { data: requesterMembership } = await serviceClient
    .from('account_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('account_id', membership.account_id)
    .maybeSingle();

  if (!requesterMembership) {
    return NextResponse.json({ error: 'Not a member of this account' }, { status: 403 });
  }

  // Get the business metadata
  const { data: member } = await serviceClient
    .from('account_memberships')
    .select('business_metadata')
    .eq('user_id', userId)
    .eq('account_id', membership.account_id)
    .single();

  return NextResponse.json({ business_metadata: member?.business_metadata || {} });
}

// PATCH /api/account/members/[userId]/metadata
// Update business metadata for a team member
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const { business_metadata } = body;

  if (!business_metadata || typeof business_metadata !== 'object') {
    return NextResponse.json({ error: 'business_metadata is required and must be an object' }, { status: 400 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // Get the member's account_id
  const { data: membership } = await serviceClient
    .from('account_memberships')
    .select('account_id, role')
    .eq('user_id', userId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  // Check if the requesting user is an admin or owner of the account
  const { data: requesterMembership } = await serviceClient
    .from('account_memberships')
    .select('role')
    .eq('user_id', user.id)
    .eq('account_id', membership.account_id)
    .maybeSingle();

  if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
    return NextResponse.json({ error: 'Forbidden - admin only' }, { status: 403 });
  }

  // Update the business metadata
  const { data: updated, error } = await serviceClient
    .from('account_memberships')
    .update({ business_metadata })
    .eq('user_id', userId)
    .eq('account_id', membership.account_id)
    .select('business_metadata')
    .single();

  if (error) {
    console.error('[members/metadata] update error:', error);
    return NextResponse.json({ error: 'Failed to update metadata' }, { status: 500 });
  }

  return NextResponse.json({ business_metadata: updated.business_metadata });
}
