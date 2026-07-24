/**
 * Classifies a get-session HTTP status into the action the auth layer should
 * take. Shared by refreshToken() and refreshUserStatus() in AuthProvider so
 * their handling of a failed session check can't silently diverge again.
 */
export type SessionCheckOutcome =
  | "valid"
  | "sign-out"
  | "server-issue"
  | "unknown-error";

export function classifySessionStatus(status: number): SessionCheckOutcome {
  if (status >= 200 && status < 300) return "valid";
  if (status === 401 || status === 403) return "sign-out";
  if (status >= 500) return "server-issue";
  return "unknown-error";
}
