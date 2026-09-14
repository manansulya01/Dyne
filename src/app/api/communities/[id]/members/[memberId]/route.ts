import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, memberId } = await params;
  const body = await request.json();
  const { role } = body;

  if (!["member", "moderator"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Check if requester is owner or moderator
  const { data: requesterMembership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", id)
    .eq("user_id", user.id)
    .single();

  const { data: community } = await supabase
    .from("communities")
    .select("owner_id")
    .eq("id", id)
    .single();

  const isOwner = community?.owner_id === user.id;
  const isModerator = requesterMembership?.role === "moderator";

  if (!isOwner && !isModerator) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cannot change owner's role
  if (memberId === community?.owner_id) {
    return NextResponse.json({ error: "Cannot change owner's role" }, { status: 403 });
  }

  // Moderators can only change member roles, not other moderators
  if (!isOwner && role === "moderator") {
    return NextResponse.json({ error: "Only owners can assign moderator role" }, { status: 403 });
  }

  // Cannot demote moderators unless owner
  const { data: targetMembership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", id)
    .eq("user_id", memberId)
    .single();

  if (!isOwner && targetMembership?.role === "moderator") {
    return NextResponse.json({ error: "Only owners can demote moderators" }, { status: 403 });
  }

  const { error } = await supabase
    .from("community_members")
    .update({ role })
    .eq("community_id", id)
    .eq("user_id", memberId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}