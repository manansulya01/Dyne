import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type BlogDoc } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { blogCreateSchema } from "@/lib/validation";
import { deleteBlog, getBlogBySlug, listBlogs, updateBlog } from "@/lib/db/content";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";

interface Params { params: Promise<{ slug: string }>; }
const CAN_MANAGE = new Set(["admin", "teacher", "staff", "club"]);

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user = null;
  try { user = await requireSessionUser(db); } catch { /* allow 404 shape below */ }
  const isPrivileged = !!user && CAN_MANAGE.has(user.role);
  const blog = await getBlogBySlug(db, slug, isPrivileged);
  if (!blog) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  // Related: same category, published, excluding self.
  const related = (await listBlogs(db, { category: (blog as unknown as Record<string, string | null>).category ?? undefined, limit: 4 }))
    .filter((b) => (b as Record<string, unknown>).slug !== slug).slice(0, 3);
  return NextResponse.json({ blog, related });
}

export async function PATCH(request: Request, { params }: Params) {
  const { slug } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!CAN_MANAGE.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await getBlogBySlug(db, slug, true);
  if (!existing) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const validated = blogCreateSchema.partial().safeParse(body);
  if (!validated.success) return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  await updateBlog(db, String((existing as unknown as Record<string, unknown>).id), validated.data);
  const updated = await getBlogBySlug(db, slug, true);
  return NextResponse.json({ blog: updated });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { slug } = await params;
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!CAN_MANAGE.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await getBlogBySlug(db, slug, true);
  if (!existing) return NextResponse.json({ error: "Article not found" }, { status: 404 });
  // Non-admins may only delete their own articles.
  if (user.role !== "admin") {
    const row = await col<BlogDoc>(db, "blogs").findOne({ slug } as never);
    if (row && !row.authorId.equals(toObjectId(user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  await deleteBlog(db, String((existing as unknown as Record<string, unknown>).id));
  return NextResponse.json({ success: true });
}
