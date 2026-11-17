import type { StorageDriver } from "./types";
import { LocalStorageDriver } from "./local";
import { R2StorageDriver } from "./r2";

declare global {
  // `var` is required syntax for global augmentation.
  var __dyneStorageDriver: StorageDriver | undefined;
}

/**
 * Driver selection:
 *   STORAGE_DRIVER=r2  -> Cloudflare R2 (production; requires R2_* env vars)
 *   local              -> local filesystem (development/tests only)
 *
 * Production must fail closed rather than silently writing uploads to a
 * serverless instance's temporary filesystem. Local files can disappear on
 * redeploy/scale-out and would make user uploads appear to be lost.
 */
export function getStorageDriver(): StorageDriver {
  if (!globalThis.__dyneStorageDriver) {
    const requestedDriver = process.env.STORAGE_DRIVER;
    if (requestedDriver === "r2") {
      globalThis.__dyneStorageDriver = new R2StorageDriver();
    } else {
      if (process.env.NODE_ENV === "production" && requestedDriver !== "local") {
        throw new Error(
          "Persistent media storage is not configured. Set STORAGE_DRIVER=r2 and configure the R2_* environment variables before accepting uploads in production."
        );
      }
      if (process.env.NODE_ENV === "production" && requestedDriver === "local") {
        throw new Error(
          "STORAGE_DRIVER=local is disabled in production because serverless local files are not persistent."
        );
      }
      globalThis.__dyneStorageDriver = new LocalStorageDriver();
    }
  }
  return globalThis.__dyneStorageDriver;
}

/** Test helper: swap the cached driver. */
export function __setStorageDriverForTests(driver: StorageDriver | undefined): void {
  globalThis.__dyneStorageDriver = driver;
}
