import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStorageDriver } from "@/lib/storage/local";

describe("local storage driver", () => {
  let root = "";
  let driver: LocalStorageDriver;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "dyne-storage-"));
    driver = new LocalStorageDriver(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("round-trips bytes through put/get/delete", async () => {
    const bytes = new TextEncoder().encode("hello campus");
    const { url } = await driver.put("avatars", "u1/a1.png", bytes, "image/png");
    expect(url).toBe("/api/files/avatars/u1/a1.png");
    const got = await driver.get("avatars", "u1/a1.png");
    expect(got).not.toBeNull();
    expect(Buffer.from(got!.bytes).toString()).toBe("hello campus");
    await driver.delete("avatars", "u1/a1.png");
    expect(await driver.get("avatars", "u1/a1.png")).toBeNull();
  });

  it("refuses to escape the storage root", async () => {
    const bytes = new TextEncoder().encode("x");
    await expect(driver.put("avatars", "../evil.png", bytes, "image/png")).rejects.toThrowError();
    await expect(driver.put("avatars", "a/../../evil.png", bytes, "image/png")).rejects.toThrowError();
  });

  it("delete is idempotent for missing files", async () => {
    await expect(driver.delete("avatars", "nobody/nothing.png")).resolves.toBeUndefined();
  });
});
