import { describe, expect, it } from "vitest";
import { canAccessGradeResource } from "@/lib/auth/enrollment";

describe("canAccessGradeResource", () => {
  it("allows a section to access generic grade resources", () => {
    expect(canAccessGradeResource("Grade 9-A", "Grade 9")).toBe(true);
    expect(canAccessGradeResource("9-A", "9")).toBe(true);
  });

  it("allows exact section matches", () => {
    expect(canAccessGradeResource("Grade 9-A", "9-A")).toBe(true);
    expect(canAccessGradeResource("9/B", "Grade 9/B")).toBe(true);
  });

  it("blocks access across sibling sections", () => {
    expect(canAccessGradeResource("9-A", "9-B")).toBe(false);
    expect(canAccessGradeResource("Grade 9-B", "Grade 9-A")).toBe(false);
  });

  it("does not grant a section-specific resource to an unsectioned enrollment", () => {
    expect(canAccessGradeResource("9", "9-A")).toBe(false);
  });

  it("fails closed for missing grades", () => {
    expect(canAccessGradeResource(null, "Grade 9")).toBe(false);
    expect(canAccessGradeResource("Grade 9", null)).toBe(false);
  });
});
