import { describe, expect, it, beforeAll, afterEach } from "vitest";
// Isolate this file's data: every integration file uses its own database
// (workers share one memory server, so shared names would flake).
process.env.MONGODB_DB = "dyne_test_events";
import { getDb } from "@/lib/mongo/client";
import { col, ensureIndexes, collectionNames } from "@/lib/mongo/collections";
import { createUser, setUserRole } from "@/lib/db/users";
import { createEvent, listEvents, rsvpEvent, cancelRsvp } from "@/lib/db/events";

async function makeUser(username: string, role: "student" | "teacher" = "student") {
  const db = await getDb();
  const r = await createUser(db, {
    email: `${username}@school.test`, password: "Password-1",
    username, displayName: username,
  });
  if (!r.ok) throw new Error("setup failed");
  if (role !== "student") await setUserRole(db, r.userId, role);
  return r.userId;
}

function tomorrow(offsetHours = 24) {
  return {
    start: new Date(Date.now() + offsetHours * 3600 * 1000),
    end: new Date(Date.now() + (offsetHours + 2) * 3600 * 1000),
  };
}

describe("events repository", () => {
  beforeAll(async () => {
    await ensureIndexes(await getDb());
  });

  afterEach(async () => {
    const db = await getDb();
    await Promise.all(collectionNames.map((n) => col(db, n).deleteMany({})));
  });

  it("restricts creation by role and validates dates", async () => {
    const db = await getDb();
    const student = await makeUser("student");
    const teacher = await makeUser("teacher", "teacher");
    const { start, end } = tomorrow();

    expect(await createEvent(db, student, "student", { title: "Party", startTime: start, endTime: end })).toEqual({
      ok: false, reason: "forbidden",
    });
    expect(await createEvent(db, teacher, "teacher", { title: "x", startTime: start, endTime: end })).toEqual({
      ok: false, reason: "bad_title",
    });
    expect(await createEvent(db, teacher, "teacher", { title: "Valid", startTime: end, endTime: start })).toEqual({
      ok: false, reason: "bad_end",
    });
    const created = await createEvent(db, teacher, "teacher", {
      title: "Tournament", startTime: start, endTime: end, maxAttendees: 2,
    });
    expect(created.ok).toBe(true);
  });

  it("enforces capacity atomically and supports cancel/re-RSVP", async () => {
    const db = await getDb();
    const teacher = await makeUser("teacher", "teacher");
    const a = await makeUser("anna");
    const b = await makeUser("bob");
    const c = await makeUser("cara");
    const { start, end } = tomorrow();
    const created = await createEvent(db, teacher, "teacher", {
      title: "Finals", startTime: start, endTime: end, maxAttendees: 1,
    });
    if (!created.ok) throw new Error("setup failed");

    expect(await rsvpEvent(db, created.eventId, a, "going")).toMatchObject({ ok: true });
    expect(await rsvpEvent(db, created.eventId, b, "going")).toEqual({ ok: false, reason: "full" });
    // Interested does not consume capacity.
    expect((await rsvpEvent(db, created.eventId, b, "interested")).ok).toBe(true);
    // Cancel releases the seat.
    expect((await cancelRsvp(db, created.eventId, a)).ok).toBe(true);
    expect((await rsvpEvent(db, created.eventId, b, "going")).ok).toBe(true);
    // Re-RSVP by the holder is always allowed.
    expect((await rsvpEvent(db, created.eventId, b, "going")).ok).toBe(true);
    expect((await rsvpEvent(db, created.eventId, c, "going")).ok).toBe(false);

    const listed = (await listEvents(db, b)) as Array<Record<string, unknown>>;
    expect(listed[0].attendeeCount).toBe(1);
    expect(listed[0].userRsvp).toBe("going");
  });

  it("blocks private-event RSVPs except for the organizer", async () => {
    const db = await getDb();
    const teacher = await makeUser("teacher", "teacher");
    const anna = await makeUser("anna");
    const { start, end } = tomorrow();
    const created = await createEvent(db, teacher, "teacher", {
      title: "Secret", startTime: start, endTime: end, isPublic: false,
    });
    if (!created.ok) throw new Error("setup failed");
    expect(await rsvpEvent(db, created.eventId, anna, "going")).toEqual({
      ok: false, reason: "private",
    });
    expect((await rsvpEvent(db, created.eventId, teacher, "going")).ok).toBe(true);
  });

  it("survives concurrent RSVPs past capacity (race test)", async () => {
    const db = await getDb();
    const teacher = await makeUser("teacher", "teacher");
    const users = await Promise.all(
      ["u1", "u2", "u3", "u4", "u5"].map((u) => makeUser(u))
    );
    const { start, end } = tomorrow();
    const created = await createEvent(db, teacher, "teacher", {
      title: "Race", startTime: start, endTime: end, maxAttendees: 2,
    });
    if (!created.ok) throw new Error("setup failed");

    const results = await Promise.all(
      users.map((u) => rsvpEvent(db, created.eventId, u, "going"))
    );
    const winners = results.filter((r) => r.ok);
    expect(winners).toHaveLength(2);

    const going = await col(db, "eventAttendees").countDocuments({
      eventId: created.eventId,
      status: "going",
    } as never);
    expect(going).toBe(2);
  });
});
