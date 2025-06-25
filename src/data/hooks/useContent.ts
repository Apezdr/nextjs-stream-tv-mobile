/**
 * React hooks for content-related data fetching and state management
 * Enhanced with focus-based refresh and background refresh capability
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { contentService } from "@/src/data/services/contentService";
import {
  ContentListResponse,
  HorizontalListParams,
  MediaDetailsResponse,
  MediaParams,
  MediaCountResponse,
  EpisodePickerResponse,
  EpisodePickerParams,
  BannerResponse,
} from "@/src/data/types/content.types";

// Debounce utility for app state changes
function useDebounce<T extends (...args: AppStateStatus[]) => void>(
  callback: T,
  delay: number,
): T {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => callback(...args), delay);
    },
    [callback, delay],
  ) as T;
}

// Hook for fetching horizontal content lists
export function useContentList(params: HorizontalListParams = {}) {
  const [data, setData] = useState<ContentListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); // Track background refreshes
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(params.page || 0);

  const fetchData = useCallback(
    async (
      pageNum: number,
      append: boolean = false,
      isBackgroundRefresh: boolean = false,
    ) => {
      try {
        // Only show loading indicator if no data exists or it's not a background refresh
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getContentList({
          ...params,
          page: pageNum,
        });

        setData((prev) => {
          if (append && prev) {
            // Append new items for pagination
            return {
              currentItems: [...prev.currentItems, ...result.currentItems],
              previousItem: result.previousItem,
              nextItem: result.nextItem,
            };
          }
          return result;
        });
      } catch (err) {
        // Only show errors for foreground fetches to avoid UI disruption
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Content list fetch error:", err);
        } else {
          console.warn("Background content list refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [params],
  );

  // Initial data load
  useEffect(() => {
    fetchData(page);
  }, [fetchData, page]);

  // Debounced app state handler to prevent excessive refreshes
  const debouncedAppStateHandler = useDebounce(
    (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (nextAppState === "active" && data) {
        console.log(
          `[useContentList] App focused, refreshing data in background for ${params.type || "all"}`,
        );
        fetchData(page, false, true);
      }
    },
    1000,
  ); // 1 second debounce

  // Add app focus handler to refresh data in the background
  useEffect(() => {
    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      debouncedAppStateHandler,
    );

    // Clean up subscription on unmount
    return () => {
      subscription.remove();
    };
  }, [debouncedAppStateHandler]);

  // Function to load next page
  const loadMore = useCallback(() => {
    if (data?.nextItem && !isLoading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchData(nextPage, true);
    }
  }, [data, isLoading, page, fetchData]);

  // Function to refresh data
  const refresh = useCallback(() => {
    const initialPage = params.page || 0;
    setPage(initialPage);

    // Use background refresh if we already have data to avoid loading state
    if (data) {
      fetchData(initialPage, false, true);
    } else {
      fetchData(initialPage, false, false);
    }
  }, [params.page, fetchData, data]);

  return {
    data,
    isLoading,
    isRefreshing, // Expose the refreshing state
    error,
    loadMore,
    refresh,
    hasMore: !!data?.nextItem,
  };
}

// Hook for fetching media details
export function useMediaDetails(params: MediaParams) {
  const [data, setData] = useState<MediaDetailsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getMediaDetails(params);
        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Media details fetch error:", err);
        } else {
          console.warn("Background media details refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [params],
  );

  useEffect(() => {
    if (params.mediaType) {
      fetchData();
    }
  }, [fetchData]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (nextAppState === "active" && data && params.mediaType) {
        console.log(
          `[useMediaDetails] App focused, refreshing data in background for ${params.mediaType}`,
        );
        fetchData(true);
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    // Clean up subscription on unmount
    return () => {
      subscription.remove();
    };
  }, [data, fetchData, params.mediaType]);

  const refetch = useCallback(() => {
    // Use background refresh if we already have data to avoid loading state
    if (data) {
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, [fetchData, data]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refetch,
  };
}

// Hook for fetching episode picker data
export function useEpisodePicker(params: EpisodePickerParams) {
  const [data, setData] = useState<EpisodePickerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getEpisodePicker(params);
        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Episode picker fetch error:", err);
        } else {
          console.warn("Background episode picker refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [params],
  );

  useEffect(() => {
    if (params.title && params.season) {
      fetchData();
    }
  }, [fetchData]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (nextAppState === "active" && data && params.title && params.season) {
        console.log(
          `[useEpisodePicker] App focused, refreshing data in background for ${params.title} S${params.season}`,
        );
        fetchData(true);
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    // Clean up subscription on unmount
    return () => {
      subscription.remove();
    };
  }, [data, fetchData, params.title, params.season]);

  const refetch = useCallback(() => {
    // Use background refresh if we already have data to avoid loading state
    if (data) {
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, [fetchData, data]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refetch,
  };
}

// Hook for fetching content counts
export function useContentCounts(type?: "recentlyWatched") {
  const [data, setData] = useState<MediaCountResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getContentCounts(type);
        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Content counts fetch error:", err);
        } else {
          console.warn("Background content counts refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [type],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (nextAppState === "active" && data) {
        console.log(
          `[useContentCounts] App focused, refreshing data in background`,
        );
        fetchData(true);
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    // Clean up subscription on unmount
    return () => {
      subscription.remove();
    };
  }, [data, fetchData]);

  const refetch = useCallback(() => {
    // Use background refresh if we already have data to avoid loading state
    if (data) {
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, [fetchData, data]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refetch,
  };
}

// Hook for fetching banner content
export function useBanner() {
  const [data, setData] = useState<BannerResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getBanner();
        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Banner fetch error:", err);
        } else {
          console.warn("Background banner refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (nextAppState === "active" && data) {
        console.log(
          "[useBanner] App focused, refreshing banner data in background",
        );
        fetchData(true);
      }
    };

    // Subscribe to app state changes
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    // Clean up subscription on unmount
    return () => {
      subscription.remove();
    };
  }, [data, fetchData]);

  const refetch = useCallback(() => {
    // Use background refresh if we already have data to avoid loading state
    if (data) {
      fetchData(true);
    } else {
      fetchData(false);
    }
  }, [fetchData, data]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    refetch,
  };
}

// Hook for recently watched content
export function useRecentlyWatched(limit: number = 30) {
  return useContentList({
    type: "recentlyWatched",
    sort: "date",
    sortOrder: "desc",
    limit,
  });
}

// Hook for recently added content
export function useRecentlyAdded(limit: number = 30) {
  return useContentList({
    type: "recentlyAdded",
    sort: "date",
    sortOrder: "desc",
    limit,
  });
}

// Hook for movie content
export function useMovies(
  sort: "id" | "title" | "date" = "title",
  sortOrder: "asc" | "desc" = "asc",
  limit: number = 30,
) {
  return useContentList({
    type: "movie",
    sort,
    sortOrder,
    limit,
  });
}

// Hook for TV show content
export function useTVShows(
  sort: "id" | "title" | "date" = "title",
  sortOrder: "asc" | "desc" = "asc",
  limit: number = 30,
) {
  return useContentList({
    type: "tv",
    sort,
    sortOrder,
    limit,
  });
}

// Hook for recommendations
export function useRecommendations(limit: number = 30) {
  return useContentList({
    type: "recommendations",
    sort: "id",
    sortOrder: "desc",
    limit,
  });
}
