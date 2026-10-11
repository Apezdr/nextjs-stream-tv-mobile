import { useEffect, useRef } from "react";

import { useServerHealthStore } from "@/src/stores/serverHealthStore";

/**
 * Calls `retry` once each time the server comes back from a CONFIRMED
 * outage while `shouldRetry` is true (typically: this loader is sitting on
 * an error). For loaders that are not React Query — AuthProvider's recovery
 * refetch covers those — and would otherwise show their error until the
 * user did something.
 *
 * Keyed on the store's recovery counter, not on reachability returning to
 * "ok": an endpoint-specific failure also sends the server through
 * suspect-and-back, and retrying on that would repeat the failure in a loop.
 */
export function useRetryOnServerRecovery(
  shouldRetry: boolean,
  retry: () => void,
) {
  const shouldRetryRef = useRef(shouldRetry);
  shouldRetryRef.current = shouldRetry;
  const retryRef = useRef(retry);
  retryRef.current = retry;

  useEffect(
    () =>
      useServerHealthStore.subscribe((state, previous) => {
        if (
          state.recoveries !== previous.recoveries &&
          shouldRetryRef.current
        ) {
          retryRef.current();
        }
      }),
    [],
  );
}
