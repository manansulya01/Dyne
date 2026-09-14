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
  const category = searchParams.get("category");
  const cursor = searchParams.get("cursor");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

  let query = supabase
    .from("clubs")
    .select("*")
    .order("name", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  if (category) {
    query = query.eq("category", category);
  }

  const { data: clubs, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get unique categories for filtering
  const { data: allClubs } = await supabase
    .from("clubs")
    .select("category");

  const categories = Array.from(new Set(allClubs?.map(c => c.category).filter(Boolean) || []));

  return NextResponse.json({
    clubs: clubs || [],
    categories,
    cursor: clubs?.[clubs.length - 1]?.created_at || null,
    hasMore: clubs?.length === limit,
  });
}