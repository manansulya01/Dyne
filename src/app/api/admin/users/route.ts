import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "../stats/route";

const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["student", "teacher", "staff", "club", "admin"]),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    const safe = search.replace(/[%_\\]/g, (m) => `\\${m}`);
    query = query.or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`);
  }
  if (cursor) query = query.lt("created_at", cursor);

  const { data: users, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: users ?? [] });
}

// Assign a role — admin only, server-side. Never trust client-supplied admin flags elsewhere.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await requireAdmin(supabase, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const validated = roleUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("name", validated.data.role)
    .single();

  if (!role) {
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  }

  // Update denormalized profiles.role + canonical user_roles mapping.
  await supabase.from("profiles").update({ role: validated.data.role }).eq("id", validated.data.userId);
  const { error } = await supabase.from("user_roles").insert({
    user_id: validated.data.userId,
    role_id: role.id,
  });

  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
