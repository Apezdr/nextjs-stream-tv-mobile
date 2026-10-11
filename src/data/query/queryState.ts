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
