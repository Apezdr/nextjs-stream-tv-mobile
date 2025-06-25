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
} from "@/src/data/types/content.types";

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
      const queryParams = buildQueryParams({
        type,
        sort,
        sortOrder,
        page,
        limit,
      });
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
