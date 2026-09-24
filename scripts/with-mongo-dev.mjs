#!/usr/bin/env node
/**
 * E2E harness: boots in-memory MongoDB + `next dev`, runs an HTTP suite, tears down.
 *
 * Usage: node scripts/with-mongo-dev.mjs <port> <test-script> [test-script...]
 * Env: APP_BASE is exported for suites (http://127.0.0.1:<port>).
 * Exit code mirrors the failing suite (0 = all green).
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";

const [, , portArg, ...suites] = process.argv;
if (!portArg || suites.length === 0) {
  console.error("Usage: node scripts/with-mongo-dev.mjs <port> <test-script> [...]");
  process.exit(2);
}
const port = Number(portArg);
const storageDir = mkdtempSync(path.join(tmpdir(), "dyne-storage-"));

let mongod;
let dev;
try {
  mongod = await MongoMemoryServer.create({ instance: { dbName: "dyne_e2e" } });
  const uri = mongod.getUri("dyne_e2e");
  console.log(`[harness] mongo ready`);

  dev = spawn(
    "npm",
    ["run", "dev", "--", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        MONGODB_URI: uri,
        MONGODB_DB: "dyne_e2e",
        AUTH_SECRET: "e2e-test-secret-that-is-long-enough-for-tests",
        STORAGE_DRIVER: "local",
        STORAGE_LOCAL_DIR: storageDir,
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );
  let out = "";
  dev.stdout.on("data", (d) => { out += String(d); });
  dev.stderr.on("data", (d) => { out += String(d); });

  const deadline = Date.now() + 180000;
  for (;;) {
    if (out.includes("Ready in") || out.includes("started server on")) break;
    if (dev.exitCode !== null && dev.exitCode !== undefined) {
      console.error("[harness] dev server exited early:\n" + out.slice(-3000));
      process.exit(1);
    }
    if (Date.now() > deadline) {
      console.error("[harness] dev server never became ready:\n" + out.slice(-3000));
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`[harness] dev ready on :${port}`);

  let failed = false;
  const suiteEnv = {
    ...process.env,
    APP_BASE: `http://127.0.0.1:${port}`,
    MONGODB_URI: uri,
    MONGODB_DB: "dyne_e2e",
  };
  for (const suite of suites) {
    console.log(`[harness] running ${suite}`);
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [suite], {
        env: suiteEnv,
        stdio: "inherit",
      });
      child.on("exit", (c) => resolve(c ?? 1));
    });
    if (code !== 0) failed = true;
  }
  process.exitCode = failed ? 1 : 0;
} finally {
  try { dev?.kill("SIGTERM"); } catch { /* noop */ }
  try { await mongod?.stop(); } catch { /* noop */ }
  try { rmSync(storageDir, { recursive: true, force: true }); } catch { /* noop */ }
}
