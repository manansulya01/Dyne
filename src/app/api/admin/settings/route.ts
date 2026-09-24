import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/mongo/client";
import { ensureIndexes, col } from "@/lib/mongo/collections";
import { toHttpError } from "@/lib/auth/session";
import { requireAdminUser } from "../stats/route";
import { requirePermission } from "@/lib/permissions";

const settingSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

async function requireAdminWithPerm(db: unknown, permission: string) {
  const admin = await requireAdminUser(db as never);
  requirePermission(admin.role, permission as never);
  return admin;
}

export async function GET(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "settings.manage");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const rows = await col(db, "settings").find({}).sort({ key: 1 }).toArray();
  return NextResponse.json({ settings: rows });
}

export async function PATCH(request: Request) {
  const db = await getDb();
  await ensureIndexes(db);

  try {
    await requireAdminWithPerm(db, "settings.manage");
  } catch (err) {
    const { status, message } = toHttpError(err);
    return NextResponse.json({ error: message }, { status });
  }

  const body = await request.json().catch(() => null);
  const validated = settingSchema.safeParse(body);
  if (!validated.success) {
    return NextResponse.json({ error: validated.error.flatten().fieldErrors }, { status: 400 });
  }

  const { key, value } = validated.data;
  await col(db, "settings").updateOne(
    { key } as never,
    { $set: { key, value, updatedAt: new Date() } },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}