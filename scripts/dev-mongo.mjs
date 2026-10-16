#!/usr/bin/env node
/**
 * Dedicated local development MongoDB (no Docker, no system-wide install).
 *
 * `mongodb-memory-server` is already a devDependency and its mongod binary is
 * cached under node_modules/.cache/mongodb-memory-server/. This script reuses
 * that exact binary as a normal, *persistent* server so the database named in
 * .env.local (the dedicated development database, e.g. `dyne_dev`) is real
 * during development.
 *
 * - Data lives in `.dev-mongo-data/` (gitignored) and survives restarts.
 * - Binds 127.0.0.1 only; override the port with DYNE_DEV_DB_PORT.
 * - Tests never use this server's data: vitest writes to `dyne_test*` and the
 *   HTTP E2E harness to `dyne_e2e` (isolated in-memory instances).
 *
 * Usage: npm run db:dev
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const portRaw = process.env.DYNE_DEV_DB_PORT ?? "27017";
const port = Number(portRaw);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[db:dev] invalid DYNE_DEV_DB_PORT: ${portRaw}`);
  process.exit(2);
}

const dataDir = path.resolve(process.cwd(), ".dev-mongo-data");

/** Prefer the mongod binary cached in node_modules by mongodb-memory-server. */
function findCachedBinary() {
  const cacheDir = path.resolve(
    process.cwd(),
    "node_modules/.cache/mongodb-memory-server"
  );
  try {
    const hit = readdirSync(cacheDir).find((f) => f.startsWith("mongod-"));
    if (hit) return path.join(cacheDir, hit);
  } catch {
    /* cache directory missing */
  }
  return null;
}

async function resolveBinary() {
  const cached = findCachedBinary();
  if (cached) return cached;
  // Fallback: let mongodb-memory-server resolve (and, if truly missing,
  // download) the same binary the test suite uses.
  try {
    const mod = await import("mongodb-memory-server");
    const resolved = await mod.MongoBinary.getPath({});
    if (typeof resolved === "string" && resolved.length > 0) return resolved;
  } catch (err) {
    console.error(
      `[db:dev] could not resolve a mongod binary: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
  console.error(
    "[db:dev] no mongod binary found. Run `npm test` once (it downloads one " +
      "via mongodb-memory-server), or install MongoDB locally."
  );
  process.exit(1);
}

/** Resolve true when something accepts TCP connections on the target port. */
function isPortOpen(timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

if (await isPortOpen()) {
  console.error(
    `[db:dev] port ${port} is already in use — another MongoDB (or app) is ` +
      "running, or set DYNE_DEV_DB_PORT to choose a different port."
  );
  process.exit(1);
}

mkdirSync(dataDir, { recursive: true });
const binary = await resolveBinary();
console.log(`[db:dev] binary  : ${binary}`);
console.log(`[db:dev] data dir: ${dataDir} (persistent, gitignored)`);

const mongod = spawn(
  binary,
  [
    "--dbpath",
    dataDir,
    "--port",
    String(port),
    "--bind_ip",
    "127.0.0.1",
    // Bounded cache: a dev machine should not hand half its RAM to WiredTiger.
    "--wiredTigerCacheSizeGB",
    "0.5",
    "--quiet",
  ],
  { stdio: "inherit" }
);

mongod.on("error", (err) => {
  console.error(`[db:dev] failed to start mongod: ${err.message}`);
  process.exit(1);
});

// Wait until mongod actually accepts connections before declaring readiness.
const deadline = Date.now() + 30_000;
let up = false;
while (!up) {
  if (mongod.exitCode !== null) {
    console.error(`[db:dev] mongod exited during startup (code ${mongod.exitCode}).`);
    process.exit(mongod.exitCode ?? 1);
  }
  if (Date.now() > deadline) {
    console.error("[db:dev] timed out waiting for mongod to accept connections.");
    mongod.kill("SIGTERM");
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 250));
  up = await isPortOpen();
}

console.log(
  `[db:dev] MongoDB ready on mongodb://127.0.0.1:${port} ` +
    "(app database: see MONGODB_DB in .env.local)"
);
console.log("[db:dev] Ctrl+C stops the server; data in .dev-mongo-data/ is kept.");

let stopping = false;
const stop = (signal) => {
  if (stopping) return;
  stopping = true;
  console.log(`\n[db:dev] ${signal} — stopping mongod (data kept)...`);
  mongod.kill("SIGTERM");
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

mongod.on("exit", (code, signal) => {
  console.log(
    `[db:dev] mongod exited (code=${code === null ? "null" : code}, signal=${
      signal ?? "none"
    }).`
  );
  process.exit(code ?? 0);
});
