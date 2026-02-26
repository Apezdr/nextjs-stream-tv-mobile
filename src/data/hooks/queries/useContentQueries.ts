/**
 * React Query hooks for content operations
 * These hooks provide caching, background refetching, and error handling
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { API_ENDPOINTS, buildQueryParams } from "@/src/data/api/endpoints";
import { enhancedApiClient } from "@/src/data/api/enhancedClient";
import { queryKeys, invalidatePatterns } from "@/src/data/query/queryKeys";
import type {
  ContentListResponse,
  HorizontalListParams,
  EpisodePickerResponse,
  EpisodePickerParams,
  MediaDetailsResponse,
  MediaParams,
  MediaCountResponse,
  SubtitlesParams,
  ThumbnailsParams,
  ChapterParams,
  BannerResponse,
  ScreensaverResponse,
  SyncValidationUpdateRequest,
  GenresListResponse,
  GenresListParams,
  GenresContentResponse,
  GenresContentParams,
  WatchlistPlaylistsResponse,
  WatchlistPlaylistsParams,
  WatchlistContentResponse,
  WatchlistContentParams,
  WatchlistStatusResponse,
  WatchlistStatusParams,
  WatchlistWritePayload,
  WatchlistWriteResponse,
} from "@/src/data/types/content.types";

// Environment-controlled debug logging for horizontal list fetches
const HORIZONTAL_LIST_DEBUG_ENABLED =
  process.env.EXPO_PUBLIC_HORIZONTAL_LIST_DEBUG === "true";

/**
 * Debug logger for horizontal list requests
 */
function logHorizontalListRequest(
  hookName: string,
  endpoint: string,
  queryParams: string,
  params: unknown,
) {
  if (!HORIZONTAL_LIST_DEBUG_ENABLED) return;

  const baseURL = enhancedApiClient.getBaseUrl();
  const fullURL = `${baseURL}${endpoint}${queryParams}`;

  console.log(`[${hookName}] Horizontal List Request:`, {
    baseURL,
    endpoint,
    queryParams,
    fullURL,
    requestParams: params,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Hook to fetch horizontal content list
 */
export function useContentList(params: HorizontalListParams = {}) {
  const {
    type = "all",
    sort = "id",
    sortOrder = "desc",
    page = 0,
    limit = 30,
  } = params;

  return useQuery({
    queryKey: queryKeys.contentList({ type, sort, sortOrder, page, limit }),
    queryFn: () => {
      const requestParams = {
        type,
        sort,
        sortOrder,
        page,
        limit,
      };
      const queryParams = buildQueryParams(requestParams);

      // Debug logging for horizontal list requests
      logHorizontalListRequest(
        "useContentList",
        API_ENDPOINTS.CONTENT.HORIZONTAL_LIST,
        queryParams,
        requestParams,
      );

      return enhancedApiClient.get<ContentListResponse>(
        `${API_ENDPOINTS.CONTENT.HORIZONTAL_LIST}${queryParams}`,
      );
    },
    // Stale time is configured in queryClient
  });
}

/**
 * Hook to fetch episode picker data
 */
export function useEpisodePicker(params: EpisodePickerParams) {
  const { title, season } = params;

  return useQuery({
    queryKey: queryKeys.episodePicker(title, season),
    queryFn: () => {
      const queryParams = buildQueryParams({ title, season });
      return enhancedApiClient.get<EpisodePickerResponse>(
        `${API_ENDPOINTS.CONTENT.EPISODE_PICKER}${queryParams}`,
      );
    },
    enabled: !!title && season !== undefined,
  });
}

/**
 * Hook to fetch media details
 */
export function useMediaDetails(params: MediaParams) {
  const { mediaType, mediaTitle, mediaId, season, episode, card } = params;
  const identifier = mediaTitle || mediaId || "unknown";

  return useQuery({
    queryKey: queryKeys.media(mediaType, identifier),
    queryFn: () => {
      const queryParams = buildQueryParams({
        mediaType,
        mediaTitle,
        mediaId,
        season,
        episode,
        card,
      });
      return enhancedApiClient.get<MediaDetailsResponse>(
        `${API_ENDPOINTS.CONTENT.MEDIA}${queryParams}`,
      );
    },
    enabled: !!mediaType && (!!mediaTitle || !!mediaId),
  });
}

/**
 * Hook to fetch content counts
 */
export function useContentCount(type?: "recentlyWatched") {
  return useQuery({
    queryKey: queryKeys.contentCount(type),
    queryFn: () => {
      const queryParams = type ? buildQueryParams({ type }) : "";
      return enhancedApiClient.get<MediaCountResponse>(
        `${API_ENDPOINTS.CONTENT.COUNT}${queryParams}`,
      );
    },
  });
}

/**
 * Hook to fetch banner media
 */
export function useBanner() {
  return useQuery({
    queryKey: queryKeys.banner(),
    queryFn: () =>
      enhancedApiClient.get<BannerResponse>(API_ENDPOINTS.CONTENT.BANNER),
  });
}

/**
 * Hook to fetch screensaver content
 * No caching to ensure different content each time
 */
export function useScreensaver() {
  return useQuery({
    queryKey: queryKeys.screensaver(),
    queryFn: () => {
      const queryParams = buildQueryParams({
        analyzeContrast: true,
        animationPlacement: true,
        preferPosition: "bottom",
      });
      return enhancedApiClient.get<ScreensaverResponse>(
        `${API_ENDPOINTS.CONTENT.SCREENSAVER}${queryParams}`,
      );
    },
    gcTime: 0, // Don't cache
    staleTime: 0, // Always fresh
  });
}

/**
 * Hook to fetch subtitles
 */
export function useSubtitles(params: SubtitlesParams) {
  const { name, language, type, season, episode } = params;

  return useQuery({
    queryKey: queryKeys.subtitles(params),
    queryFn: () => {
      const queryParams = buildQueryParams({
        name,
        language,
        type,
        season,
        episode,
      });
      return enhancedApiClient.get(
        `${API_ENDPOINTS.CONTENT.SUBTITLES}${queryParams}`,
      );
    },
    enabled: !!name && !!type,
  });
}

/**
 * Hook to fetch thumbnails
 */
export function useThumbnails(params: ThumbnailsParams) {
  const { name, type, season, episode } = params;

  return useQuery({
    queryKey: queryKeys.thumbnails(params),
    queryFn: () => {
      const queryParams = buildQueryParams({ name, type, season, episode });
      return enhancedApiClient.get(
        `${API_ENDPOINTS.CONTENT.THUMBNAILS}${queryParams}`,
      );
    },
    enabled: !!name && !!type,
  });
}

/**
 * Hook to fetch chapters
 */
export function useChapters(params: ChapterParams) {
  const { name, type, season, episode } = params;

  return useQuery({
    queryKey: queryKeys.chapters(params),
    queryFn: () => {
      const queryParams = buildQueryParams({ name, type, season, episode });
      return enhancedApiClient.get(
        `${API_ENDPOINTS.CONTENT.CHAPTER}${queryParams}`,
      );
    },
    enabled: !!name && !!type,
  });
}

/**
 * Hook to fetch calendar data
 */
export function useCalendar(endpoint: "sonarr" | "radarr") {
  return useQuery({
    queryKey: queryKeys.calendar(endpoint),
    queryFn: () =>
      enhancedApiClient.get<string>(API_ENDPOINTS.CONTENT.CALENDAR(endpoint)),
  });
}

/**
 * Mutation to update validation status
 */
export function useUpdateValidationStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: SyncValidationUpdateRequest) =>
      enhancedApiClient.post(API_ENDPOINTS.SYSTEM.SYNC_VALIDATION, params),
    onSuccess: () => {
      // Invalidate relevant queries after successful update
      queryClient.invalidateQueries({
        queryKey: invalidatePatterns.allContent(),
      });
    },
  });
}

