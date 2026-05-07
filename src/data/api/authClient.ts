/**
 * Better Auth client instance with device authorization plugin.
 * Create a new instance per server URL — call createBetterAuthClient(serverUrl)
 * from AuthProvider whenever the server changes.
 */
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

export function createBetterAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    plugins: [deviceAuthorizationClient()],
  });
}

export type BetterAuthClient = ReturnType<typeof createBetterAuthClient>;
