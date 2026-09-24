import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes } from "@/lib/mongo/collections";
import { blogCreateSchema } from "@/lib/validation";
import { createBlog, listBlogs } from "@/lib/db/content";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

const CAN_PUBLISH = new Set(["admin", "teacher", "staff", "club"]);

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
  let user;
  try {
    user = await requireSessionUser(db);
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!CAN_PUBLISH.has(user.role)) {
    return NextResponse.json({ error: "Only staff, teachers, clubs, and admins can publish blogs" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const validated = blogCreateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }
  const created = await createBlog(db, user.id, validated.data);
  if (!created.ok) return NextResponse.json({ error: "Slug already taken" }, { status: 409 });
  const blogs = await listBlogs(db, { limit: 1, includeDrafts: true });
  const blog = blogs.find((b) => String((b as Record<string, unknown>).id) === created.blogId.toHexString()) ?? null;
  return NextResponse.json({ blog }, { status: 201 });
}
