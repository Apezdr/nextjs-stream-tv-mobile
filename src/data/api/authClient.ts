/**
 * Better Auth client instance with device authorization plugin.
 * Create a new instance per server URL — call createBetterAuthClient(serverUrl)
 * from AuthProvider whenever the server changes.
 */
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

/**
 * Derive the origin (scheme://host[:port]) from a server URL.
 *
 * React Native's URL polyfill doesn't reliably implement `.origin`, so we build
 * it from protocol + host (both supported). Falls back to a trailing-slash strip.
 */
export function serverOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

export function createBetterAuthClient(baseURL: string) {
  // React Native's fetch never sends an `Origin` header, and on Android it also
  // attaches any stale session cookie from the OS cookie jar regardless of
  // `credentials`. better-auth's CSRF middleware then rejects the originless
  // request with 403 "Missing or null Origin". We send the server's own origin
  // (which better-auth trusts by default) so the check passes regardless of
  // cookies — on every platform, including Apple TV / Android TV where clearing
  // the native cookie jar isn't viable. `credentials: "omit"` is a correctness
  // signal (this app authenticates with Bearer tokens, not cookies) that also
  // suppresses cookie sending on iOS.
  return createAuthClient({
    baseURL,
    fetchOptions: {
      credentials: "omit",
      headers: { origin: serverOrigin(baseURL) },
    },
    plugins: [deviceAuthorizationClient()],
  });
}

export type BetterAuthClient = ReturnType<typeof createBetterAuthClient>;
