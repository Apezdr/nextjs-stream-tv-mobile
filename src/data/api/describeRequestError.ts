import { ApiError } from "@/src/data/api/axiosClient";
import { useServerHealthStore } from "@/src/stores/serverHealthStore";

/**
 * Plain wording for a failed content request, for screens that put the
 * error text on screen. Never the transport's own message: "Request failed
 * with status code 503" is what the watch page showed during the 2026-10-11
 * outage.
 *
 * The health store knows more than the error does. While the device is
 * offline or the server is known to be unreachable, that is the message,
 * whatever status the request happened to die with.
 */
export function describeRequestError(
  error: unknown,
  fallback = "Couldn't load this title.",
): string {
  const { isOnline, reachability } = useServerHealthStore.getState();
  if (!isOnline) return "No network connection.";
  if (reachability === "unreachable")
    return "Can't reach the server right now.";
  if (reachability === "degraded") {
    return "The server is up, but its database isn't responding.";
  }

  if (error instanceof ApiError) {
    if (error.status === 404) return "This title isn't available.";
    if (error.status === 401 || error.status === 403) {
      return "You don't have access to this title.";
    }
    if (error.status >= 500) return "The server isn't responding right now.";
    return fallback;
  }

  // No response at all: axios codes (ERR_NETWORK, ECONNABORTED) or a bare
  // fetch failure.
  const code = (error as { code?: unknown } | null)?.code;
  const text = `${typeof code === "string" ? code : ""} ${
    error instanceof Error ? error.message : ""
  }`;
  if (/network|timeout|abort|econn/i.test(text)) {
    return "The server isn't responding right now.";
  }
  return fallback;
}
