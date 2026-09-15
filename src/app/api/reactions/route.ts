import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const reactionBodySchema = z.object({
  targetType: z.enum(["post", "comment", "video"]),
  targetId: z.string().uuid(),
  reactionType: z.string().min(1).max(30).default("like"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = reactionBodySchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { targetType, targetId, reactionType } = validated.data;

  const { data: existing } = await supabase
    .from("reactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("reaction_type", reactionType)
    .single();

  if (existing) {
    return NextResponse.json({ error: "Already reacted" }, { status: 400 });
  }

  const { error } = await supabase
    .from("reactions")
    .insert({
      user_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reaction_type: reactionType,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (targetType === "post") {
    const { data: post } = await supabase
      .from("posts")
      .select("author_id")
      .eq("id", targetId)
      .single();

    if (post && post.author_id !== user.id) {
      await supabase
        .from("notifications")
        .insert({
          recipient_id: post.author_id,
          actor_id: user.id,
          type: "like",
          title: "New like",
          message: "liked your post",
          data: { post_id: targetId },
        });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");
  const reactionType = searchParams.get("reactionType") || "like";

  if (!targetType || !targetId) {
    return NextResponse.json({ error: "Target type and ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("reactions")
    .delete()
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("reaction_type", reactionType);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetType = searchParams.get("targetType");
  const targetId = searchParams.get("targetId");

  if (!targetType || !targetId) {
    return NextResponse.json({ error: "Target type and ID required" }, { status: 400 });
  }

  const { data: reactions, error } = await supabase
    .from("reactions")
    .select("*, user:profiles!reactions_user_id_fkey(id, username, display_name, avatar_url)")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: userReaction } = await supabase
    .from("reactions")
    .select("reaction_type")
    .eq("user_id", user.id)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .single();

  const counts = reactions?.reduce((acc, r) => {
    acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return NextResponse.json({
    reactions,
    counts,
    userReaction: userReaction?.reaction_type || null,
  });
}