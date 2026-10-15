import { useCallback, useEffect, useRef, useState } from "react";

import { describeRequestError } from "@/src/data/api/describeRequestError";
import { contentService } from "@/src/data/services/contentService";
import { MediaDetailsResponse } from "@/src/data/types/content.types";
import { useRetryOnServerRecovery } from "@/src/hooks/useRetryOnServerRecovery";

export interface WatchContentParams {
  id: string;
  type: "tv" | "movie";
  season?: string;
  episode?: string;
}

function parseNumericParam(value: string | undefined): number | undefined {
  if (!value || value === "") return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

/**
 * Loads the media details a watch page plays from. Shared by the TV and
 * mobile pages, which used to carry a copy each.
 *
 * Not React Query — the result feeds a player, not a cache — so it handles
 * its own recovery: a failed load can be retried in place, and it retries
 * by itself the moment the server is reachable again (AuthProvider's
 * recovery refetch only reaches React Query). Its error text is plain
 * wording from describeRequestError, never the transport's.
 */
export function useWatchContentLoader(
  params: WatchContentParams,
  skipLoading = false,
) {
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<MediaDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const fetchDetails = useCallback(
    () =>
      contentService.getMediaDetails({
        mediaType: params.type,
        mediaId: params.id,
        // Parse season and episode as numbers directly from route params
        season: parseNumericParam(params.season),
        episode: parseNumericParam(params.episode),
        // Include watch history for resume functionality
        includeWatchHistory: true,
      }),
    [params.id, params.type, params.season, params.episode],
  );

  // The initial load, and a reload whenever the route params change: the
  // page shows its loading state for these.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!params.id || !params.type || skipLoading) return;

      setLoading(true);
      setContentError(null);

      try {
        const md = await fetchDetails();
        if (!cancelled) {
          setVideoURL(md?.videoURL ?? null);
          setVideoData(md ?? null);
        }
      } catch (error) {
        if (!cancelled) setContentError(describeRequestError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, params.type, skipLoading, fetchDetails]);

  /**
   * Retry in place. `loading` and the current error are left alone until
   * the result, so the page keeps its error card (whose button shows the
   * progress) instead of flashing its loading state and remounting the
   * card. Resolves true on success.
   */
  const retryContent = useCallback(async (): Promise<boolean> => {
    if (!params.id || !params.type) return false;
    try {
      const md = await fetchDetails();
      if (mounted.current) {
        setVideoURL(md?.videoURL ?? null);
        setVideoData(md ?? null);
        setContentError(null);
      }
      return true;
    } catch (error) {
      if (mounted.current) setContentError(describeRequestError(error));
      return false;
    }
  }, [params.id, params.type, fetchDetails]);

  const retryQuietly = useCallback(() => {
    void retryContent();
  }, [retryContent]);
  useRetryOnServerRecovery(contentError !== null, retryQuietly);

  return { videoURL, videoData, loading, contentError, retryContent };
}
