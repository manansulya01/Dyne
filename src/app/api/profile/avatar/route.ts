import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const avatarSchema = z.object({
  avatarUrl: z.string().url().max(2000),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const validated = avatarSchema.safeParse(body);

  if (!validated.success) {
    return NextResponse.json({ error: "Invalid avatar URL" }, { status: 400 });
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .update({ avatar_url: validated.data.avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ profile });
}
