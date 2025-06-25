import { useRouter } from "expo-router";
import { useCallback, useMemo, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Text,
  ActivityIndicator,
} from "react-native";

import {
  MINIMIZED_WIDTH,
  EXPANDED_WIDTH,
} from "@/src/components/TV/Navigation/TVSidebar";
import ContentRow from "@/src/components/Video/ContentRow";
import { Colors } from "@/src/constants/Colors";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import {
  useInfiniteContentList,
  getFlattenedInfiniteData,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { MediaItem } from "@/src/data/types/content.types";

export default function TVHomePage() {
  const { currentVideo, sidebarState } = useTVAppState();
  const router = useRouter();

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

  // API hooks with ultra-aggressive settings
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

  // Background bulk loading on mount for ultra-aggressive caching
  useEffect(() => {
    const startBackgroundLoading = () => {
      // Delay background loading to not interfere with initial render
      setTimeout(() => {
        if (recentlyWatched.hasNextPage) {
          recentlyWatched.prefetchBulk(3);
        }
        if (recentlyAdded.hasNextPage) {
          recentlyAdded.prefetchBulk(3);
        }
        if (tvShows.hasNextPage) {
          tvShows.prefetchBulk(3);
        }
        if (movies.hasNextPage) {
          movies.prefetchBulk(3);
        }
      }, 2000); // Start aggressive background loading after 2 seconds
    };

    startBackgroundLoading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recentlyWatched.hasNextPage,
    recentlyWatched.prefetchBulk,
    recentlyAdded.hasNextPage,
    recentlyAdded.prefetchBulk,
    tvShows.hasNextPage,
    tvShows.prefetchBulk,
    movies.hasNextPage,
    movies.prefetchBulk,
  ]);

  // Shared transformation function to reduce code duplication
  const transformMediaItems = useCallback((items: MediaItem[]) => {
    return items.map((item) => {
      let seasonId = "1";
      let episodeId = "S01E01";

      if (item.type === "tv" && item.seasonNumber && item.episodeNumber) {
        seasonId = item.seasonNumber.toString();
        const paddedSeason = item.seasonNumber.toString().padStart(2, "0");
        const paddedEpisode = item.episodeNumber.toString().padStart(2, "0");
        episodeId = `S${paddedSeason}E${paddedEpisode}`;
      }

      const uniqueId =
        item.type === "tv" && item.seasonNumber && item.episodeNumber
          ? `${item.id}-s${item.seasonNumber}-e${item.episodeNumber}`
          : item.id;

      return {
        id: uniqueId,
        title: item.title,
        description:
          item.type === "tv" && item.episodeNumber && item.seasonNumber
            ? `S${item.seasonNumber}E${item.episodeNumber}`
            : `${item.type.toUpperCase()} • ${item.hdr || "HD"}`,
        thumbnailUrl: item.posterURL,
        showId: item.id,
        seasonId: seasonId,
        episodeId: episodeId,
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

  const handleSelectContent = useCallback(
    (
      showId: string,
      seasonId: string,
      episodeId: string,
      mediaType: "movie" | "tv",
    ) => {
      // Build params object directly using the passed parameters
      // Ensure id is string | number and params matches expected type
      const routeParams: {
        id: string | number;
        type: string;
        season?: string;
        episode?: string;
      } = {
        id: showId,
        type: mediaType,
      };

      // For TV shows, include season and episode information
      if (mediaType === "tv") {
        routeParams.season = seasonId;
        routeParams.episode = episodeId;
      }

      console.log("Navigating to watch:", routeParams);

      router.push({
        pathname: "/watch/[id]",
        params: routeParams,
      });
    },
    [router],
  );

  // Video preview banner component
  const VideoPreviewBanner = useCallback(() => {
    if (!currentVideo) {
      return (
        <View style={styles.bannerPlaceholder}>
          <Text style={styles.bannerPlaceholderText}>
            Select content to see preview
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.videoBanner}>
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle}>{currentVideo.title}</Text>
          {currentVideo.description && (
            <Text style={styles.videoDescription}>
              {currentVideo.description}
            </Text>
          )}
        </View>
      </View>
    );
  }, [currentVideo]);

  return (
    <View style={styles.container}>
      {/* Video preview banner */}
      <View
        style={[
          styles.videoBannerContainer,
          { marginLeft: getContentMarginLeft() },
        ]}
      >
        <VideoPreviewBanner />
      </View>

      {/* Content browser */}
      <ScrollView
        style={[styles.contentBrowser, { marginLeft: getContentMarginLeft() }]}
        contentContainerStyle={styles.contentContainer}
      >
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
            onPrefetchBulk={(maxPages) => recentlyAdded.prefetchBulk(maxPages)}
            loadMoreThreshold={0.4}
            prefetchThreshold={0.2}
          />
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
            onPrefetchMultiple={(distance) => movies.prefetchMultiple(distance)}
            onPrefetchBulk={(maxPages) => movies.prefetchBulk(maxPages)}
            loadMoreThreshold={0.4}
            prefetchThreshold={0.2}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerPlaceholder: {
    alignItems: "center",
    backgroundColor: "#222",
    height: 200,
    justifyContent: "center",
    width: "100%",
  },
  bannerPlaceholderText: {
    color: "#666",
    fontSize: 16,
  },
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  contentBrowser: {
    flex: 1,
    marginTop: 200, // Space for the banner
  },
  contentContainer: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  errorSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  errorText: {
    color: "#E50914",
    fontSize: 16,
    textAlign: "center",
  },
  loadingSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  sectionTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
    marginTop: 30,
  },
  videoBanner: {
    alignItems: "flex-start",
    backgroundColor: Colors.dark.inputBackground,
    height: 200,
    justifyContent: "flex-end",
    padding: 20,
    width: "100%",
  },
  videoBannerContainer: {
    height: 200,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1, // This will be overridden by marginLeft
  },
  videoDescription: {
    color: "#CCCCCC",
    fontSize: 16,
  },
  videoInfo: {
    flex: 1,
    justifyContent: "flex-end",
  },
  videoTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
});
