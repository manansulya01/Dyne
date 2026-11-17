#!/usr/bin/env node
/**
 * Import a school-approved CSV roster into Dyne.
 *
 * Dry-run is the default. To create accounts, pass --apply and
 * --confirm-db <exact database name>. Each account receives a random
 * temporary password and must change it at first sign-in.
 *
 * Never commit the roster or generated credentials file.
 */
import { randomBytes } from "node:crypto";
import { access, chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import bcrypt from "bcryptjs";
import { MongoClient } from "mongodb";

function usage() {
  console.log(`Usage:
  node --env-file=.env.local scripts/import-school-roster.mjs --file ./school-roster.csv
  node --env-file=.env.local scripts/import-school-roster.mjs --file ./school-roster.csv --apply --confirm-db dyne

CSV headers (case-insensitive): email,username,displayName,role,classGrade,house
Allowed roles: student, teacher, staff. Students must have classGrade.
Dry-run is the default. --apply requires --confirm-db to exactly match MONGODB_DB.
Optional: --output ./dyne-roster-credentials.csv
`);
}

function parseCsv(input) {
  const source = input.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const headers = ["email", "username", "role", "classGrade", "house", "temporaryPassword", "status"];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ].join("\n") + "\n";
}

async function writeCredentials(path, rows) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, toCsv(rows), { encoding: "utf8", mode: 0o600 });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
  await chmod(path, 0o600);
}

