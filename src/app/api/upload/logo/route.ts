import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large. Max 2MB.' }, { status: 400 });
  }

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type. PNG, JPG, or WebP only.' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${user.id}/${Date.now()}.${ext}`;

  const { data, error } = await supabase.storage
    .from('workspaces')
    .upload(fileName, file, {
      contentType: file.type,
      upsert: true,
    });

  if (error) {
    console.error('[upload] logo error:', error);
    return NextResponse.json({ error: 'Failed to upload logo' }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage
    .from('workspaces')
    .getPublicUrl(data.path);

  return NextResponse.json({ url: publicUrl, path: data.path });
}
