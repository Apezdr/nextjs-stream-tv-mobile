import { useCallback, useEffect, useState } from "react";

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
 * its own recovery: a failed load can be retried on demand, and it retries
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
  const [attempt, setAttempt] = useState(0);

  const retryContent = useCallback(() => setAttempt((n) => n + 1), []);
  useRetryOnServerRecovery(contentError !== null, retryContent);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!params.id || !params.type || skipLoading) return;

      setLoading(true);
      setContentError(null);

      try {
        const md = await contentService.getMediaDetails({
          mediaType: params.type,
          mediaId: params.id,
          // Parse season and episode as numbers directly from route params
          season: parseNumericParam(params.season),
          episode: parseNumericParam(params.episode),
          // Include watch history for resume functionality
          includeWatchHistory: true,
        });

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
  }, [
    params.id,
    params.type,
    params.season,
    params.episode,
    skipLoading,
    attempt,
  ]);

  return { videoURL, videoData, loading, contentError, retryContent };
}
