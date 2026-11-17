/**
 * Equivalent labels for approved grade-targeted content. Section labels are
 * normalized without granting sibling-section access; the bare grade label
 * is included only so section enrollments can see resources for the whole grade.
 */
export function gradeTargetLabels(value: string | null | undefined): string[] {
  const original = (value ?? "").trim();
  const normalized = original.toLowerCase().replace(/^(?:grade|class)\s*/i, "").replace(/\s+/g, "");
  if (!normalized) return [];
  const labels = new Set<string>([original, normalized, "Grade " + normalized]);
  const section = normalized.match(/^(\d{1,2})[-/]([a-z])$/i);
  const gradeNumber = normalized.match(/^(\d{1,2})$/)?.[1];
  if (section) {
    const number = section[1];
    const letter = section[2].toUpperCase();
    labels.add(number + "-" + letter);
    labels.add(number + "/" + letter);
    labels.add("Grade " + number + "-" + letter);
    labels.add("Grade " + number + "/" + letter);
  }
  if (section || gradeNumber) {
    const number = section?.[1] ?? gradeNumber!;
    labels.add(number);
    labels.add("Grade " + number);
  }
  return [...labels].filter(Boolean);
}

/**
 * Grade-aware access checks for school resources.
 *
 * A section-specific resource (for example 9-B) is visible only to that exact
 * enrolled section. A generic grade resource (9 / Grade 9) is visible to all
 * sections of that grade. This mirrors the study-library listing filter.
 */
export function canAccessGradeResource(
  enrolledGradeValue: string | null | undefined,
  resourceGradeValue: string | null | undefined
): boolean {
  const normalize = (value: string | null | undefined) =>
    (value ?? "")
      .trim()
      .toLowerCase()
      .replace(/^(?:grade|class)\s*/i, "")
      .replace(/\s+/g, "");

  const enrolledGrade = normalize(enrolledGradeValue);
  const resourceGrade = normalize(resourceGradeValue);
  if (!enrolledGrade || !resourceGrade) return false;
  if (enrolledGrade === resourceGrade) return true;

  // A sectioned resource must never fall back to the numeric grade alone.
  if (/^\d{1,2}[-/][a-z]$/i.test(resourceGrade)) return false;

  const enrolledNumber = enrolledGrade.match(/\d{1,2}/)?.[0];
  const resourceNumber = resourceGrade.match(/\d{1,2}/)?.[0];
  return Boolean(enrolledNumber && enrolledNumber === resourceNumber);
}
