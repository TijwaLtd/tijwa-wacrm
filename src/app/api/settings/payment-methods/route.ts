import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('account_id');

  if (!accountId) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('tenant_settings')
    .select('payment_methods')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payment_methods: data?.payment_methods || [] });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { account_id, payment_methods } = body;

  if (!account_id) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }

  const { error } = await supabase
    .from('tenant_settings')
    .upsert({
      account_id,
      payment_methods: payment_methods || [],
    }, { onConflict: 'account_id' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
