import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  ActivityIndicator,
  TVEventHandler,
  InteractionManager,
  DeviceEventEmitter,
} from "react-native";

import TVBanner from "@/src/components/TV/Banner/TVBanner";
import ContentRow from "@/src/components/Video/ContentRow";
import { Colors } from "@/src/constants/Colors";
import {
  MINIMIZED_WIDTH,
  EXPANDED_WIDTH,
} from "@/src/constants/SidebarConstants";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import {
  useInfiniteContentList,
  getFlattenedInfiniteData,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { useRootShowData } from "@/src/data/hooks/useContent";
import { MediaItem } from "@/src/data/types/content.types";

export default function TVHomePage() {
  const { currentMode, setMode } = useTVAppState();
  const router = useRouter();

  // State for tracking sidebar state changes via custom events
  const [sidebarState, setSidebarState] = useState<
    "closed" | "minimized" | "expanded"
  >("minimized");

  // Listen for sidebar state changes via custom events
  useEffect(() => {
    const handleSidebarStateChange = (
      state: "closed" | "minimized" | "expanded",
    ) => {
      setSidebarState(state);
    };

    // Listen for custom sidebar state events using React Native's DeviceEventEmitter
    const subscription = DeviceEventEmitter.addListener(
      "sidebarStateChange",
      handleSidebarStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // Ensure we're in browse mode when this page loads
  useEffect(() => {
    if (currentMode !== "browse") {
      setMode("browse");
    }
  }, [currentMode, setMode]);

  // Refs for stepped scrolling
  const scrollViewRef = useRef<ScrollView>(null);
  const currentScrollIndexRef = useRef(0);
  const contentSectionsRef = useRef<number[]>([]);
  const isScrollingRef = useRef(false);

  // Step size for scrolling (height of one content section)
  const SCROLL_STEP_SIZE = 320; // Approximate height of banner + one content row

  // State only for visual focus indicators
  const [focusedSectionIndex, setFocusedSectionIndex] = useState(0);

  // Calculate dynamic left margin based on sidebar state
  const getContentMarginLeft = useCallback(() => {
    switch (sidebarState) {
      case "closed":
        return 0;
      case "minimized":
        return MINIMIZED_WIDTH;
      case "expanded":
        return EXPANDED_WIDTH;
      default:
        return 0;
    }
  }, [sidebarState]);

  // API hooks with optimized settings
  const recentlyWatched = useInfiniteContentList({
    type: "recentlyWatched",
    sort: "date",
    sortOrder: "desc",
    limit: 50, // Larger batches for fewer requests
  });
  const recentlyAdded = useInfiniteContentList({
    type: "recentlyAdded",
    sort: "date",
    sortOrder: "desc",
    limit: 50,
  });
  const movies = useInfiniteContentList({
    type: "movie",
    sort: "title",
    sortOrder: "asc",
    limit: 50,
  });
  const tvShows = useInfiniteContentList({
    type: "tv",
    sort: "title",
    sortOrder: "asc",
    limit: 50,
  });

  // Focus-aware background prefetching optimization
  useFocusEffect(
    useCallback(() => {
      console.log(
        "[TVHomePage] Screen focused - optimizing background loading",
      );

      // Start background prefetching after screen transitions complete
      const backgroundLoadTask = InteractionManager.runAfterInteractions(() => {
        // Delay background loading to not interfere with initial render and navigation
        setTimeout(() => {
          console.log(
            "[TVHomePage] Starting focus-aware background prefetching",
          );

          // Only prefetch if we have data and next pages available
          if (
            recentlyWatched.hasNextPage &&
            !recentlyWatched.isFetching &&
            recentlyWatched.data
          ) {
            recentlyWatched.prefetchBulk(2); // Reduced from 3 to 2 for better performance
          }
          if (
            recentlyAdded.hasNextPage &&
            !recentlyAdded.isFetching &&
            recentlyAdded.data
          ) {
            recentlyAdded.prefetchBulk(2);
          }
          if (tvShows.hasNextPage && !tvShows.isFetching && tvShows.data) {
            tvShows.prefetchBulk(2);
          }
          if (movies.hasNextPage && !movies.isFetching && movies.data) {
            movies.prefetchBulk(2);
          }
        }, 2000); // Reduced delay from 3s to 2s
      });

      // Cleanup function
      return () => {
        console.log(
          "[TVHomePage] Screen unfocused - canceling background operations",
        );
        backgroundLoadTask.cancel();
      };
    }, [
      recentlyWatched.prefetchBulk,
      recentlyWatched.hasNextPage,
      recentlyWatched.isFetching,
      recentlyWatched.data,
      recentlyAdded.prefetchBulk,
      recentlyAdded.hasNextPage,
      recentlyAdded.isFetching,
      recentlyAdded.data,
      movies.prefetchBulk,
      movies.hasNextPage,
      movies.isFetching,
      movies.data,
      tvShows.prefetchBulk,
      tvShows.hasNextPage,
      tvShows.isFetching,
      tvShows.data,
    ]),
  );

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
        videoLink: item.link,
        backdropUrl: item.backdrop,
        hdr: item.hdr,
        logoUrl: item.logo,
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

      console.log("Navigating to TV show with first available season:", {
        id: showId,
        type: mediaType,
        season: firstAvailableSeason,
        availableSeasons,
      });

      // Navigate to media info page with the first available season
      router.push({
        pathname: "/media-info/[id]",
        params: {
          id: showId,
          type: mediaType,
          season: firstAvailableSeason,
        },
      });

      // Clear pending navigation
      setPendingTVNavigation(null);
    }
  }, [pendingTVNavigation, rootShowData, isLoadingRootShow, router]);

  // Effect to handle root show data errors
  useEffect(() => {
    if (pendingTVNavigation && rootShowError && !isLoadingRootShow) {
      const { showId, mediaType } = pendingTVNavigation;

      console.warn(
        "Failed to fetch root show data, falling back to season 1:",
        rootShowError,
      );

      // Fallback to season 1 if we can't get available seasons
      router.push({
        pathname: "/media-info/[id]",
        params: {
          id: showId,
          type: mediaType,
          season: 1,
        },
      });

      // Clear pending navigation
      setPendingTVNavigation(null);
    }
  }, [pendingTVNavigation, rootShowError, isLoadingRootShow, router]);

  const handleSelectContent = useCallback(
    (
      showId: string,
      seasonNumber: number | undefined,
      episodeNumber: number | undefined,
      mediaType: "movie" | "tv",
    ) => {
      // Smart navigation logic based on content type
      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        // Specific episode - go directly to watch (Continue Watching scenario)
        console.log("Navigating to specific episode:", {
          id: showId,
          type: mediaType,
          season: seasonNumber,
          episode: episodeNumber,
        });

        router.push({
          pathname: "/watch/[id]",
          params: {
            id: showId,
            type: mediaType,
            season: seasonNumber,
            episode: episodeNumber,
          },
        });
      } else if (mediaType === "tv") {
        // TV show without specific episode - query available seasons first
        console.log("Querying available seasons for TV show:", {
          id: showId,
          type: mediaType,
        });

        setPendingTVNavigation({ showId, mediaType });
      } else {
        // Movie - go directly to media info page
        console.log("Navigating to movie media info:", {
          id: showId,
          type: mediaType,
        });

        router.push({
          pathname: "/media-info/[id]",
          params: {
            id: showId,
            type: mediaType,
          },
        });
      }
    },
    [router],
  );

  // Handle TV remote navigation for stepped scrolling
  useEffect(() => {
    const handleTVEvent = (evt: any) => {
      if (evt && (evt.eventType === "up" || evt.eventType === "down")) {
        // Prevent rapid clicking from stalling the scroll
        if (isScrollingRef.current) return true;

        const direction = evt.eventType === "up" ? -1 : 1;
        handleSteppedScroll(direction);
        return true; // Prevent default scrolling
      }
      return false;
    };

    const subscription = TVEventHandler.addListener(handleTVEvent);

    return () => {
      subscription?.remove();
    };
  }, []);

  // Calculate content section positions and create section mapping
  const sectionMapping = useMemo(() => {
    const mapping: { [key: string]: number } = {};
    let sectionIndex = 0;

    // Banner is always section 0
    mapping.banner = sectionIndex++;

    // Add sections based on available content
    if (transformedRecentlyWatched.length > 0) {
      mapping.recentlyWatched = sectionIndex++;
    }
    if (transformedRecentlyAdded.length > 0) {
      mapping.recentlyAdded = sectionIndex++;
    }
    if (transformedTVShows.length > 0) {
      mapping.tvShows = sectionIndex++;
    }
    if (transformedMovies.length > 0) {
      mapping.movies = sectionIndex++;
    }

    return mapping;
  }, [
    transformedRecentlyWatched.length,
    transformedRecentlyAdded.length,
    transformedTVShows.length,
    transformedMovies.length,
  ]);

  // Calculate content section positions using refs
  useEffect(() => {
    const sections: number[] = [0]; // Start with banner at top
    let currentPosition = SCROLL_STEP_SIZE;

    // Add positions for each content section that has data
    if (transformedRecentlyWatched.length > 0) {
      sections.push(currentPosition);
      currentPosition += SCROLL_STEP_SIZE;
    }
    if (transformedRecentlyAdded.length > 0) {
      sections.push(currentPosition);
      currentPosition += SCROLL_STEP_SIZE;
    }
    if (transformedTVShows.length > 0) {
      sections.push(currentPosition);
      currentPosition += SCROLL_STEP_SIZE;
    }
    if (transformedMovies.length > 0) {
      sections.push(currentPosition);
      currentPosition += SCROLL_STEP_SIZE;
    }

    contentSectionsRef.current = sections;
  }, [
    transformedRecentlyWatched.length,
    transformedRecentlyAdded.length,
    transformedTVShows.length,
    transformedMovies.length,
  ]);

  // Handle stepped scrolling using refs for smooth performance
  const handleSteppedScroll = useCallback((direction: number) => {
    if (
      !scrollViewRef.current ||
      contentSectionsRef.current.length === 0 ||
      isScrollingRef.current
    ) {
      return;
    }

    const newIndex = Math.max(
      0,
      Math.min(
        contentSectionsRef.current.length - 1,
        currentScrollIndexRef.current + direction,
      ),
    );

    if (newIndex !== currentScrollIndexRef.current) {
      isScrollingRef.current = true;
      currentScrollIndexRef.current = newIndex;

      // Update visual focus immediately
      setFocusedSectionIndex(newIndex);

      const targetY = contentSectionsRef.current[newIndex];

      scrollViewRef.current.scrollTo({
        y: targetY,
        animated: true,
      });

      // Reset scrolling state after animation completes
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 300);
    }
  }, []);

  // Manual scroll handlers for testing/fallback
  const scrollToSection = useCallback((sectionIndex: number) => {
    if (
      !scrollViewRef.current ||
      !contentSectionsRef.current[sectionIndex] ||
      isScrollingRef.current
    ) {
      return;
    }

    isScrollingRef.current = true;
    currentScrollIndexRef.current = sectionIndex;
    setFocusedSectionIndex(sectionIndex);

    scrollViewRef.current.scrollTo({
      y: contentSectionsRef.current[sectionIndex],
      animated: true,
    });

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 300);
  }, []);

  return (
    <View style={styles.container}>
      {/* Content browser with stepped scrolling */}
      <ScrollView
        ref={scrollViewRef}
        style={[styles.contentBrowser, { marginLeft: getContentMarginLeft() }]}
        contentContainerStyle={styles.contentContainer}
        pagingEnabled={false}
        onMomentumScrollEnd={(event) => {
          // Snap to nearest section when manual scrolling ends
          const scrollY = event.nativeEvent.contentOffset.y;
          const nearestIndex = contentSectionsRef.current.reduce(
            (closest, sectionY, index) => {
              return Math.abs(sectionY - scrollY) <
                Math.abs(contentSectionsRef.current[closest] - scrollY)
                ? index
                : closest;
            },
            0,
          );

          if (
            nearestIndex !== currentScrollIndexRef.current &&
            !isScrollingRef.current
          ) {
            currentScrollIndexRef.current = nearestIndex;
            setFocusedSectionIndex(nearestIndex);
            scrollViewRef.current?.scrollTo({
              y: contentSectionsRef.current[nearestIndex],
              animated: true,
            });
          }
        }}
      >
        {/* Video preview banner */}
        <TVBanner />

        {/* Recently Watched Section */}
        {recentlyWatched.isLoading ? (
          <View
            style={[
              styles.loadingSection,
              focusedSectionIndex === sectionMapping.recentlyWatched &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>Continue Watching</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : recentlyWatched.error ? (
          <View
            style={[
              styles.errorSection,
              focusedSectionIndex === sectionMapping.recentlyWatched &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>Continue Watching</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedRecentlyWatched.length ? (
          <View
            style={[
              styles.sectionContainer,
              focusedSectionIndex === sectionMapping.recentlyWatched &&
                styles.focusedSection,
            ]}
          >
            <ContentRow
              title="Continue Watching"
              items={transformedRecentlyWatched}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              refreshing={recentlyWatched.isRefetching}
              hasNextPage={recentlyWatched.hasNextPage}
              isFetchingNextPage={recentlyWatched.isFetchingNextPage}
              onLoadMore={() => recentlyWatched.fetchNextPage()}
              onPrefetch={() => recentlyWatched.prefetchNext()}
              onPrefetchMultiple={(distance) =>
                recentlyWatched.prefetchMultiple(distance)
              }
              onPrefetchBulk={(maxPages) =>
                recentlyWatched.prefetchBulk(maxPages)
              }
              loadMoreThreshold={0.4}
              prefetchThreshold={0.2}
            />
          </View>
        ) : null}

        {/* Recently Added Section */}
        {recentlyAdded.isLoading ? (
          <View
            style={[
              styles.loadingSection,
              focusedSectionIndex === sectionMapping.recentlyAdded &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>Recently Added</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : recentlyAdded.error ? (
          <View
            style={[
              styles.errorSection,
              focusedSectionIndex === sectionMapping.recentlyAdded &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>Recently Added</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedRecentlyAdded.length ? (
          <View
            style={[
              styles.sectionContainer,
              focusedSectionIndex === sectionMapping.recentlyAdded &&
                styles.focusedSection,
            ]}
          >
            <ContentRow
              title="Recently Added"
              items={transformedRecentlyAdded}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              refreshing={recentlyAdded.isRefetching}
              hasNextPage={recentlyAdded.hasNextPage}
              isFetchingNextPage={recentlyAdded.isFetchingNextPage}
              onLoadMore={() => recentlyAdded.fetchNextPage()}
              onPrefetch={() => recentlyAdded.prefetchNext()}
              onPrefetchMultiple={(distance) =>
                recentlyAdded.prefetchMultiple(distance)
              }
              onPrefetchBulk={(maxPages) =>
                recentlyAdded.prefetchBulk(maxPages)
              }
              loadMoreThreshold={0.4}
              prefetchThreshold={0.2}
            />
          </View>
        ) : null}

        {/* TV Shows Section */}
        {tvShows.isLoading ? (
          <View
            style={[
              styles.loadingSection,
              focusedSectionIndex === sectionMapping.tvShows &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>TV Shows</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : tvShows.error ? (
          <View
            style={[
              styles.errorSection,
              focusedSectionIndex === sectionMapping.tvShows &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>TV Shows</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedTVShows.length ? (
          <View
            style={[
              styles.sectionContainer,
              focusedSectionIndex === sectionMapping.tvShows &&
                styles.focusedSection,
            ]}
          >
            <ContentRow
              title="TV Shows"
              items={transformedTVShows}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              refreshing={tvShows.isRefetching}
              hasNextPage={tvShows.hasNextPage}
              isFetchingNextPage={tvShows.isFetchingNextPage}
              onLoadMore={() => tvShows.fetchNextPage()}
              onPrefetch={() => tvShows.prefetchNext()}
              onPrefetchMultiple={(distance) =>
                tvShows.prefetchMultiple(distance)
              }
              onPrefetchBulk={(maxPages) => tvShows.prefetchBulk(maxPages)}
              loadMoreThreshold={0.4}
              prefetchThreshold={0.2}
            />
          </View>
        ) : null}

        {/* Movies Section */}
        {movies.isLoading ? (
          <View
            style={[
              styles.loadingSection,
              focusedSectionIndex === sectionMapping.movies &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>Movies</Text>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : movies.error ? (
          <View
            style={[
              styles.errorSection,
              focusedSectionIndex === sectionMapping.movies &&
                styles.focusedSection,
            ]}
          >
            <Text style={styles.sectionTitle}>Movies</Text>
            <Text style={styles.errorText}>Failed to load content</Text>
          </View>
        ) : transformedMovies.length ? (
          <View
            style={[
              styles.sectionContainer,
              focusedSectionIndex === sectionMapping.movies &&
                styles.focusedSection,
            ]}
          >
            <ContentRow
              title="Movies"
              items={transformedMovies}
              onSelectContent={handleSelectContent}
              itemSize="medium"
              refreshing={movies.isRefetching}
              hasNextPage={movies.hasNextPage}
              isFetchingNextPage={movies.isFetchingNextPage}
              onLoadMore={() => movies.fetchNextPage()}
              onPrefetch={() => movies.prefetchNext()}
              onPrefetchMultiple={(distance) =>
                movies.prefetchMultiple(distance)
              }
              onPrefetchBulk={(maxPages) => movies.prefetchBulk(maxPages)}
              loadMoreThreshold={0.4}
              prefetchThreshold={0.2}
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
    paddingTop: 30,
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
  focusedSection: {
    borderLeftWidth: 4,
    borderLeftColor: "#E50914",
    paddingLeft: 16,
    marginLeft: -20,
    backgroundColor: "rgba(229, 9, 20, 0.1)", // Subtle red background
    borderRadius: 8,
  },
  loadingSection: {
    alignItems: "center",
    marginBottom: 20,
    minHeight: 280, // Consistent section height for stepped scrolling
    paddingVertical: 20,
  },
  sectionContainer: {
    minHeight: 280, // Consistent section height for stepped scrolling
    marginBottom: 20,
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
