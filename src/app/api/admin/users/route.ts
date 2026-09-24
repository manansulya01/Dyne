import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col, type UserDoc } from "@/lib/mongo/collections";
import { objectIdSchema } from "@/lib/mongo/ids";
import { setUserRole, suspendUser, unsuspendUser } from "@/lib/db/users";
import { toProfileJSON } from "@/lib/db/contracts";
import { toHttpError } from "@/lib/auth/session";
import { parseLimitParam } from "@/lib/utils";
import { requireAdminUser } from "../stats/route";
import { requirePermission } from "@/lib/permissions";

const roleUpdateSchema = z.object({
  userId: objectIdSchema,
  role: z.enum(["student", "teacher", "staff", "club", "admin"]),
});

const suspendSchema = z.object({
  userId: objectIdSchema,
  until: z.string().datetime(),
});

const unsuspendSchema = z.object({
  userId: objectIdSchema,
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
    await requireAdminWithPerm(db, "users.view");
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
    filter.$or = [{ username: rx }, { displayName: rx }];
  }
  if (cursor) {
    const parsed = new Date(cursor);
    if (!isNaN(+parsed)) filter.createdAt = { $lt: parsed };
  }

  const rows = await col<UserDoc>(db, "users")
    .find(filter as never)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return NextResponse.json({
    users: rows.map((u) => toProfileJSON(u as unknown as Record<string, unknown>)),
  });
}

// Assign a role — admin only, server-side. Never trust client-supplied admin flags elsewhere.
export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  let admin;
  try {
    admin = await requireAdminWithPerm(db, "users.manage");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = roleUpdateSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  // Admins cannot demote themselves (prevents accidental last-admin lockout).
  if (validated.data.userId === admin.id && validated.data.role !== "admin") {
    return NextResponse.json(
      { error: "Admins cannot remove their own admin role" },
      { status: 400 }
    );
  }

  const updated = await setUserRole(db, validated.data.userId, validated.data.role);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "users.suspend");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = suspendSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const until = new Date(validated.data.until);
  if (isNaN(until.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const updated = await suspendUser(db, validated.data.userId, until);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "users.restore");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = unsuspendSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const updated = await unsuspendUser(db, validated.data.userId);
  if (!updated) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
