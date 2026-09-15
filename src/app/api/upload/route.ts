import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_BUCKETS = [
  "avatars",
  "post-media",
  "community-images",
  "event-images",
  "message-attachments",
  "video-thumbnails",
  "watch-videos",
] as const;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File;
  const rawBucket = (formData.get("bucket") as string) || "post-media";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!(ALLOWED_BUCKETS as readonly string[]).includes(rawBucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  const bucket = rawBucket;

  const sizeLimit = bucket === "avatars" ? MAX_AVATAR_SIZE : MAX_FILE_SIZE;
  if (file.size > sizeLimit) {
    return NextResponse.json({ error: `File too large. Max ${sizeLimit / 1024 / 1024}MB.` }, { status: 400 });
  }

  const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
  const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return NextResponse.json({ error: "Invalid file type. Only images and videos allowed." }, { status: 400 });
  }

  const fileExt = file.name.split(".").pop()?.toLowerCase() || "";
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `${user.id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  const mediaType = isImage ? "image" : "video";

  const { data: mediaRecord, error: dbError } = await supabase
    .from("post_media")
    .insert({
      post_id: null,
      media_type: mediaType,
      url: publicUrl,
      thumbnail_url: isVideo ? publicUrl : null,
      order_index: 0,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (dbError) {
    await supabase.storage.from(bucket).remove([filePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ media: mediaRecord });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mediaId = searchParams.get("mediaId");
  const bucket = searchParams.get("bucket") || "post-media";

  if (!mediaId) {
    return NextResponse.json({ error: "No media ID provided" }, { status: 400 });
  }

  const { data: media, error: fetchError } = await supabase
    .from("post_media")
    .select("*")
    .eq("id", mediaId)
    .single();

  if (fetchError || !media) {
    return NextResponse.json({ error: "Media not found" }, { status: 404 });
  }

  if (media.post_id) {
    const { data: post } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", media.post_id)
      .single();

    if (post?.author_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // Staged (unattached) media may only be deleted by the user who uploaded
    // it. Legacy rows without an uploader cannot be attributed and are kept.
    if (media.uploaded_by !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const filePath = media.url.split(`/${bucket}/`)[1];
  if (filePath) {
    await supabase.storage.from(bucket).remove([filePath]);
  }

  const { error: deleteError } = await supabase
    .from("post_media")
    .delete()
    .eq("id", mediaId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}