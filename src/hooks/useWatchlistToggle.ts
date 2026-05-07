import { useCallback, useRef, useState } from "react";

import { contentService } from "@/src/data/services/contentService";

interface UseWatchlistToggleProps {
  id: string;
  tmdbId?: number | null;
  mediaType: "movie" | "tv";
  title: string;
}

/**
 * Lightweight watchlist toggle hook for TV media info screens.
 * Manages default-playlist resolution, status fetch, and toggle in one place.
 */
export function useWatchlistToggle({
  id,
  tmdbId,
  mediaType,
  title,
}: UseWatchlistToggleProps) {
  const [isInWatchlist, setIsInWatchlist] = useState<boolean | undefined>(
    undefined,
  );
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [isToggling, setIsToggling] = useState(false);

  const statusFetchedRef = useRef(false);
  const defaultPlaylistIdRef = useRef<string | undefined>(undefined);
  const defaultPlaylistResolvedRef = useRef(false);
  const defaultPlaylistRequestRef = useRef<Promise<string | undefined> | null>(
    null,
  );

  const resolveDefaultPlaylistId = useCallback(async (): Promise<
    string | undefined
  > => {
    if (defaultPlaylistResolvedRef.current) return defaultPlaylistIdRef.current;

    if (defaultPlaylistRequestRef.current) {
      return defaultPlaylistRequestRef.current;
    }

    defaultPlaylistRequestRef.current = (async () => {
      try {
        const response = await contentService.getWatchlistPlaylists({
          includeItemCounts: false,
          includeDefaultPlaylist: true,
        });
        const playlistId =
          response.defaultPlaylistId ??
          response.playlists.find((p) => p.isDefault)?.id ??
          response.playlists[0]?.id;
        defaultPlaylistIdRef.current = playlistId;
        defaultPlaylistResolvedRef.current = true;
        return playlistId;
      } catch {
        defaultPlaylistResolvedRef.current = true;
        return undefined;
      } finally {
        defaultPlaylistRequestRef.current = null;
      }
    })();

    return defaultPlaylistRequestRef.current;
  }, []);

  const resolvedTmdbId =
    typeof tmdbId === "number" && Number.isFinite(tmdbId) ? tmdbId : null;
  const mediaId = !resolvedTmdbId ? id : undefined;

  /** Call once when the screen mounts to populate the watchlist status. */
  const fetchStatus = useCallback(async () => {
    if (statusFetchedRef.current) return;
    statusFetchedRef.current = true;
    setIsLoadingStatus(true);

    try {
      const playlistId = await resolveDefaultPlaylistId();
      const response = await contentService.getWatchlistStatus({
        tmdbId: resolvedTmdbId ?? undefined,
        mediaId,
        mediaType,
        playlistId,
      });
      setIsInWatchlist(!!response.inWatchlist);
    } catch {
      // Allow retry on next mount
      statusFetchedRef.current = false;
    } finally {
      setIsLoadingStatus(false);
    }
  }, [mediaId, mediaType, resolvedTmdbId, resolveDefaultPlaylistId]);

  /** Toggle the item in/out of the default watchlist playlist. */
  const toggle = useCallback(async () => {
    if (isToggling) return;
    setIsToggling(true);

    try {
      const playlistId = await resolveDefaultPlaylistId();
      const response = await contentService.toggleWatchlistItem({
        tmdbId: resolvedTmdbId ?? undefined,
        mediaId,
        mediaType,
        title,
        playlistId,
      });

      if (response.action === "added") {
        setIsInWatchlist(true);
      } else if (response.action === "removed") {
        setIsInWatchlist(false);
      } else {
        setIsInWatchlist((prev) => !prev);
      }
    } catch (error) {
      console.warn("[useWatchlistToggle] Toggle failed", error);
    } finally {
      setIsToggling(false);
    }
  }, [
    isToggling,
    mediaId,
    mediaType,
    resolvedTmdbId,
    resolveDefaultPlaylistId,
    title,
  ]);

  return { isInWatchlist, isLoadingStatus, isToggling, fetchStatus, toggle };
}

export type WatchlistToggleResult = ReturnType<typeof useWatchlistToggle>;
