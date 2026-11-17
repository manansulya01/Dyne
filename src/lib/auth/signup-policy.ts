/**
 * Public self-registration is a development convenience, not a safe default
 * for a closed school network. Production must explicitly opt in after the
 * school has approved its identity and enrollment process.
 */
export function isPublicSignupAllowed(
  nodeEnvironment: string | undefined,
  configuredValue: string | undefined
): boolean {
  return nodeEnvironment !== "production" || configuredValue === "true";
}
