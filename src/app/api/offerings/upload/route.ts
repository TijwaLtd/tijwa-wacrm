// ============================================================
// /api/offerings/upload - Upload offering image
//
// POST /api/offerings/upload - Upload image for an offering
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];

// POST /api/offerings/upload - Upload offering image
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const accountId = formData.get("account_id") as string | null;
  const offeringId = formData.get("offering_id") as string | null;
  const altText = formData.get("alt_text") as string | null;

  if (!file || !accountId) {
    return NextResponse.json({ error: "file and account_id are required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File must be less than 5MB" }, { status: 400 });
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "File must be PNG, JPEG, or WebP" }, { status: 400 });
  }

  // Verify membership
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: membership } = await serviceClient
    .from("account_memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("account_id", accountId)
    .single();

  if (!membership || !["owner", "admin", "agent"].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Upload to storage
  const timestamp = Date.now();
  const path = offeringId
    ? `${accountId}/${offeringId}/${timestamp}-${file.name}`
    : `${accountId}/${timestamp}-${file.name}`;

  const { error: uploadError } = await supabase.storage
    .from("offerings")
    .upload(path, file, { contentType: file.type });

  if (uploadError) {
    console.error("[offerings] upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from("offerings")
    .getPublicUrl(path);

  const publicUrl = urlData?.publicUrl;

  // If offering_id provided, create media record
  let media = null;
  if (offeringId && publicUrl) {
    // Determine sort_order and is_primary
    const { count } = await serviceClient
      .from("offering_media")
      .select("id", { count: "exact", head: true })
      .eq("offering_id", offeringId);

    const sortOrder = count || 0;
    const isPrimary = sortOrder === 0; // First image is primary

    const { data: mediaRecord, error: mediaError } = await serviceClient
      .from("offering_media")
      .insert({
        offering_id: offeringId,
        account_id: accountId,
        url: publicUrl,
        alt_text: altText || file.name.replace(/\.[^/.]+$/, ""),
        sort_order: sortOrder,
        is_primary: isPrimary,
      })
      .select()
      .single();

    if (mediaError) {
      console.error("[offerings] media insert error:", mediaError);
    } else {
      media = mediaRecord;
    }
  }

  return NextResponse.json({
    url: publicUrl,
    path,
    media,
  });
}
