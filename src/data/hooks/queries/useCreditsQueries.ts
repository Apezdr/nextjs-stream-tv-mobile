/**
 * Credits & licenses queries (CREDITS_SIDECAR.md §7).
 *
 * Two endpoints, one rule on both apps: the menu item shows only while the
 * availability answer says `available`, and an error is never "no credits".
 * React Query keeps the last successful answer through a failed refetch, so
 * `data` on its own carries that rule; the hooks here only add the plain
 * error wording and the "ask again" moments.
 */
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";

import { ApiError } from "@/src/data/api/axiosClient";
import { describeRequestError } from "@/src/data/api/describeRequestError";
import { queryKeys } from "@/src/data/query/queryKeys";
import {
  isAwaitingFirstData,
  shouldRetryQuery,
} from "@/src/data/query/queryState";
import { contentService } from "@/src/data/services/contentService";
import type {
  Credits,
  EpisodeSpecificResponse,
  TVDeviceMediaResponse,
} from "@/src/data/types/content.types";

// Don't re-ask within this window when a screen that shows the item regains
// focus; a remote-driven settings screen is focused and blurred constantly.
const REFOCUS_MIN_INTERVAL_MS = 5_000;

/**
 * Plain wording for a failed credits request. A 404 is a server without the
 * feature, not a missing title, so describeRequestError's 404 line is wrong
 * here.
 */
export function describeCreditsError(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) {
    return "Credits aren't available on this server yet.";
  }
  return describeRequestError(error, "Couldn't load the credits.");
}

/**
 * Show or hide the "Credits & licenses" menu item.
 *
 * `available` is false before the first answer and whenever the server says
 * so; a failed refetch keeps the previous answer. Asks again when the app
 * returns to the foreground (refetchOnWindowFocus; the query client wires
 * focusManager to AppState on both platforms) and when the screen that calls
 * this regains navigation focus — the menu opening.
 */
export function useCreditsAvailability() {
  const query = useQuery({
    queryKey: queryKeys.creditsAvailability(),
    queryFn: () => contentService.getCreditsAvailability(),
    staleTime: 30 * 1000,
    // The answer drives a menu item, so keep it around between visits.
    gcTime: 60 * 60 * 1000,
    retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 2),
    refetchOnWindowFocus: true,
  });

  const { refetch, dataUpdatedAt, errorUpdatedAt, isFetching } = query;
  useFocusEffect(
    useCallback(() => {
      const lastAnswer = Math.max(dataUpdatedAt, errorUpdatedAt);
      if (isFetching || Date.now() - lastAnswer < REFOCUS_MIN_INTERVAL_MS) {
        return;
      }
      void refetch();
      // Only `refetch` is a dependency on purpose: this is "the menu opened",
      // and the timestamps are read, not watched.
    }, [refetch]),
  );

  return {
    available: query.data?.available === true,
    availability: query.data,
    refetch,
  };
}

/**
 * The credits page: the library's credits and the list of credited titles.
 * A failure keeps whatever was shown before; `error` is set beside it so the
 * page can offer a retry without an empty "no credits" state.
 */
export function useCreditsCatalog() {
  const query = useQuery({
    queryKey: queryKeys.creditsCatalog(),
    queryFn: () => contentService.getCreditsCatalog(),
    staleTime: 60 * 1000,
    retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 2),
  });

  return {
    data: query.data ?? null,
    isLoading: isAwaitingFirstData(query),
    isRefreshing: query.isFetching && !!query.data,
    error: query.error ? describeCreditsError(query.error) : null,
    refetch: query.refetch,
  };
}

export interface TitleCreditsParams {
  mediaType: "movie" | "tv";
  mediaId: string;
  season?: number;
  episode?: number;
}

export interface TitleCredits {
  title: string;
  /** "S1 E1 · Llama Drama" for an episode request, else undefined. */
  subtitle?: string;
  credits: Credits | undefined;
}

type TitleCreditsResponse = TVDeviceMediaResponse &
  Partial<Pick<EpisodeSpecificResponse, "showTitle" | "episode">>;

/**
 * One title's credits, fetched fresh. The TV credits view uses this when it
 * was opened from the credits page (nothing handed it a `Credits` object),
 * and it is what makes an episode's own credits reachable on a TV that has
 * no episode screen: `season` + `episode` select the episode's file.
 */
export function useTitleCredits(params: TitleCreditsParams | null) {
  const query = useQuery({
    queryKey: queryKeys.titleCredits({
      mediaType: params?.mediaType ?? "",
      mediaId: params?.mediaId ?? "",
      season: params?.season,
      episode: params?.episode,
    }),
    queryFn: async (): Promise<TitleCredits> => {
      // `enabled` below guarantees params here.
      const { mediaType, mediaId, season, episode } =
        params as TitleCreditsParams;
      const result = (await contentService.getTVMediaDetails({
        mediaType,
        mediaId,
        season,
        episode,
      })) as TitleCreditsResponse;

      const isEpisode = episode !== undefined && !!result.episode;
      const episodeLabel = isEpisode
        ? `S${season} E${episode}${
            result.episode?.title?.trim() ? ` · ${result.episode.title}` : ""
          }`
        : undefined;

      return {
        title: result.showTitle || result.title,
        subtitle: episodeLabel,
        credits: result.credits,
      };
    },
    enabled: !!params?.mediaType && !!params?.mediaId,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 2),
  });

  return {
    data: query.data ?? null,
    isLoading: isAwaitingFirstData(query),
    error: query.error ? describeRequestError(query.error) : null,
    refetch: query.refetch,
  };
}
