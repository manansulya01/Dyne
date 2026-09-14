import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", userId)
    .eq("roles.name", "admin");
  return (data?.length ?? 0) > 0;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await requireAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [users, posts, reports, events, communities, videos] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("posts").select("*", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("reports").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("communities").select("*", { count: "exact", head: true }),
    supabase.from("videos").select("*", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    stats: {
      users: users.count ?? 0,
      posts: posts.count ?? 0,
      pendingReports: reports.count ?? 0,
      events: events.count ?? 0,
      communities: communities.count ?? 0,
      videos: videos.count ?? 0,
    },
  });
}
