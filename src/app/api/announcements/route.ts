import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { toObjectId } from "@/lib/mongo/ids";
import { announcementCreateSchema } from "@/lib/validation";
import { createAnnouncement, listAnnouncements } from "@/lib/db/content";
import { requireSessionUser, toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";

const CAN_POST = new Set(["admin", "teacher", "staff", "club"]);

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  try { await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  const { searchParams } = new URL(request.url);
  const items = await listAnnouncements(db, { limit: parseLimitParam(searchParams.get("limit"), 20, 50) });
  return NextResponse.json({ announcements: items });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (!CAN_POST.has(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => null);
  const validated = announcementCreateSchema.safeParse(body);
  if (!validated.success) return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  const created = await createAnnouncement(db, user.id, validated.data);
  return NextResponse.json({ id: created.announcementId.toHexString() }, { status: 201 });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);
  let user;
  try { user = await requireSessionUser(db); } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await col(db, "announcements").deleteOne({ _id: toObjectId(id) } as never);
  return NextResponse.json({ success: true });
}
