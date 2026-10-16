import { describe, expect, it } from "vitest";
import { readFormData } from "@/lib/utils";

describe("readFormData", () => {
  it("returns the form for multipart bodies", async () => {
    const fd = new FormData();
    fd.set("email", "a@mva.edu");
    const req = new Request("http://localhost/api/auth/login", { method: "POST", body: fd });
    const parsed = await readFormData(req);
    expect(parsed?.get("email")).toBe("a@mva.edu");
  });

  it("returns null for JSON bodies instead of throwing (no 500)", async () => {
    const req = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: { $gt: "" }, password: "x" }),
    });
    await expect(readFormData(req)).resolves.toBeNull();
  });

  it("returns null for empty bodies instead of throwing", async () => {
    const req = new Request("http://localhost/api/posts", { method: "POST" });
    await expect(readFormData(req)).resolves.toBeNull();
  });
});
