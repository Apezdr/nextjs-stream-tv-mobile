/**
 * Infinite query hooks for dynamic content loading
 * Provides infinite scrolling capabilities with React Query
 */
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { API_ENDPOINTS, buildQueryParams } from "@/src/data/api/endpoints";
import { enhancedApiClient } from "@/src/data/api/enhancedClient";
import { queryKeys } from "@/src/data/query/queryKeys";
import type {
  ContentListResponse,
  HorizontalListParams,
  MediaItem,
  GenresContentResponse,
  GenresContentParams,
  WatchlistContentResponse,
  WatchlistContentParams,
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
 * Hook for infinite content loading with pagination and predictive prefetching
 */
export function useInfiniteContentList(params: HorizontalListParams = {}) {
  const { type = "all", sort = "id", sortOrder = "desc", limit = 30 } = params;
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: queryKeys.infiniteContentList({
      type,
      sort,
      sortOrder,
      limit,
      isTVdevice: true,
    }),
    queryFn: async ({ pageParam = 0, signal }) => {
      const requestParams = {
        type,
        sort,
        sortOrder,
        page: pageParam,
        limit,
        isTVdevice: true,
      };
      const queryParams = buildQueryParams(requestParams);

      // Debug logging for infinite horizontal list requests
      logHorizontalListRequest(
        "useInfiniteContentList",
        API_ENDPOINTS.CONTENT.HORIZONTAL_LIST,
        queryParams,
        requestParams,
      );

      return enhancedApiClient.get<ContentListResponse>(
        `${API_ENDPOINTS.CONTENT.HORIZONTAL_LIST}${queryParams}`,
        { signal },
      );
    },
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer items than the limit, we've reached the end
      if (!lastPage.currentItems || lastPage.currentItems.length < limit) {
        return undefined;
      } else if (lastPage.nextItem === null) {
        return undefined; // No more items to load
      }
      // Return the next page number
      return allPages.length;
    },
    initialPageParam: 0,
    // Enhanced retry logic for infinite queries
    retry: (failureCount, _error: Error & { status?: number }) => {
      // retry 6 times for network/server errors
      return failureCount < 6;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff, max 10s
    // Stale time is configured in queryClient
  });

  // Enhanced prefetch function for predictive loading
  const prefetchNext = useCallback(() => {
    if (!query.hasNextPage || query.isFetchingNextPage) return;

    const currentPageCount = query.data?.pages.length || 0;

    // Warm one page beyond what's currently loaded
    infiniteContentPrefetch.prefetchPages(
      queryClient,
      { type, sort, sortOrder, limit },
      currentPageCount + 1,
    );
  }, [
    query.hasNextPage,
    query.isFetchingNextPage,
    query.data?.pages.length,
    queryClient,
    type,
    sort,
    sortOrder,
    limit,
  ]);

  // Ultra-aggressive multi-page prefetching
  const prefetchMultiple = useCallback(
    (distance: number = 2) => {
      if (!query.hasNextPage || query.isFetchingNextPage) return;

      const currentPageCount = query.data?.pages.length || 0;

      // Warm `distance` pages ahead in a single sequential prefetch
      infiniteContentPrefetch.prefetchPages(
        queryClient,
        { type, sort, sortOrder, limit },
        currentPageCount + distance,
      );
    },
    [
      query.hasNextPage,
      query.isFetchingNextPage,
      query.data?.pages.length,
      queryClient,
      type,
      sort,
      sortOrder,
      limit,
    ],
  );

  // Background bulk loading with conservative limits
  const prefetchBulk = useCallback(
    async (maxPages: number = 2) => {
      if (!query.hasNextPage) return;

      const currentPageCount = query.data?.pages.length || 0;
      const actualMaxPages = Math.min(maxPages, 2); // Cap at 2 pages max

      // Warm up to `actualMaxPages` beyond what's loaded, reducing memory pressure
      try {
        await infiniteContentPrefetch.prefetchPages(
          queryClient,
          { type, sort, sortOrder, limit },
          currentPageCount + actualMaxPages,
        );
      } catch (error) {
        console.warn("Bulk prefetch failed:", error);
      }
    },
    [
      query.hasNextPage,
      query.data?.pages.length,
      queryClient,
      type,
      sort,
      sortOrder,
      limit,
    ],
  );

  return {
    ...query,
    prefetchNext,
    prefetchMultiple,
    prefetchBulk,
  };
}

/**
 * Hook for infinite genre content loading with pagination
 */
export function useInfiniteGenreContent(params: GenresContentParams) {
  const {
    genre,
    type = "movie",
    limit = 30,
    sort = "newest",
    sortOrder = "desc",
    includeWatchHistory = true,
    isTVdevice = true,
  } = params;
  const _queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: queryKeys.genreContent({
      genre,
      type,
      limit,
      sort,
      sortOrder,
    }),
    queryFn: async ({ pageParam = 0, signal }) => {
      const queryParams = buildQueryParams({
        action: "content",
        genre,
        type,
        page: pageParam,
        limit,
        sort,
        sortOrder,
        includeWatchHistory,
        isTVdevice,
      });
      return enhancedApiClient.get<GenresContentResponse>(
        `${API_ENDPOINTS.CONTENT.GENRES}${queryParams}`,
        { signal },
      );
    },
    getNextPageParam: (lastPage, allPages) => {
      // If we got fewer items than the limit, we've reached the end
      if (!lastPage.currentItems || lastPage.currentItems.length < limit) {
        return undefined;
      } else if (lastPage.nextItem === null) {
        return undefined; // No more items to load
      }
      // Return the next page number
      return allPages.length;
    },
    initialPageParam: 0,
    enabled: !!genre,
    // Enhanced retry logic for infinite queries
    retry: (failureCount, _error: Error & { status?: number }) => {
      // retry 6 times for network/server errors
      return failureCount < 6;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff, max 10s
  });

  return query;
}

