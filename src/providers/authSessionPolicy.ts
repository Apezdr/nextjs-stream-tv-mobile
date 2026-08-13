/**
 * Classifies a get-session HTTP status into the action the auth layer should
 * take. Shared by refreshToken() and refreshUserStatus() in AuthProvider so
 * their handling of a failed session check can't silently diverge again.
 */
export type SessionCheckOutcome =
  "valid" | "sign-out" | "server-issue" | "unknown-error";

export function classifySessionStatus(status: number): SessionCheckOutcome {
  if (status >= 200 && status < 300) return "valid";
  if (status === 401 || status === 403) return "sign-out";
  if (status >= 500) return "server-issue";
  return "unknown-error";
}

/**
 * better-auth's get-session endpoint responds 200 with a bare `null` body
 * (not 401/403) when the bearer token doesn't map to a live session — e.g. an
 * expired or revoked session. Classifying on status alone misreads that as
 * "valid", which is how an invalidated session used to slip past both
 * refreshUserStatus() and refreshToken() without ever triggering a sign-out.
 */
export function classifySessionResult(
  status: number,
  body: { user?: unknown } | null | undefined,
): SessionCheckOutcome {
  const outcome = classifySessionStatus(status);
  if (outcome === "valid" && !body?.user) return "sign-out";
  return outcome;
}
