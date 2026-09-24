import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { requireAdminUser } from "../stats/route";
import { requirePermission } from "@/lib/permissions";

const blogActionSchema = z.object({
  blogId: objectIdSchema,
  action: z.enum(["publish", "unpublish", "delete", "edit"]),
  title: z.string().min(3).max(200).optional(),
  content: z.string().min(10).max(50000).optional(),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  category: z.string().max(50).optional(),
  isFeatured: z.boolean().optional(),
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requireAdminWithPerm(db: unknown, permission: string) {
  const admin = await requireAdminUser(db as never);
  requirePermission(admin.role, permission as never);
  return admin;
}

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "blogs.edit");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim().slice(0, 100);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);
  const status = searchParams.get("status"); // published, draft, featured

  const filter: Record<string, unknown> = {};
  if (search) {
    const rx = { $regex: escapeRegExp(search), $options: "i" };
    filter.$or = [{ title: rx }, { content: rx }, { slug: rx }];
  }
  if (status === "published") filter.isPublished = true;
  else if (status === "draft") filter.isPublished = false;
  else if (status === "featured") filter.isFeatured = true;
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col(db, "blogs")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({ blogs: rows });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "blogs.edit");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = blogActionSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { blogId, action, ...updates } = validated.data;

  if (action === "edit") {
    const updateDoc: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title !== undefined) updateDoc.title = updates.title;
    if (updates.content !== undefined) updateDoc.content = updates.content;
    if (updates.coverImageUrl !== undefined) updateDoc.coverImageUrl = updates.coverImageUrl || null;
    if (updates.category !== undefined) updateDoc.category = updates.category;
    if (updates.isFeatured !== undefined) updateDoc.isFeatured = updates.isFeatured;

    const res = await col(db, "blogs").updateOne({ _id: blogId } as never, { $set: updateDoc });
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  if (action === "publish" || action === "unpublish") {
    const res = await col(db, "blogs").updateOne(
      { _id: blogId } as never,
      {
        $set: {
          isPublished: action === "publish",
          publishedAt: action === "publish" ? new Date() : null,
          updatedAt: new Date(),
        },
      }
    );
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: "Blog not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "blogs.edit");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = blogActionSchema.pick({ blogId: true }).safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { blogId } = validated.data;
  const res = await col(db, "blogs").deleteOne({ _id: blogId } as never);
  if (res.deletedCount === 0) {
    return NextResponse.json({ error: "Blog not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}