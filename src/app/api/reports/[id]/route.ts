import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const reviewSchema = z.object({
  status: z.enum(["reviewing", "resolved", "dismissed"]),
  action: z.enum(["warning", "content_removal", "temp_ban", "perm_ban", "dismiss"]).optional(),
  reason: z.string().max(500).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", user.id)
    .in("roles.name", ["admin", "teacher", "staff"]);

  if (!roles || roles.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const validated = reviewSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { data: report } = await supabase
    .from("reports")
    .select("*")
    .eq("id", id)
    .single();

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("reports")
    .update({
      status: validated.data.status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optional moderation action log + content removal for posts/comments.
  if (validated.data.action && validated.data.action !== "dismiss") {
    await supabase.from("moderation_actions").insert({
      moderator_id: user.id,
      target_type: report.target_type,
      target_id: report.target_id,
      action: validated.data.action,
      reason: validated.data.reason ?? null,
    });

    if (validated.data.action === "content_removal") {
      if (report.target_type === "post") {
        await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", report.target_id);
      } else if (report.target_type === "comment") {
        await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", report.target_id);
      } else if (report.target_type === "video") {
        await supabase.from("videos").delete().eq("id", report.target_id);
      }
    }

    // Notify the reporter about the outcome.
    await supabase.from("notifications").insert({
      recipient_id: report.reporter_id,
      actor_id: user.id,
      type: "moderation_action",
      title: "Report reviewed",
      message: `Your report was ${validated.data.status}`,
      data: { report_id: id },
    });
  }

  return NextResponse.json({ success: true });
}
