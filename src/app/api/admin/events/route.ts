import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { requireAdminUser } from "../stats/route";
import { requirePermission } from "@/lib/permissions";

const eventActionSchema = z.object({
  eventId: objectIdSchema,
  action: z.enum(["remove", "restore", "edit"]),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  isPublic: z.boolean().optional(),
  maxAttendees: z.number().int().positive().optional(),
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
    await requireAdminWithPerm(db, "events.edit");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") || "").trim().slice(0, 100);
  const cursor = searchParams.get("cursor");
  const limit = parseLimitParam(searchParams.get("limit"), 20, 50);

  const filter: Record<string, unknown> = {};
  if (search) {
    const rx = { $regex: escapeRegExp(search), $options: "i" };
    filter.$or = [{ title: rx }, { description: rx }];
  }
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col(db, "events")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({ events: rows });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "events.edit");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = eventActionSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { eventId, action, ...updates } = validated.data;

  if (action === "edit") {
    const updateDoc: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.title !== undefined) updateDoc.title = updates.title;
    if (updates.description !== undefined) updateDoc.description = updates.description;
    if (updates.startTime !== undefined) updateDoc.startTime = new Date(updates.startTime);
    if (updates.endTime !== undefined) updateDoc.endTime = new Date(updates.endTime);
    if (updates.isPublic !== undefined) updateDoc.isPublic = updates.isPublic;
    if (updates.maxAttendees !== undefined) updateDoc.maxAttendees = updates.maxAttendees;

    const res = await col(db, "events").updateOne({ _id: eventId } as never, { $set: updateDoc });
    if (res.matchedCount === 0) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  // For remove/restore we'd need a deletedAt field on events
  // Events don't currently have soft delete - this would need schema change
  return NextResponse.json({ error: "Not implemented" }, { status: 501 });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "events.delete");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = eventActionSchema.pick({ eventId: true }).safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { eventId } = validated.data;
  const res = await col(db, "events").deleteOne({ _id: eventId } as never);
  if (res.deletedCount === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Also delete attendees
  await col(db, "eventAttendees").deleteMany({ eventId } as never);

  return NextResponse.json({ success: true });
}