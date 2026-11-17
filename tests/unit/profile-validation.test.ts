import { describe, expect, it } from "vitest";
import { profileUpdateSchema } from "@/lib/validation";

describe("profileUpdateSchema", () => {
  it("accepts the supported self-service profile fields", () => {
    expect(profileUpdateSchema.safeParse({
      displayName: "Student",
      bio: "Hello campus",
      interests: ["robotics"],
    }).success).toBe(true);
  });

  it("rejects enrollment and privilege fields from self-service profile updates", () => {
    for (const payload of [
      { classGrade: "Grade 12" },
      { role: "admin" },
      { classGrade: "Grade 12", role: "admin" },
    ]) {
      expect(profileUpdateSchema.safeParse(payload).success).toBe(false);
    }
  });
});