/**
 * Hook for infinite watchlist content loading with pagination
 */
export function useInfiniteWatchlistContent(
  params: WatchlistContentParams,
  options?: {
    enabled?: boolean;
    refetchInterval?: number | false;
    refetchIntervalInBackground?: boolean;
  },
) {
  const {
    playlistId,
    limit = 30,
    mediaType,
    isTVdevice = false,
    includeWatchHistory = true,
    includeUnavailable,
    hideUnavailable,
  } = params;
  const {
    enabled = true,
    refetchInterval,
    refetchIntervalInBackground,
  } = options || {};

  const query = useInfiniteQuery({
    queryKey: queryKeys.watchlistContent({
      playlistId,
      limit,
      mediaType,
      isTVdevice,
      includeWatchHistory,
      includeUnavailable,
      hideUnavailable,
    }),
    queryFn: async ({ pageParam = 0, signal }) => {
      const queryParams = buildQueryParams({
        action: "content",
        playlistId,
        page: pageParam,
        limit,
        mediaType,
        isTVdevice,
        includeWatchHistory,
        includeUnavailable,
        hideUnavailable,
      });

      const response = await enhancedApiClient.get<WatchlistContentResponse>(
        `${API_ENDPOINTS.CONTENT.WATCHLIST_CONTENT}${queryParams}`,
        { signal },
      );

      return response;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.pagination?.hasNextPage) {
        return undefined;
      }
      return allPages.length;
    },
    initialPageParam: 0,
    enabled: enabled && !!playlistId,
    refetchInterval,
    refetchIntervalInBackground,
    retry: (failureCount) => failureCount < 6,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  return query;
}

/**
 * Helper to get flattened data from infinite genre query
 */
export function getFlattenedInfiniteGenreData(
  data: ReturnType<typeof useInfiniteGenreContent>["data"],
): MediaItem[] {
  if (!data?.pages) return [];

  return data.pages.reduce<MediaItem[]>((acc, page) => {
    if (page.currentItems) {
      acc.push(...page.currentItems);
    }
    return acc;
  }, []);
}

/**
 * Helper to get flattened data from infinite watchlist query
 */
export function getFlattenedInfiniteWatchlistData(
  data: ReturnType<typeof useInfiniteWatchlistContent>["data"],
): MediaItem[] {
  if (!data?.pages) return [];

  return data.pages.reduce<MediaItem[]>((acc, page) => {
    if (page.currentItems) {
      acc.push(...page.currentItems);
    }
    return acc;
  }, []);
}

/**
 * Helper to get flattened data from infinite query
 */
export function getFlattenedInfiniteData(
  data: ReturnType<typeof useInfiniteContentList>["data"],
): MediaItem[] {
  if (!data?.pages) return [];

  return data.pages.reduce<MediaItem[]>((acc, page) => {
    if (page.currentItems) {
      acc.push(...page.currentItems);
    }
    return acc;
  }, []);
}

/**
 * Prefetch helpers for infinite content
 */
export const infiniteContentPrefetch = {
  /**
   * Warm the SAME infinite-query cache that useInfiniteContentList reads from,
   * ensuring at least `pages` pages are loaded. This MUST use
   * prefetchInfiniteQuery against the `infiniteContentList` key — a plain
   * prefetchQuery against the non-infinite `contentList` key writes to a
   * different cache entry that the live list never consumes.
   */
  prefetchPages: (
    queryClient: ReturnType<typeof useQueryClient>,
    params: HorizontalListParams,
    pages: number,
  ) => {
    const {
      type = "all",
      sort = "id",
      sortOrder = "desc",
      limit = 30,
      isTVdevice = true,
    } = params;

    return queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.infiniteContentList({
        type,
        sort,
        sortOrder,
        limit,
        isTVdevice,
      }),
      queryFn: async ({ pageParam = 0, signal }) => {
        const requestParams = {
          type,
          sort,
          sortOrder,
          page: pageParam,
          limit,
          isTVdevice,
        };
        const queryParams = buildQueryParams(requestParams);

        // Debug logging for prefetch requests
        logHorizontalListRequest(
          "infiniteContentPrefetch.prefetchPages",
          API_ENDPOINTS.CONTENT.HORIZONTAL_LIST,
          queryParams,
          requestParams,
        );

        return enhancedApiClient.get<ContentListResponse>(
          `${API_ENDPOINTS.CONTENT.HORIZONTAL_LIST}${queryParams}`,
          { signal },
        );
      },
      initialPageParam: 0,
      // Mirror the live query's pagination logic so prefetched pages chain
      // consistently with subsequent fetchNextPage calls.
      getNextPageParam: (
        lastPage: ContentListResponse,
        allPages: ContentListResponse[],
      ) => {
        if (!lastPage.currentItems || lastPage.currentItems.length < limit) {
          return undefined;
        } else if (lastPage.nextItem === null) {
          return undefined;
        }
        return allPages.length;
      },
      // Fetch sequentially up to this many pages (reusing already-cached pages).
      pages,
    });
  },
};
