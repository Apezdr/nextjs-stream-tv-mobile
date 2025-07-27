import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  ActivityIndicator,
  InteractionManager,
} from "react-native";

import TVBanner from "@/src/components/TV/Banner/TVBanner";
import ContentRow from "@/src/components/TV/Pages/ContentRow";
import { Colors } from "@/src/constants/Colors";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import {
  useInfiniteContentList,
  getFlattenedInfiniteData,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { useRootShowData } from "@/src/data/hooks/useContent";
import { MediaItem } from "@/src/data/types/content.types";
import { backdropManager } from "@/src/utils/BackdropManager";

export default function TVHomePage() {
  const { currentMode, setMode } = useTVAppState();
  const router = useRouter();
  const isFocused = useIsFocused();

  // Conditional logging for performance optimization
  const DEBUG_HOME_PAGE = __DEV__ && false; // Enable only when needed for debugging
  const logDebug = useCallback((message: string, data?: any) => {
    if (DEBUG_HOME_PAGE) {
      console.log(`[TVHomePage] ${message}`, data);
    }
  }, []);

  // Ensure we're in browse mode when this page loads
  useEffect(() => {
    if (currentMode !== "browse") {
      setMode("browse");
    }
  }, [currentMode, setMode]);

  // API hooks with optimized settings
  const recentlyWatched = useInfiniteContentList({
    type: "recentlyWatched",
    sort: "date",
    sortOrder: "desc",
    limit: 15, // Larger batches for fewer requests
  });
  const recentlyAdded = useInfiniteContentList({
    type: "recentlyAdded",
    sort: "date",
    sortOrder: "desc",
    limit: 15,
  });
  const movies = useInfiniteContentList({
    type: "movie",
    sort: "title",
    sortOrder: "asc",
    limit: 15,
  });
  const tvShows = useInfiniteContentList({
    type: "tv",
    sort: "title",
    sortOrder: "asc",
    limit: 15,
  });

  // Debounce refresh to prevent excessive API calls
  const lastRefreshRef = useRef<number>(0);
  const REFRESH_DEBOUNCE_MS = 5000; // Only allow refresh every 5 seconds

  // Create stable callback references to reduce dependency churn
  const refreshCallbacks = useMemo(
    () => ({
      recentlyWatched: recentlyWatched.refetch,
      recentlyAdded: recentlyAdded.refetch,
      tvShows: tvShows.refetch,
      movies: movies.refetch,
    }),
    [
      recentlyWatched.refetch,
      recentlyAdded.refetch,
      tvShows.refetch,
      movies.refetch,
    ],
  );

  const prefetchCallbacks = useMemo(
    () => ({
      recentlyWatched: recentlyWatched.prefetchBulk,
      recentlyAdded: recentlyAdded.prefetchBulk,
      tvShows: tvShows.prefetchBulk,
      movies: movies.prefetchBulk,
    }),
    [
      recentlyWatched.prefetchBulk,
      recentlyAdded.prefetchBulk,
      tvShows.prefetchBulk,
      movies.prefetchBulk,
    ],
  );

  // Focus-aware background prefetching optimization and data refresh
  useFocusEffect(
    useCallback(() => {
      // Only execute refresh and prefetch operations if screen is actually focused
      if (!isFocused) {
        logDebug(
          "Screen not focused - skipping refresh and prefetch operations",
        );
        return;
      }

      logDebug(
        "Screen focused - optimizing background loading and refreshing data",
      );

      const now = Date.now();
      const timeSinceLastRefresh = now - lastRefreshRef.current;

      // Refresh data if enough time has passed and we have existing data
      if (timeSinceLastRefresh >= REFRESH_DEBOUNCE_MS) {
        if (recentlyWatched.data && refreshCallbacks.recentlyWatched) {
          logDebug("Refreshing recently watched data (debounced)");
          lastRefreshRef.current = now;
          refreshCallbacks.recentlyWatched();
        }
        if (recentlyAdded.data && refreshCallbacks.recentlyAdded) {
          logDebug("Refreshing recently added data (debounced)");
          refreshCallbacks.recentlyAdded();
        }
        if (tvShows.data && refreshCallbacks.tvShows) {
          logDebug("Refreshing TV shows data (debounced)");
          refreshCallbacks.tvShows();
        }
        if (movies.data && refreshCallbacks.movies) {
          logDebug("Refreshing movies data (debounced)");
          refreshCallbacks.movies();
        }
      }

      // Start background prefetching after screen transitions complete
      const backgroundLoadTask = InteractionManager.runAfterInteractions(() => {
        // Delay background loading to not interfere with initial render and navigation
        setTimeout(() => {
          // Double-check focus state before prefetching
          if (!isFocused) {
            logDebug(
              "Screen lost focus during prefetch delay - canceling prefetch",
            );
            return;
          }

          logDebug("Starting focus-aware background prefetching");

          // Only prefetch if we have data and next pages available
          if (
            recentlyWatched.hasNextPage &&
            !recentlyWatched.isFetching &&
            recentlyWatched.data
          ) {
            prefetchCallbacks.recentlyWatched(2); // Reduced from 3 to 2 for better performance
          }
          if (
            recentlyAdded.hasNextPage &&
            !recentlyAdded.isFetching &&
            recentlyAdded.data
          ) {
            prefetchCallbacks.recentlyAdded(2);
          }
          if (tvShows.hasNextPage && !tvShows.isFetching && tvShows.data) {
            prefetchCallbacks.tvShows(2);
          }
          if (movies.hasNextPage && !movies.isFetching && movies.data) {
            prefetchCallbacks.movies(2);
          }
        }, 2000); // Reduced delay from 3s to 2s
      });

      // Hide backdrop when returning to browse page
      console.log("[BrowsePage] Hiding backdrop on browse page load");
      backdropManager.hide({ fade: true, duration: 1200 });

      // Cleanup function
      return () => {
        logDebug("Screen unfocused - canceling background operations");
        backgroundLoadTask.cancel();
      };
    }, [
      isFocused,
      recentlyWatched.data,
      recentlyWatched.hasNextPage,
      recentlyWatched.isFetching,
      recentlyAdded.data,
      recentlyAdded.hasNextPage,
      recentlyAdded.isFetching,
      tvShows.data,
      tvShows.hasNextPage,
      tvShows.isFetching,
      movies.data,
      movies.hasNextPage,
      movies.isFetching,
      refreshCallbacks,
      prefetchCallbacks,
    ]),
  );

  // Periodic refresh every 10 seconds when screen is focused
  useEffect(() => {
    const PERIODIC_REFRESH_INTERVAL = 10000; // 10 seconds
    let intervalId: NodeJS.Timeout;

    const startPeriodicRefresh = () => {
      intervalId = setInterval(() => {
        // Only refresh if screen is currently focused
        if (!isFocused) {
          logDebug("Periodic refresh skipped - screen not focused");
          return;
        }

        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshRef.current;

        // Only refresh if enough time has passed since last manual refresh
        if (timeSinceLastRefresh >= REFRESH_DEBOUNCE_MS) {
          logDebug("Periodic refresh triggered");
          lastRefreshRef.current = now;

          // Refresh all data sources
          if (recentlyWatched.data && recentlyWatched.refetch) {
            recentlyWatched.refetch();
          }
          if (recentlyAdded.data && recentlyAdded.refetch) {
            recentlyAdded.refetch();
          }
          if (tvShows.data && tvShows.refetch) {
            tvShows.refetch();
          }
          if (movies.data && movies.refetch) {
            movies.refetch();
          }
        }
      }, PERIODIC_REFRESH_INTERVAL);
    };

    // Only start periodic refresh if screen is focused
    if (isFocused) {
      logDebug("Starting periodic refresh - screen is focused");
      startPeriodicRefresh();
    } else {
      logDebug("Skipping periodic refresh - screen not focused");
    }

    // Cleanup interval on unmount or focus change
    return () => {
      if (intervalId) {
        logDebug("Clearing periodic refresh interval");
        clearInterval(intervalId);
      }
    };
  }, [
    isFocused,
    recentlyWatched.data,
    recentlyWatched.refetch,
    recentlyAdded.data,
    recentlyAdded.refetch,
    tvShows.data,
    tvShows.refetch,
    movies.data,
    movies.refetch,
  ]);

  // Shared transformation function to reduce code duplication
  const transformMediaItems = useCallback((items: MediaItem[]) => {
    return items.map((item) => {
      // Create unique ID for TV episodes to avoid conflicts
      const uniqueId =
        item.type === "tv" && item.seasonNumber && item.episodeNumber
          ? `${item.id}-s${item.seasonNumber}-e${item.episodeNumber}`
          : item.id;

      const pairImage = item.thumbnail
        ? {
            // Episodes
            thumbnail: item.thumbnail,
            thumbnailBlurhash: item.thumbnailBlurhash
              ? item.thumbnailBlurhash
              : "",
          }
        : {
            // Everything else
            thumbnail: item.posterURL,
            thumbnailBlurhash: item.posterBlurhash ? item.posterBlurhash : "",
          };

      return {
        id: uniqueId,
        title: item.title,
        description:
          item.type === "tv" && item.episodeNumber && item.seasonNumber
            ? `S${item.seasonNumber}E${item.episodeNumber}`
            : `${item.type.toUpperCase()} • ${item.hdr || "HD"}`,
        thumbnailUrl: pairImage.thumbnail,
        thumbnailBlurhash: pairImage.thumbnailBlurhash,
        showId: item.id,
        // Store raw numbers for TV shows, keep original API data
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        mediaType: item.type,
        link: item.link,
        backdropUrl: item.backdrop,
        hdr: item.hdr,
        logo: item.logo,
      };
    });
  }, []);

  // Memoized data transformations for infinite data
  const transformedRecentlyWatched = useMemo(() => {
    const flattenedData = getFlattenedInfiniteData(recentlyWatched.data);
    return transformMediaItems(flattenedData);
  }, [recentlyWatched.data, transformMediaItems]);

  const transformedRecentlyAdded = useMemo(() => {
    const flattenedData = getFlattenedInfiniteData(recentlyAdded.data);
    return transformMediaItems(flattenedData);
  }, [recentlyAdded.data, transformMediaItems]);

  const transformedTVShows = useMemo(() => {
    const flattenedData = getFlattenedInfiniteData(tvShows.data);
    return transformMediaItems(flattenedData);
  }, [tvShows.data, transformMediaItems]);

  const transformedMovies = useMemo(() => {
    const flattenedData = getFlattenedInfiniteData(movies.data);
    return transformMediaItems(flattenedData);
  }, [movies.data, transformMediaItems]);

  // State for managing TV show season queries
  const [pendingTVNavigation, setPendingTVNavigation] = useState<{
    showId: string;
    mediaType: "tv";
  } | null>(null);

  // Hook to fetch available seasons when a TV show is selected
  const {
    data: rootShowData,
    isLoading: isLoadingRootShow,
    error: rootShowError,
  } = useRootShowData(pendingTVNavigation?.showId || "", !!pendingTVNavigation);

  // Effect to handle navigation once root show data is loaded
  useEffect(() => {
    if (pendingTVNavigation && rootShowData && !isLoadingRootShow) {
      const { showId, mediaType } = pendingTVNavigation;
      const { availableSeasons } = rootShowData;

      // Find the first available season
      const firstAvailableSeason =
        availableSeasons.length > 0 ? Math.min(...availableSeasons) : 1;

      logDebug("Navigating to TV show with first available season:", {
        id: showId,
        type: mediaType,
        season: firstAvailableSeason,
        availableSeasons,
      });

      // Navigate to media info page with the first available season
      router.push(
        {
          pathname: "/media-info/[id]",
          params: {
            id: showId,
            type: mediaType,
            season: firstAvailableSeason,
          },
        },
        {
          dangerouslySingular: true,
        },
      );

      // Clear pending navigation
      setPendingTVNavigation(null);
    }
  }, [pendingTVNavigation, rootShowData, isLoadingRootShow, router]);

  // Effect to handle root show data errors
  useEffect(() => {
    if (pendingTVNavigation && rootShowError && !isLoadingRootShow) {
      const { showId, mediaType } = pendingTVNavigation;

      logDebug(
        "Failed to fetch root show data, falling back to season 1:",
        rootShowError,
      );

      // Fallback to season 1 if we can't get available seasons
      router.push(
        {
          pathname: "/media-info/[id]",
          params: {
            id: showId,
            type: mediaType,
            season: 1,
          },
        },
        {
          dangerouslySingular: true,
        },
      );

      // Clear pending navigation
      setPendingTVNavigation(null);
    }
  }, [pendingTVNavigation, rootShowError, isLoadingRootShow, router]);

  const handleSelectContent = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      // Smart navigation logic based on content type
      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        // Specific episode - go directly to watch (Continue Watching scenario)
        logDebug("Navigating to specific episode:", {
          id: showId,
          type: mediaType,
          season: seasonNumber,
          episode: episodeNumber,
        });

        router.push(
          {
            pathname: "/watch/[id]",
            params: {
              id: showId,
              type: mediaType,
              season: seasonNumber,
              episode: episodeNumber,
              ...(backdropUrl && { backdrop: backdropUrl }),
              ...(backdropBlurhash && { backdropBlurhash }),
            },
          },
          {
            dangerouslySingular: true,
          },
        );
      } else if (mediaType === "tv") {
        // TV show without specific episode - query available seasons first
        logDebug("Querying available seasons for TV show:", {
          id: showId,
          type: mediaType,
        });

        setPendingTVNavigation({ showId, mediaType });
      } else {
        // Movie - go directly to media info page
        logDebug("Navigating to movie media info:", {
          id: showId,
          type: mediaType,
        });

        router.push(
          {
            pathname: "/media-info/[id]",
            params: {
              id: showId,
              type: mediaType,
              ...(backdropUrl && { backdrop: backdropUrl }),
              ...(backdropBlurhash && { backdropBlurhash }),
            },
          },
          {
            dangerouslySingular: true,
          },
        );
      }
    },
    [logDebug, router],
  );

  return (
    <View style={styles.container}>
      {/* Content browser with stepped scrolling */}
      <ScrollView
        style={styles.contentBrowser}
        contentContainerStyle={styles.contentContainer}
        pagingEnabled={false}
        nestedScrollEnabled={true}
        snapToAlignment="center"
      >
        {/* Video preview banner */}
        <TVBanner />

        {/* Recently Watched Section */}
        {recentlyWatched.isLoading ? (
          <View style={styles.loadingSection}>
            <Text style={styles.sectionTitle}>Continue Watching</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : recentlyWatched.error ? (
          <View style={styles.errorSection}>
            <Text style={styles.sectionTitle}>Continue Watching</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedRecentlyWatched.length ? (
          <View style={styles.sectionContainer}>
            <ContentRow
              title="Continue Watching"
              items={transformedRecentlyWatched}
              onSelectContent={handleSelectContent}
              itemSize="small"
              hasNextPage={recentlyWatched.hasNextPage}
              isFetchingNextPage={recentlyWatched.isFetchingNextPage}
              onLoadMore={() => recentlyWatched.fetchNextPage()}
              loadMoreThreshold={0.4}
            />
          </View>
        ) : null}

        {/* Recently Added Section */}
        {recentlyAdded.isLoading ? (
          <View style={styles.loadingSection}>
            <Text style={styles.sectionTitle}>Recently Added</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : recentlyAdded.error ? (
          <View style={styles.errorSection}>
            <Text style={styles.sectionTitle}>Recently Added</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedRecentlyAdded.length ? (
          <View style={styles.sectionContainer}>
            <ContentRow
              title="Recently Added"
              items={transformedRecentlyAdded}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              hasNextPage={recentlyAdded.hasNextPage}
              isFetchingNextPage={recentlyAdded.isFetchingNextPage}
              onLoadMore={() => recentlyAdded.fetchNextPage()}
              loadMoreThreshold={0.4}
            />
          </View>
        ) : null}

        {/* TV Shows Section */}
        {tvShows.isLoading ? (
          <View style={styles.loadingSection}>
            <Text style={styles.sectionTitle}>TV Shows</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : tvShows.error ? (
          <View style={styles.errorSection}>
            <Text style={styles.sectionTitle}>TV Shows</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedTVShows.length ? (
          <View style={styles.sectionContainer}>
            <ContentRow
              title="TV Shows"
              items={transformedTVShows}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              hasNextPage={tvShows.hasNextPage}
              isFetchingNextPage={tvShows.isFetchingNextPage}
              onLoadMore={() => tvShows.fetchNextPage()}
              loadMoreThreshold={0.4}
            />
          </View>
        ) : null}

        {/* Movies Section */}
        {movies.isLoading ? (
          <View style={styles.loadingSection}>
            <Text style={styles.sectionTitle}>Movies</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : movies.error ? (
          <View style={styles.errorSection}>
            <Text style={styles.sectionTitle}>Movies</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedMovies.length ? (
          <View style={styles.sectionContainer}>
            <ContentRow
              title="Movies"
              items={transformedMovies}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              hasNextPage={movies.hasNextPage}
              isFetchingNextPage={movies.isFetchingNextPage}
              onLoadMore={() => movies.fetchNextPage()}
              loadMoreThreshold={0.4}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  contentBrowser: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  errorSection: {
    alignItems: "center",
    marginBottom: 20,
    minHeight: 280, // Consistent section height for stepped scrolling
    paddingVertical: 20,
  },
  errorText: {
    color: "#E50914",
    fontSize: 16,
    textAlign: "center",
  },
  loadingSection: {
    alignItems: "center",
    marginBottom: 20,
    minHeight: 280, // Consistent section height for stepped scrolling
    paddingVertical: 20,
  },
  sectionContainer: {
    marginBottom: 20,
    minHeight: 280, // Consistent section height for stepped scrolling
    paddingVertical: 10,
  },
  sectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
    marginTop: 30,
  },
});