/**
 * Hook to fetch available genres list
 */
export function useGenresList(params: GenresListParams = {}) {
  const {
    action = "list",
    type = "movie",
    includeCounts = true,
    isTVdevice = true,
  } = params;

  return useQuery({
    queryKey: queryKeys.genresList({ type, includeCounts, isTVdevice }),
    queryFn: () => {
      const queryParams = buildQueryParams({
        action,
        type,
        includeCounts,
        isTVdevice,
      });
      return enhancedApiClient.get<GenresListResponse>(
        `${API_ENDPOINTS.CONTENT.GENRES}${queryParams}`,
      );
    },
  });
}

/**
 * Hook to fetch content for a specific genre with pagination
 */
export function useGenreContent(params: GenresContentParams) {
  const {
    action = "content",
    genre,
    type = "movie",
    page = 0,
    limit = 30,
    sort = "newest",
    sortOrder = "desc",
    includeWatchHistory = true,
    isTVdevice = true,
  } = params;

  return useQuery({
    queryKey: queryKeys.genreContent({
      genre,
      type,
      page,
      limit,
      sort,
      sortOrder,
    }),
    queryFn: () => {
      const queryParams = buildQueryParams({
        action,
        genre,
        type,
        page,
        limit,
        sort,
        sortOrder,
        includeWatchHistory,
        isTVdevice,
      });
      return enhancedApiClient.get<GenresContentResponse>(
        `${API_ENDPOINTS.CONTENT.GENRES}${queryParams}`,
      );
    },
    enabled: !!genre,
  });
}

/**
 * Hook to fetch watchlist playlists metadata
 */
