#!/usr/bin/env node
/**
 * Test-only helper: set a user's role directly in the database.
 * Used by HTTP E2E suites to bootstrap the first teacher/admin (there is no
 * legitimate API path to self-promote). NEVER expose via API routes.
 *
 * Usage: node scripts/promote.mjs <email> <role>
 * Requires MONGODB_URI + MONGODB_DB in env (provided by with-mongo-dev.mjs).
 */
import { MongoClient } from "mongodb";

const [email, role] = process.argv.slice(2);
if (!email || !role) {
  console.error("Usage: node scripts/promote.mjs <email> <role>");
  process.exit(2);
}
if (!["student", "teacher", "staff", "club", "admin"].includes(role)) {
  console.error(`Invalid role: ${role}`);
  process.exit(2);
}
const client = new MongoClient(process.env.MONGODB_URI ?? "");
await client.connect();
try {
  const db = client.db(process.env.MONGODB_DB || "dyne_e2e");
  const res = await db
    .collection("users")
    .updateOne({ email: email.toLowerCase() }, { $set: { role, updatedAt: new Date() } });
  if (res.matchedCount !== 1) {
    console.error(`No such user: ${email}`);
    process.exit(1);
  }
  console.log(`[promote] ${email} -> ${role}`);
} finally {
  await client.close();
}
