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
  TVDeviceMediaResponse,
  GenresListResponse,
  GenresListParams,
  GenresContentResponse,
  GenresContentParams,
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

// Hook for fetching enhanced TV media details with optimized season switching
export function useTVMediaDetails(
  params: Omit<MediaParams, "isTVdevice"> | null,
) {
  const [data, setData] = useState<TVDeviceMediaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Destructure params to avoid object reference issues
  const mediaType = params?.mediaType;
  const mediaId = params?.mediaId;
  const season = params?.season;
  const episode = params?.episode;

  // Cache for static data that doesn't change between seasons
  const [cachedStaticData, setCachedStaticData] = useState<{
    id: string;
    title: string;
    type: string;
    posterURL: string;
    backdrop: string;
    posterBlurhash: string;
    backdropBlurhash: string;
    logo?: string;
    airDate?: string; // Optional air date for TV shows
    availableSeasons: number[];
    totalSeasons: number;
    navigation: TVDeviceMediaResponse["navigation"];
  } | null>(null);

  // Fetch initial data (includes metadata, navigation, and first season episodes)
  const fetchInitialData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      if (!params) return;

      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getTVMediaDetails({
          mediaType: params.mediaType,
          mediaId: params.mediaId,
          season: params.season,
          episode: params.episode,
          includeWatchHistory: true,
        });

        // Cache the static data and navigation
        setCachedStaticData({
          id: result.id,
          title: result.title,
          type: result.type,
          posterURL: result.posterURL,
          backdrop: result.backdrop,
          posterBlurhash: result.posterBlurhash,
          backdropBlurhash: result.backdropBlurhash,
          logo: result.logo,
          airDate: result.airDate, // Optional air date for TV shows
          availableSeasons: result.availableSeasons,
          totalSeasons: result.totalSeasons,
          navigation: result.navigation,
        });

        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("TV media details fetch error:", err);
        } else {
          console.warn("Background TV media details refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [mediaType, mediaId, season, episode],
  );

  // Fetch only episodes for a specific season (optimized for season switching)
  const fetchSeasonEpisodes = useCallback(
    async (targetSeason: number) => {
      if (!cachedStaticData || !params) return;

      try {
        setIsLoadingEpisodes(true);
        setError(null);

        const result = await contentService.getTVMediaDetails({
          mediaType: params.mediaType,
          mediaId: params.mediaId,
          season: targetSeason,
          episode: params.episode,
          includeWatchHistory: true,
        });

        // Merge cached static data with fresh metadata, episodes, and season-specific data
        setData({
          ...cachedStaticData,
          metadata: result.metadata, // Use fresh metadata (includes season-specific overview)
          airDate: result.airDate, // Use fresh airDate (season-specific)
          seasonNumber: result.seasonNumber,
          episodes: result.episodes,
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Season episodes fetch error:", err);
      } finally {
        setIsLoadingEpisodes(false);
      }
    },
    [cachedStaticData, params],
  );

  // Initial data load
  useEffect(() => {
    if (params && params.mediaType && params.mediaId && !cachedStaticData) {
      fetchInitialData();
    }
  }, [params, cachedStaticData, fetchInitialData]);

  // Handle season changes - only fetch episodes if static data is already cached
  useEffect(() => {
    if (
      cachedStaticData &&
      params?.season &&
      data &&
      params.season !== data.seasonNumber
    ) {
      console.log(
        `[useTVMediaDetails] Season changed to ${params.season}, fetching episodes and fresh metadata`,
      );
      fetchSeasonEpisodes(params.season);
    }
  }, [params?.season, cachedStaticData, data, fetchSeasonEpisodes]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (
        nextAppState === "active" &&
        data &&
        params?.mediaType &&
        params?.mediaId
      ) {
        console.log(
          `[useTVMediaDetails] App focused, refreshing data in background for ${params.mediaType}:${params.mediaId}`,
        );
        fetchInitialData(true);
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
  }, [data, fetchInitialData, params]);

  const refetch = useCallback(() => {
    // Use background refresh if we already have data to avoid loading state
    if (data) {
      fetchInitialData(true);
    } else {
      fetchInitialData(false);
    }
  }, [fetchInitialData, data]);

  return {
    data,
    isLoading,
    isRefreshing,
    isLoadingEpisodes, // New state for episode-only loading
    error,
    refetch,
  };
}

/**
 * Hook to fetch available seasons for a TV show
 * Used to determine which season to navigate to when selecting a show from browse
 */
export function useRootShowData(mediaId: string, enabled: boolean = true) {
  const [data, setData] = useState<TVDeviceMediaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when mediaId changes to prevent stale data
  useEffect(() => {
    setData(null);
    setError(null);
    setIsLoading(true);
    setIsRefreshing(false);
  }, [mediaId]);

  const fetchData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      if (!mediaId) return;

      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        console.log(
          `[useRootShowData] Fetching root show data for mediaId: ${mediaId}`,
        );
        const result = await contentService.getRootShowData(mediaId, "tv");
        console.log(`[useRootShowData] Received data for mediaId ${mediaId}:`, {
          title: result.title,
          availableSeasons: result.availableSeasons,
          totalSeasons: result.totalSeasons,
        });
        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error(
            `Root show data fetch error for mediaId ${mediaId}:`,
            err,
          );
        } else {
          console.warn(
            `Background root show data refresh failed for mediaId ${mediaId}:`,
            err,
          );
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [mediaId],
  );

  useEffect(() => {
    if (enabled && mediaId) {
      fetchData();
    }
  }, [enabled, mediaId, fetchData]);

  const refetch = useCallback(() => {
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

/**
 * Hook to fetch movie details for TV devices
 * Uses TV-optimized API but excludes season/episode parameters
 */
export function useMovieDetails(
  params: { mediaType: "movie"; mediaId: string } | null,
) {
  const [data, setData] = useState<TVDeviceMediaResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Destructure params to avoid object reference issues
  const mediaType = params?.mediaType;
  const mediaId = params?.mediaId;

  const fetchData = useCallback(
    async (isBackgroundRefresh: boolean = false) => {
      if (!mediaType || !mediaId) return;

      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        // Use getTVMediaDetails but WITHOUT season/episode parameters for movies
        const result = await contentService.getTVMediaDetails({
          mediaType: mediaType,
          mediaId: mediaId,
          // Explicitly exclude season/episode for movies
          includeWatchHistory: true,
        });

        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Movie details fetch error:", err);
        } else {
          console.warn("Background movie details refresh failed:", err);
        }
      } finally {
        if (!isBackgroundRefresh) {
          setIsLoading(false);
        } else {
          setIsRefreshing(false);
        }
      }
    },
    [mediaType, mediaId],
  );

  // Initial data load
  useEffect(() => {
    if (mediaType && mediaId) {
      fetchData();
    }
  }, [mediaType, mediaId, fetchData]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // When app comes to foreground and we already have data, do a background refresh
      if (nextAppState === "active" && data && mediaId) {
        console.log(
          `[useMovieDetails] App focused, refreshing data in background for movie:${mediaId}`,
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
  }, [data, fetchData, mediaId]);

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

/**
 * Hook for fetching available genres list
 */
export function useGenresList(params: GenresListParams = {}) {
  const [data, setData] = useState<GenresListResponse | null>(null);
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

        const result = await contentService.getGenresList(params);
        setData(result);
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Genres list fetch error:", err);
        } else {
          console.warn("Background genres list refresh failed:", err);
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
    fetchData();
  }, [fetchData]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && data) {
        console.log(
          "[useGenresList] App focused, refreshing genres list in background",
        );
        fetchData(true);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [data, fetchData]);

  const refetch = useCallback(() => {
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

/**
 * Hook for fetching content by genre with pagination support
 */
export function useGenreContent(params: GenresContentParams) {
  const [data, setData] = useState<GenresContentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(params.page || 0);

  const fetchData = useCallback(
    async (
      pageNum: number,
      append: boolean = false,
      isBackgroundRefresh: boolean = false,
    ) => {
      try {
        if (!isBackgroundRefresh) {
          setIsLoading(true);
        } else {
          setIsRefreshing(true);
        }

        setError(null);

        const result = await contentService.getGenreContent({
          ...params,
          page: pageNum,
        });

        setData((prev) => {
          if (append && prev) {
            // Append new items for pagination
            return {
              ...result,
              currentItems: [...prev.currentItems, ...result.currentItems],
            };
          }
          return result;
        });
      } catch (err) {
        if (!isBackgroundRefresh) {
          const errorMessage =
            err instanceof Error ? err.message : "Unknown error";
          setError(errorMessage);
          console.error("Genre content fetch error:", err);
        } else {
          console.warn("Background genre content refresh failed:", err);
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
    if (params.genre) {
      fetchData(page);
    }
  }, [fetchData, page, params.genre]);

  // Add app focus handler for background refresh
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && data && params.genre) {
        console.log(
          `[useGenreContent] App focused, refreshing genre content in background for ${params.genre}`,
        );
        fetchData(page, false, true);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [data, fetchData, page, params.genre]);

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

    if (data) {
      fetchData(initialPage, false, true);
    } else {
      fetchData(initialPage, false, false);
    }
  }, [params.page, fetchData, data]);

  return {
    data,
    isLoading,
    isRefreshing,
    error,
    loadMore,
    refresh,
    hasMore: !!data?.nextItem,
  };
}
