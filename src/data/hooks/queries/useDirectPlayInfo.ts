/**
 * Delivery-tier verdict (proxied direct.json) for the item a watch screen is
 * about to play. Fired at playback-open only — never from browse/info
 * surfaces, because an eligible title's first verdict triggers the server's
 * one-time keyframe derivation (seconds on MP4, minutes on a huge MKV).
 */
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

import { ApiError } from "@/src/data/api/enhancedClient";
import { queryKeys } from "@/src/data/query/queryKeys";
import { contentService } from "@/src/data/services/contentService";
import {
  DirectPlayInfo,
  DirectPlayInfoParams,
  NO_DIRECT_PLAY_INFO,
} from "@/src/data/types/directPlay.types";

/** Poll cadence while the server has no verdict yet and names no interval. */
export const DIRECT_INFO_POLL_MS = 30_000;
/** Floor under a server-supplied Retry-After, so a "0" never hot-loops. */
export const DIRECT_INFO_MIN_RETRY_MS = 5_000;
/** Hard failures (anything but 504 / 404) tolerated before polling stops. */
export const DIRECT_INFO_MAX_HARD_FAILURES = 3;

/** The server is still deriving keyframes; ask again after `retryAfterMs`. */
export class DirectInfoPendingError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number | undefined) {
    super("Direct-play verdict pending (504)");
    this.name = "DirectInfoPendingError";
    this.retryAfterMs = Math.max(
      DIRECT_INFO_MIN_RETRY_MS,
      retryAfterMs ?? DIRECT_INFO_POLL_MS,
    );
  }
}

/**
 * The next poll delay for the query's current state, or false to stop. Pure,
 * so the schedule is testable: a verdict stops polling; a pending 504 keeps
 * polling on the server's Retry-After for as long as the screen is open
 * (derivation of a large un-indexed MKV takes 13–24 minutes and must not be
 * mistaken for a dead endpoint); other errors stop after a few in a row.
 */
export function directInfoRefetchInterval(state: {
  data: DirectPlayInfo | undefined;
  error: unknown;
  hardFailures: number;
}): number | false {
  if (state.data) return false;
  if (state.error instanceof DirectInfoPendingError) {
    return state.error.retryAfterMs;
  }
  return state.hardFailures >= DIRECT_INFO_MAX_HARD_FAILURES
    ? false
    : DIRECT_INFO_POLL_MS;
}

export function useDirectPlayInfo(params: DirectPlayInfoParams | null) {
  const enabled = !!params?.mediaType && !!params?.mediaId;
  // React Query's errorUpdateCount counts every error including the
  // expected 504s; only real failures should use up the budget.
  const hardFailures = useRef(0);

  return useQuery({
    queryKey: queryKeys.directPlayInfo(
      params ?? { mediaType: "none", mediaId: "none" },
    ),
    queryFn: async (): Promise<DirectPlayInfo> => {
      if (!params) return NO_DIRECT_PLAY_INFO;
      try {
        const info = await contentService.getDirectPlayInfo(params);
        hardFailures.current = 0;
        return info;
      } catch (error) {
        // Pre-deploy server (or the feature switched off): behave exactly as
        // §10 promises — the menu simply lacks Original, nothing else breaks.
        if (error instanceof ApiError && error.status === 404) {
          return NO_DIRECT_PLAY_INFO;
        }
        // "Not yet": the transcoder is still deriving. Never "nothing
        // offered" — the quality menu grows when the verdict lands.
        if (error instanceof ApiError && error.status === 504) {
          throw new DirectInfoPendingError(error.retryAfterMs);
        }
        hardFailures.current += 1;
        throw error;
      }
    },
    enabled,
    // A pending verdict is not a failure to back off from; the server has
    // told us exactly when to ask again. Otherwise mirror the client-wide
    // rule: no retries on 4xx, up to three on anything else.
    retry: (failureCount, error) => {
      if (error instanceof DirectInfoPendingError) return false;
      const status = (error as { status?: number })?.status;
      if (status !== undefined && status >= 400 && status < 500) return false;
      return failureCount < 3;
    },
    refetchInterval: (query) =>
      directInfoRefetchInterval({
        data: query.state.data,
        error: query.state.error,
        hardFailures: hardFailures.current,
      }),
  });
}
