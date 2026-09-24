import type { StorageDriver } from "./types";
import { LocalStorageDriver } from "./local";
import { R2StorageDriver } from "./r2";

declare global {
  // eslint-disable-next-line no-var
  var __dyneStorageDriver: StorageDriver | undefined;
}

/**
 * Driver selection:
 *   STORAGE_DRIVER=r2  -> Cloudflare R2 (production; requires R2_* env vars)
 *   anything else      -> local filesystem driver (development/tests)
 */
export function getStorageDriver(): StorageDriver {
  if (!globalThis.__dyneStorageDriver) {
    globalThis.__dyneStorageDriver =
      process.env.STORAGE_DRIVER === "r2" ? new R2StorageDriver() : new LocalStorageDriver();
  }
  return globalThis.__dyneStorageDriver;
}

/** Test helper: swap the cached driver. */
export function __setStorageDriverForTests(driver: StorageDriver | undefined): void {
  globalThis.__dyneStorageDriver = driver;
}
