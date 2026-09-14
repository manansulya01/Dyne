import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("campus_buildings")
    .select("*")
    .order("name", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.gt("name", cursor);
  }

  if (search) {
    const safe = search.replace(/[%_\\]/g, (m) => `\\${m}`);
    query = query.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const { data: buildings, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    buildings: buildings || [],
    cursor: buildings?.[buildings.length - 1]?.name || null,
    hasMore: buildings?.length === limit,
  });
}