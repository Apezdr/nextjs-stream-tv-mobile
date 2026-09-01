/**
 * Delivery-tier verdict (proxied direct.json) for the item a watch screen is
 * about to play. Fired at playback-open only — never from browse/info
 * surfaces, because an eligible title's first verdict triggers the server's
 * one-time keyframe derivation (seconds on MP4, minutes on a huge MKV).
 */
import { useQuery } from "@tanstack/react-query";

import { ApiError } from "@/src/data/api/enhancedClient";
import { queryKeys } from "@/src/data/query/queryKeys";
import { contentService } from "@/src/data/services/contentService";
import {
  DirectPlayInfo,
  DirectPlayInfoParams,
  NO_DIRECT_PLAY_INFO,
} from "@/src/data/types/directPlay.types";

export function useDirectPlayInfo(params: DirectPlayInfoParams | null) {
  const enabled = !!params?.mediaType && !!params?.mediaId;

  return useQuery({
    queryKey: queryKeys.directPlayInfo(
      params ?? { mediaType: "none", mediaId: "none" },
    ),
    queryFn: async (): Promise<DirectPlayInfo> => {
      if (!params) return NO_DIRECT_PLAY_INFO;
      try {
        return await contentService.getDirectPlayInfo(params);
      } catch (error) {
        // Pre-deploy server (or the feature switched off): behave exactly as
        // §10 promises — the menu simply lacks Original, nothing else breaks.
        if (error instanceof ApiError && error.status === 404) {
          return NO_DIRECT_PLAY_INFO;
        }
        throw error;
      }
    },
    enabled,
    // The first request for an un-memoized title can outlive the 30s HTTP
    // timeout while the server derives keyframes. Keep asking at a generous
    // interval while the watch screen is open; the quality menu picks the
    // verdict up whenever it lands. Stop once any verdict exists — and stop
    // after a few hard failures too, so a misbehaving endpoint (non-404
    // errors don't hit the sentinel) can't keep a whole playback session
    // polling, retrying, and session-verifying every 30 seconds.
    refetchInterval: (query) =>
      query.state.data || query.state.errorUpdateCount >= 3 ? false : 30_000,
  });
}
