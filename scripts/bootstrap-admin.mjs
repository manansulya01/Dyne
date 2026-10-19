#!/usr/bin/env node
/**
 * One-time provisioning for initial Dyne staff accounts.
 *
 * Configure MONGODB_URI/MONGODB_DB and ADMIN_BOOTSTRAP_PASSWORD in the shell
 * or deployment environment before running. Never put real passwords in Git.
 * Every provisioned account must change its password after first sign-in.
 *
 * npm run bootstrap:admin
 */
import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const env = (name, fallback = "") => (process.env[name] || fallback).trim();
const uri = env("MONGODB_URI");
const dbName = env("MONGODB_DB", "dyne");
if (!uri) {
  console.error("Missing MONGODB_URI. Configure the database connection first.");
  process.exit(2);
}

const accounts = [
  {
    enabled: Boolean(env("ADMIN_BOOTSTRAP_PASSWORD")),
    username: env("ADMIN_BOOTSTRAP_USERNAME", "admin0").toLowerCase(),
    email: env("ADMIN_BOOTSTRAP_EMAIL", "admin0@dyne.local").toLowerCase(),
    password: env("ADMIN_BOOTSTRAP_PASSWORD"),
    displayName: env("ADMIN_BOOTSTRAP_DISPLAY_NAME", "Dyne Administrator"),
    role: "super_admin",
  },
  {
    enabled: Boolean(env("TEACHER_BOOTSTRAP_PASSWORD")),
    username: env("TEACHER_BOOTSTRAP_USERNAME", "staff0").toLowerCase(),
    email: env("TEACHER_BOOTSTRAP_EMAIL", "staff0@dyne.local").toLowerCase(),
    password: env("TEACHER_BOOTSTRAP_PASSWORD"),
    displayName: env("TEACHER_BOOTSTRAP_DISPLAY_NAME", "Dyne Staff"),
    role: "teacher",
  },
];

for (const account of accounts.filter((item) => item.enabled)) {
  if (!/^[a-z0-9_]{3,30}$/.test(account.username)) {
    console.error(`Invalid username configured for role ${account.role}.`);
    process.exit(2);
  }
  if (account.password.length < 7 || account.password.length > 128) {
    console.error(`Bootstrap password for ${account.username} must be 7–128 characters; use a stronger password and rotate it after first sign-in.`);
    process.exit(2);
  }
}
if (!accounts.some((item) => item.enabled)) {
  console.error("Set ADMIN_BOOTSTRAP_PASSWORD and/or TEACHER_BOOTSTRAP_PASSWORD before running this command.");
  process.exit(2);
}
if (accounts.some((a) => a.enabled) && accounts.filter((a) => a.enabled).some((a) => accounts.filter((b) => b.enabled && b.username === a.username).length > 1)) {
  console.error("Bootstrap usernames must be unique.");
  process.exit(2);
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
});
await client.connect();
try {
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  const users = db.collection("users");
  for (const account of accounts.filter((item) => item.enabled)) {
    const hash = await bcrypt.hash(account.password, 12);
    const matches = await users.find({
      $or: [{ username: account.username }, { email: account.email }],
    }).limit(2).toArray();
    if (matches.length > 1) {
      throw new Error(`Username/email for ${account.username} belong to different existing accounts; resolve the conflict manually first.`);
    }
    const now = new Date();
    const profile = {
      username: account.username,
      email: account.email,
      displayName: account.displayName,
      passwordHash: hash,
      role: account.role,
      mustChangePassword: true,
      passwordUpdatedAt: now,
      updatedAt: now,
    };
    if (matches.length === 1) {
      await users.updateOne({ _id: matches[0]._id }, { $set: profile });
      console.log(`Provisioned existing account ID ${account.username} with role ${account.role}; password rotation is required.`);
    } else {
      await users.insertOne({
        ...profile,
        avatarUrl: null,
        coverImageUrl: null,
        accent: null,
        bio: null,
        classGrade: null,
        house: null,
        interests: [],
        profileTags: [],
        emailVerifiedAt: null,
        suspendedUntil: null,
        bannedAt: null,
        banReason: null,
        createdAt: now,
      });
      console.log(`Created account ID ${account.username} with role ${account.role}; password rotation is required.`);
    }
  }
} finally {
  await client.close();
}
