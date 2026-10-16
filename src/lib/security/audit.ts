import type { Db } from "mongodb";
import { col, type AuditLogDoc } from "@/lib/mongo/collections";
import { toObjectIdOrNull } from "@/lib/mongo/ids";

/** Immutable audit record for privileged operations. Insert-only. */
export async function logAudit(
  db: Db,
  input: {
    actorId?: string | null;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    details?: Record<string, unknown> | null;
  }
): Promise<void> {
  const actor = input.actorId ? toObjectIdOrNull(input.actorId) : null;
  const target = input.targetId ? toObjectIdOrNull(input.targetId) : null;
  await col<AuditLogDoc>(db, "auditLogs").insertOne({
    actorId: actor,
    action: String(input.action).slice(0, 120),
    targetType: input.targetType ?? null,
    targetId: target,
    details: input.details ?? null,
    createdAt: new Date(),
  } as never);
}
