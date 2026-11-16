import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
process.env.MONGODB_DB = "dyne_test_staff_login_route";

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => cookieStore.has(name)
      ? { name, value: cookieStore.get(name) }
      : undefined,
    set: (name: string, value: string) => { cookieStore.set(name, value); },
    delete: (name: string) => { cookieStore.delete(name); },
  }),
}));

import { getDb } from "@/lib/mongo/client";
import { col, collectionNames, ensureIndexes } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import { __resetRateLimitsForTests } from "@/lib/security/rateLimit";
import { POST as login } from "@/app/api/auth/login/route";

async function makeUser(username: string, role: "student" | "teacher" | "staff" | "admin" | "super_admin") {
  const db = await getDb();
  const created = await createUser(db, {
    email: `${username}@school.test`,
    password: "Password-1",
    username,
    displayName: username,
  });
  if (!created.ok) throw new Error(`could not create ${username}`);
  if (role !== "student") await setUserRole(db, created.userId, role);
  return created.userId;
}

async function loginAs(identifier: string, portal?: string) {
  const body = new FormData();
  body.set("identifier", identifier);
  body.set("password", "Password-1");
  if (portal) body.set("portal", portal);
  return login(new Request("http://localhost/api/auth/login", {
    method: "POST",
    body,
  }));
}

describe("login route portal authorization", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((name) => col(db, name).deleteMany({})));
    cookieStore.clear();
    __resetRateLimitsForTests();
  });

  it("routes admin, teacher, and staff accounts to their own portal", async () => {
    await makeUser("login_admin", "admin");
    await makeUser("login_teacher", "teacher");
    await makeUser("login_staff", "staff");

    const admin = await loginAs("login_admin", "admin");
    expect(admin.status).toBe(200);
    expect((await admin.json()).redirectTo).toBe("/admin");

    cookieStore.clear();
    const teacher = await loginAs("login_teacher", "teacher");
    expect(teacher.status).toBe(200);
    expect((await teacher.json()).redirectTo).toBe("/teacher");

    cookieStore.clear();
    const staff = await loginAs("login_staff", "staff");
    expect(staff.status).toBe(200);
    expect((await staff.json()).redirectTo).toBe("/dashboard");
  });

  it("blocks cross-portal login before creating a session", async () => {
    await makeUser("cross_staff", "staff");
    const response = await loginAs("cross_staff", "admin");
    expect(response.status).toBe(403);
    expect(cookieStore.has("dyne_session")).toBe(false);
  });

  it("allows only admins into the administrator portal", async () => {
    await makeUser("cross_teacher", "teacher");
    const response = await loginAs("cross_teacher", "admin");
    expect(response.status).toBe(403);
    expect(cookieStore.has("dyne_session")).toBe(false);
  });

  it("allows super-admins into the administrator portal", async () => {
    await makeUser("login_super", "super_admin");
    const response = await loginAs("login_super", "admin");
    expect(response.status).toBe(200);
    expect((await response.json()).redirectTo).toBe("/admin");
  });

  it("keeps ordinary member login available without a staff portal", async () => {
    await makeUser("login_student", "student");
    const response = await loginAs("login_student");
    expect(response.status).toBe(200);
    expect((await response.json()).redirectTo).toBe("/feed");
  });
});
