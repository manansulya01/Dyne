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
