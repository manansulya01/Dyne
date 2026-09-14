import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { reportCreateSchema } from "@/lib/validation";

async function getModeratorRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role:roles!inner(name)")
    .eq("user_id", userId)
    .in("roles.name", ["admin", "teacher", "staff"]);
  return (data?.length ?? 0) > 0;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = reportCreateSchema.safeParse({
    targetType: body.targetType,
    targetId: body.targetId,
    reason: body.reason,
    description: body.description,
  });

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    target_type: validated.data.targetType,
    target_id: validated.data.targetId,
    reason: validated.data.reason,
    description: validated.data.description ?? null,
    status: "pending",
  });

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
  const status = searchParams.get("status");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  const isModerator = await getModeratorRole(supabase, user.id);

  let query = supabase
    .from("reports")
    .select(`
      *,
      reporter:profiles!reports_reporter_id_fkey(id, username, display_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Ordinary users see only their own reports; moderators see everything.
  if (!isModerator) {
    query = query.eq("reporter_id", user.id);
  }
  if (status) query = query.eq("status", status);
  if (cursor) query = query.lt("created_at", cursor);

  const { data: reports, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ reports: reports ?? [], isModerator });
}
