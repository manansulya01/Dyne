import { describe, expect, it, beforeAll, afterEach } from "vitest";
process.env.MONGODB_DB = "dyne_test_bootstrap_roles";
process.env.ADMIN_BOOTSTRAP_SECRET = "test-bootstrap-secret-32-chars-long-ok";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames, type UserDoc } from "@/lib/mongo/collections";
import { createUser } from "@/lib/db/users";
import { canCreateEvents } from "@/lib/db/events";
import { POST as bootstrapPOST, GET as bootstrapGET } from "@/app/api/admin/bootstrap/route";

async function makeUser(username: string) {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  return r.userId;
}

function req(body: unknown) {
  return new Request("http://localhost/api/admin/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("admin bootstrap", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("reports bootstrapNeeded when no admin exists", async () => {
    const res = await bootstrapGET();
    expect(await res.json()).toEqual({ bootstrapNeeded: true });
  });

  it("rejects wrong secret, short payloads, and unknown users", async () => {
    await makeUser("boot_u1");
    expect((await bootstrapPOST(req({ email: "boot_u1@school.test", secret: "wrong-secret-value-here" }))).status).toBe(403);
    expect((await bootstrapPOST(req({ email: "boot_u1@school.test", secret: "short" }))).status).toBe(400);
    expect((await bootstrapPOST(req({ email: "nobody@school.test", secret: process.env.ADMIN_BOOTSTRAP_SECRET }))).status).toBe(404);
  });

  it("promotes the first super_admin, audits, then refuses a second bootstrap", async () => {
    const db = await getDb();
    await makeUser("boot_first");
    const ok = await bootstrapPOST(req({ email: "boot_first@school.test", secret: process.env.ADMIN_BOOTSTRAP_SECRET }));
    expect(ok.status).toBe(200);
    const user = await col<UserDoc>(db, "users").findOne({ email: "boot_first@school.test" } as never);
    expect(user?.role).toBe("super_admin");
    const audits = await col(db, "auditLogs").find({ action: "admin.bootstrap" } as never).toArray();
    expect(audits.length).toBe(1);
    // Secret itself is never written to the audit record.
    expect(JSON.stringify(audits[0])).not.toContain(process.env.ADMIN_BOOTSTRAP_SECRET);

    await makeUser("boot_second");
    const again = await bootstrapPOST(req({ email: "boot_second@school.test", secret: process.env.ADMIN_BOOTSTRAP_SECRET }));
    expect(again.status).toBe(403);
    const second = await col<UserDoc>(db, "users").findOne({ email: "boot_second@school.test" } as never);
    expect(second?.role).toBe("student");

    const status = await bootstrapGET();
    expect(await status.json()).toEqual({ bootstrapNeeded: false });
  });
});

describe("super_admin creator/manager role coverage", () => {
  it("super_admin can create events; students/moderators cannot", async () => {
    expect(canCreateEvents("super_admin")).toBe(true);
    expect(canCreateEvents("admin")).toBe(true);
    expect(canCreateEvents("student")).toBe(false);
    expect(canCreateEvents("moderator")).toBe(false);
  });
});
