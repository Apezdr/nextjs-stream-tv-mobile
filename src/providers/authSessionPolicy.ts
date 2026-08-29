/**
 * Classifies a get-session HTTP status into the action the auth layer should
 * take. Shared by refreshToken() and refreshUserStatus() in AuthProvider so
 * their handling of a failed session check can't silently diverge again.
 */
export type SessionCheckOutcome =
  "valid" | "sign-out" | "server-issue" | "unknown-error";

/**
 * Note that 403 is deliberately NOT a sign-out signal.
 *
 * In better-auth 1.6.x a 403 never means "this session is gone". It means one
 * of three unrelated things, verified against the installed source:
 *   - SESSION_NOT_FRESH, thrown by freshSessionMiddleware for a session that
 *     is perfectly live but older than `freshAge` (default 1 day);
 *   - a permission denial;
 *   - MISSING_OR_NULL_ORIGIN from the CSRF origin check — the exact 403 this
 *     app already works around in createBetterAuthClient().
 * Treating any of those as invalidation would sign out a valid user.
 * better-auth's own client agrees: its session atom invalidates on 401 or a
 * null body and explicitly preserves the session on 403.
 */
export function classifySessionStatus(status: number): SessionCheckOutcome {
  if (status >= 200 && status < 300) return "valid";
  if (status === 401) return "sign-out";
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
/**
 * Classify a get-session response from its RAW body text.
 *
 * Taking the raw text rather than a parsed object is the point — it draws the
 * one distinction that matters:
 *
 *   - a 2xx whose body is a bare `null` (or JSON without a user) is
 *     better-auth's authoritative "no live session" answer → sign out;
 *   - a 2xx whose body does NOT parse as JSON is not an answer at all. It is
 *     almost always a reverse proxy, captive portal, or load balancer
 *     substituting an HTML error page, and must never sign anyone out.
 *
 * Collapsing those two cases is a live false-positive risk: this app already
 * has a documented history of proxies returning non-JSON on auth routes (see
 * the Apache ProxyErrorOverride handling in the device-token poll).
 */
export function classifySessionBody(
  status: number,
  rawBody: string | null | undefined,
): SessionCheckOutcome {
  const outcome = classifySessionStatus(status);
  if (outcome !== "valid") return outcome;

  const trimmed = (rawBody ?? "").trim();
  // An empty 2xx body is not an answer either.
  if (trimmed === "") return "unknown-error";

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return "unknown-error";
  }

  const user = (parsed as { user?: unknown } | null)?.user;
  return user ? "valid" : "sign-out";
}
