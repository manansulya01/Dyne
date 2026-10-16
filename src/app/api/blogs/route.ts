import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { blogCreateSchema } from "@/lib/validation";
import { createBlog, listBlogs } from "@/lib/db/content";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { withAnyPermission } from "@/lib/security/authorize";

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  // Published lists are public (logged-out compatible); drafts need a session.
  const { searchParams } = new URL(request.url);
  const includeDrafts = searchParams.get("drafts") === "true";
  if (includeDrafts) {
    try {
      await requireSessionUser(db);
    } catch (err) {
      const { status, message } = toHttpError(err);
      return NextResponse.json({ error: message }, { status });
    }
  }
  const blogs = await listBlogs(db, {
    category: searchParams.get("category") ?? undefined,
    featuredOnly: searchParams.get("featured") === "true",
    includeDrafts,
    limit: parseLimitParam(searchParams.get("limit"), 20, 50),
  });
  return NextResponse.json({ blogs });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  // Publishing blogs is a staff/teacher/admin capability, enforced centrally.
  const auth = await withAnyPermission(["blogs.create"]);
  if (!auth.ok) return auth.response;
  const { user } = auth.ctx;

  const body = await request.json().catch(() => null);
  const validated = blogCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await createBlog(db, user.id, validated.data);
  if (!created.ok) return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  return NextResponse.json(
    { blog: { id: created.blogId.toHexString() }, moderationStatus: created.moderationStatus },
    { status: 201 }
  );
}
