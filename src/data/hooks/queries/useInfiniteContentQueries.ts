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
    queryFn: async ({ pageParam = 0 }) => {
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
    retry: (failureCount, error: Error & { status?: number }) => {
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

    // Prefetch the next page silently
    infiniteContentPrefetch.prefetchNextPage(
      queryClient,
      { type, sort, sortOrder, limit },
      currentPageCount,
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

      // Prefetch multiple pages ahead based on scroll velocity
      for (let i = 0; i < distance; i++) {
        const targetPage = currentPageCount + i;
        infiniteContentPrefetch.prefetchNextPage(
          queryClient,
          { type, sort, sortOrder, limit },
          targetPage,
        );
      }
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

      // Load fewer pages in parallel to reduce memory pressure
      const prefetchPromises = [];
      const actualMaxPages = Math.min(maxPages, 2); // Cap at 2 pages max

      for (let i = 0; i < actualMaxPages; i++) {
        const targetPage = currentPageCount + i;
        prefetchPromises.push(
          infiniteContentPrefetch.prefetchNextPage(
            queryClient,
            { type, sort, sortOrder, limit },
            targetPage,
          ),
        );
      }

      // Execute prefetches with error handling
      try {
        await Promise.allSettled(prefetchPromises);
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
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: queryKeys.genreContent({
      genre,
      type,
      limit,
      sort,
      sortOrder,
    }),
    queryFn: async ({ pageParam = 0 }) => {
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
    retry: (failureCount, error: Error & { status?: number }) => {
      // retry 6 times for network/server errors
      return failureCount < 6;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff, max 10s
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
  // Prefetch next page for smoother scrolling
  prefetchNextPage: (
    queryClient: ReturnType<typeof useQueryClient>,
    params: HorizontalListParams,
    currentPageCount: number,
  ) => {
    const {
      type = "all",
      sort = "id",
      sortOrder = "desc",
      limit = 30,
      isTVdevice = true,
    } = params;

    return queryClient.prefetchQuery({
      queryKey: queryKeys.contentList({
        type,
        sort,
        sortOrder,
        page: currentPageCount,
        limit,
        isTVdevice: isTVdevice,
      }),
      queryFn: () => {
        const requestParams = {
          type,
          sort,
          sortOrder,
          page: currentPageCount,
          limit,
          isTVdevice: isTVdevice,
        };
        const queryParams = buildQueryParams(requestParams);

        // Debug logging for prefetch requests
        logHorizontalListRequest(
          "infiniteContentPrefetch.prefetchNextPage",
          API_ENDPOINTS.CONTENT.HORIZONTAL_LIST,
          queryParams,
          requestParams,
        );

        return enhancedApiClient.get<ContentListResponse>(
          `${API_ENDPOINTS.CONTENT.HORIZONTAL_LIST}${queryParams}`,
        );
      },
    });
  },
};
