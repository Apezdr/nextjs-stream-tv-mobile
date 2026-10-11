import { useServerHealthStore } from "@/src/stores/serverHealthStore";

/**
 * Whether a failed query attempt is worth another try.
 *
 * Not after a 4xx: that is an answer. And not once the health store knows
 * the server is down (offline, unreachable, or degraded): the probe has
 * already pronounced, and retrying only keeps a skeleton on screen for the
 * length of the backoff. The TV media-info page spent that time on its
 * skeleton while the movie page, whose loader does not retry, showed its
 * message at once.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
  maxFailures: number,
): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return false;
  }
  const { isOnline, reachability } = useServerHealthStore.getState();
  if (
    !isOnline ||
    reachability === "unreachable" ||
    reachability === "degraded"
  ) {
    return false;
  }
  return failureCount < maxFailures;
}

/**
 * "Show the spinner" for a query that has no data yet.
 *
 * Not `isLoading`: that is `isPending && isFetching`, and a first fetch that
 * is PAUSED for lack of network (onlineManager is wired on React Native now)
 * is pending but not fetching, so isLoading is false and a screen keyed on
 * it falls through to its empty state — "No results found" with nothing
 * actually searched. Not bare `isPending` either: that stays true forever on
 * a disabled query, and on one whose first fetch was cancelled, where the
 * old isLoading correctly showed nothing.
 */
export function isAwaitingFirstData(query: {
  isPending: boolean;
  isFetching: boolean;
  isPaused: boolean;
}): boolean {
  return query.isPending && (query.isFetching || query.isPaused);
}