async function hashInBatches(rows, size = 20) {
  const prepared = [];
  for (let i = 0; i < rows.length; i += size) {
    const batch = await Promise.all(rows.slice(i, i + size).map(async (row) => {
      const temporaryPassword = randomBytes(24).toString("base64url");
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      return { ...row, temporaryPassword, passwordHash, status: "pending" };
    }));
    prepared.push(...batch);
  }
  return prepared;
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const filePath = valueAfter("--file");
const apply = args.includes("--apply");
const confirmedDb = valueAfter("--confirm-db");
const outputPath = resolve(valueAfter("--output") || "./dyne-roster-credentials.csv");
const uri = (process.env.MONGODB_URI || "").trim();
const dbName = (process.env.MONGODB_DB || "dyne").trim();

if (!filePath) {
  usage();
  process.exit(2);
}
if (!uri) throw new Error("MONGODB_URI is required.");
if (apply && confirmedDb !== dbName) {
  throw new Error(`Refusing to write: pass --confirm-db ${dbName} to confirm the target database.`);
}

const absoluteInput = resolve(filePath);
const inputStat = await stat(absoluteInput);
if (inputStat.size > 5 * 1024 * 1024) throw new Error("Roster CSV must be 5 MB or smaller.");
const rawCsv = await readFile(absoluteInput, "utf8");
const parsed = parseCsv(rawCsv);
if (parsed.length < 2) throw new Error("CSV must include a header and at least one account row.");
if (parsed.length - 1 > 3500) throw new Error("Import is limited to 3,500 accounts per run.");

const headers = parsed[0].map((header) => header.trim().toLowerCase().replace(/[^a-z]/g, ""));
const requiredHeaders = ["email", "username", "displayname", "role", "classgrade"];
for (const required of requiredHeaders) {
  if (!headers.includes(required)) throw new Error(`Missing required CSV column: ${required}`);
}
const column = Object.fromEntries(headers.map((header, index) => [header, index]));
const seenEmails = new Set();
const seenUsernames = new Set();
const rows = parsed.slice(1).map((cells, index) => {
  const get = (key) => (cells[column[key]] ?? "").trim();
  const email = get("email").toLowerCase();
  const username = get("username").toLowerCase();
  const displayName = get("displayname");
  const role = get("role").toLowerCase();
  const classGrade = get("classgrade");
  const house = column.house === undefined ? "" : get("house");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Row ${index + 2}: invalid email.`);
  if (!/^[a-z0-9_]{3,30}$/.test(username)) throw new Error(`Row ${index + 2}: username must be 3–30 lowercase letters, numbers or underscores.`);
  if (!displayName || displayName.length > 80) throw new Error(`Row ${index + 2}: displayName must be 1–80 characters.`);
  if (!["student", "teacher", "staff"].includes(role)) throw new Error(`Row ${index + 2}: role must be student, teacher or staff.`);
  if (role === "student" && (!classGrade || classGrade.length > 50)) throw new Error(`Row ${index + 2}: students require classGrade (max 50 characters).`);
  if (classGrade.length > 50 || house.length > 40) throw new Error(`Row ${index + 2}: classGrade/house is too long.`);
  if (seenEmails.has(email)) throw new Error(`Row ${index + 2}: duplicate email in CSV.`);
  if (seenUsernames.has(username)) throw new Error(`Row ${index + 2}: duplicate username in CSV.`);
  seenEmails.add(email);
  seenUsernames.add(username);
  return { email, username, displayName, role, classGrade: classGrade || null, house: house || null };
});

const client = new MongoClient(uri, {
  maxPoolSize: 20,
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 8000,
});
await client.connect();
try {
  const db = client.db(dbName);
  await db.command({ ping: 1 });
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true });
  await users.createIndex({ username: 1 }, { unique: true });

  const existing = await users.find({
    $or: [
      { email: { $in: rows.map((row) => row.email) } },
      { username: { $in: rows.map((row) => row.username) } },
    ],
  }, { projection: { email: 1, username: 1 } }).toArray();
  const existingEmails = new Set(existing.map((user) => user.email));
  const existingUsernames = new Set(existing.map((user) => user.username));
  const eligible = rows.filter((row) => !existingEmails.has(row.email) && !existingUsernames.has(row.username));
  const skipped = rows.length - eligible.length;

  console.log(`Database: ${dbName}`);
  console.log(`Roster rows: ${rows.length}; already present: ${skipped}; eligible: ${eligible.length}`);
  if (!apply) {
    console.log("Dry run only. No accounts or passwords were created. Re-run with --apply --confirm-db <database> to proceed.");
    process.exit(0);
  }
  try {
    await access(outputPath);
    throw new Error(`Credentials output already exists: ${outputPath}. Choose a new --output path.`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const prepared = await hashInBatches(eligible);
  await mkdir(dirname(outputPath), { recursive: true });
  // Write the temporary credentials before inserting accounts. If the process
  // is interrupted, the pending rows still contain the passwords for any
  // accounts that may already have been created.
  await writeCredentials(outputPath, prepared);

  for (let i = 0; i < prepared.length; i += 50) {
    const batch = prepared.slice(i, i + 50);
    const now = new Date();
    const documents = batch.map((row) => ({
      email: row.email,
      username: row.username,
      displayName: row.displayName,
      passwordHash: row.passwordHash,
      role: row.role,
      classGrade: row.classGrade,
      house: row.house,
      avatarUrl: null,
      coverImageUrl: null,
      accent: null,
      bio: null,
      interests: [],
      profileTags: [],
      emailVerifiedAt: null,
      suspendedUntil: null,
      bannedAt: null,
      banReason: null,
      mustChangePassword: true,
      passwordUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
    }));
    try {
      await users.insertMany(documents, { ordered: false });
    } catch (error) {
      if (error?.code !== 11000 && !Array.isArray(error?.writeErrors)) throw error;
    }
    const created = await users.find({
      username: { $in: batch.map((row) => row.username) },
    }, { projection: { username: 1 } }).toArray();
    const createdNames = new Set(created.map((user) => user.username));
    for (const row of batch) row.status = createdNames.has(row.username) ? "created" : "not_created";
    await writeCredentials(outputPath, prepared);
  }

  const createdCount = prepared.filter((row) => row.status === "created").length;
  const failedCount = prepared.length - createdCount;
  console.log(`Created: ${createdCount}; not created: ${failedCount}; skipped existing accounts: ${skipped}`);
  console.log(`One-time credentials written to: ${outputPath}`);
  console.log("Store that file securely, distribute credentials through an approved school channel, and delete it after first-login password changes.");
} finally {
  await client.close();
}