export function useWatchlistPlaylists(params: WatchlistPlaylistsParams = {}) {
  const {
    action = "playlists",
    includeItemCounts = true,
    includeDefaultPlaylist = true,
    visibilityFilter,
  } = params;

  return useQuery({
    queryKey: queryKeys.watchlistPlaylists({
      includeItemCounts,
      includeDefaultPlaylist,
      visibilityFilter,
    }),
    queryFn: () => {
      const queryParams = buildQueryParams({
        action,
        includeItemCounts,
        includeDefaultPlaylist,
        visibilityFilter,
      });
      return enhancedApiClient.get<WatchlistPlaylistsResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST_CONTENT}${queryParams}`,
      );
    },
  });
}

/**
 * Hook to fetch watchlist content for a specific playlist
 */
export function useWatchlistContent(params: WatchlistContentParams) {
  const {
    action = "content",
    playlistId,
    page = 0,
    limit = 30,
    mediaType,
    isTVdevice = false,
    includeWatchHistory = true,
    includeUnavailable,
    hideUnavailable,
  } = params;

  return useQuery({
    queryKey: queryKeys.watchlistContent({
      playlistId,
      page,
      limit,
      mediaType,
      isTVdevice,
      includeWatchHistory,
      includeUnavailable,
      hideUnavailable,
    }),
    queryFn: () => {
      const queryParams = buildQueryParams({
        action,
        playlistId,
        page,
        limit,
        mediaType,
        isTVdevice,
        includeWatchHistory,
        includeUnavailable,
        hideUnavailable,
      });
      return enhancedApiClient.get<WatchlistContentResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST_CONTENT}${queryParams}`,
      );
    },
    enabled: !!playlistId,
  });
}

/**
 * Hook to check watchlist status for a single item
 */
export function useWatchlistStatus(
  params: WatchlistStatusParams,
  enabled = true,
) {
  const { tmdbId, mediaType, playlistId } = params;

  return useQuery({
    queryKey: queryKeys.watchlistStatus({ tmdbId, mediaType, playlistId }),
    queryFn: () => {
      const queryParams = buildQueryParams({
        action: "status",
        tmdbId,
        mediaType,
        playlistId,
      });
      return enhancedApiClient.get<WatchlistStatusResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST}${queryParams}`,
      );
    },
    enabled: enabled && Number.isFinite(tmdbId),
  });
}

/**
 * Mutation to add item to watchlist
 */
export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WatchlistWritePayload) => {
      const queryParams = buildQueryParams({ action: "add" });
      return enhancedApiClient.post<WatchlistWriteResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST}${queryParams}`,
        payload,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.content() });
    },
  });
}

/**
 * Mutation to toggle item in watchlist
 */
export function useToggleWatchlistItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: WatchlistWritePayload) => {
      const queryParams = buildQueryParams({ action: "toggle" });
      return enhancedApiClient.post<WatchlistWriteResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST}${queryParams}`,
        payload,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.content() });
    },
  });
}

/**
 * Mutation to remove item from watchlist
 */
export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: WatchlistStatusParams) => {
      const queryParams = buildQueryParams({
        action: "remove",
        tmdbId: params.tmdbId,
        mediaType: params.mediaType,
        playlistId: params.playlistId,
      });
      return enhancedApiClient.delete<WatchlistWriteResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST}${queryParams}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.content() });
    },
  });
}

/**
 * Prefetch helpers for TV navigation
 */
export const contentPrefetch = {
  // Prefetch content for smoother navigation
  prefetchContentList: (
    queryClient: ReturnType<typeof useQueryClient>,
    params: HorizontalListParams,
  ) => {
    return queryClient.prefetchQuery({
      queryKey: queryKeys.contentList(params),
      queryFn: () => {
        const queryParams = buildQueryParams({ ...params });

        // Debug logging for prefetch requests
        logHorizontalListRequest(
          "contentPrefetch.prefetchContentList",
          API_ENDPOINTS.CONTENT.HORIZONTAL_LIST,
          queryParams,
          params,
        );

        return enhancedApiClient.get<ContentListResponse>(
          `${API_ENDPOINTS.CONTENT.HORIZONTAL_LIST}${queryParams}`,
        );
      },
    });
  },

  // Prefetch media details
  prefetchMediaDetails: (
    queryClient: ReturnType<typeof useQueryClient>,
    params: MediaParams,
  ) => {
    const identifier = params.mediaTitle || params.mediaId || "unknown";
    return queryClient.prefetchQuery({
      queryKey: queryKeys.media(params.mediaType, identifier),
      queryFn: () => {
        const queryParams = buildQueryParams({ ...params });
        return enhancedApiClient.get<MediaDetailsResponse>(
          `${API_ENDPOINTS.CONTENT.MEDIA}${queryParams}`,
        );
      },
    });
  },
};
