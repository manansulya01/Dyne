import type { StorageDriver } from "./types";
import { LocalStorageDriver } from "./local";
import { R2StorageDriver } from "./r2";
import { MongoGridFSStorageDriver } from "./mongodb-gridfs";

declare global {
  // `var` is required syntax for global augmentation.
  var __dyneStorageDriver: StorageDriver | undefined;
}

/**
 * Driver selection:
 *   production (unset) or STORAGE_DRIVER=mongodb-gridfs -> MongoDB GridFS
 *   STORAGE_DRIVER=r2                                  -> Cloudflare R2
 *   development/tests (unset) or STORAGE_DRIVER=local  -> local filesystem
 *
 * GridFS is the production default so Dyne needs only its existing MongoDB
 * Atlas connection. Serverless local storage is deliberately rejected.
 */
export function getStorageDriver(): StorageDriver {
  if (globalThis.__dyneStorageDriver) return globalThis.__dyneStorageDriver;

  const requestedDriver = process.env.STORAGE_DRIVER;
  if (requestedDriver === "r2") {
    globalThis.__dyneStorageDriver = new R2StorageDriver();
  } else if (requestedDriver === "mongodb-gridfs" || (process.env.NODE_ENV === "production" && !requestedDriver)) {
    globalThis.__dyneStorageDriver = new MongoGridFSStorageDriver();
  } else if (requestedDriver === "local" || (!requestedDriver && process.env.NODE_ENV !== "production")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("STORAGE_DRIVER=local is disabled in production because serverless local files are not persistent.");
    }
    globalThis.__dyneStorageDriver = new LocalStorageDriver();
  } else {
    throw new Error("Unsupported STORAGE_DRIVER. Use mongodb-gridfs, r2, or local (development only).");
  }

  return globalThis.__dyneStorageDriver;
}

/** Test helper: swap the cached driver. */
export function __setStorageDriverForTests(driver: StorageDriver | undefined): void {
  globalThis.__dyneStorageDriver = driver;
}
