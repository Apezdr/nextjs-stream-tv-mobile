import { useFocusEffect } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  StyleSheet,
  ScrollView,
  RefreshControl,
  SafeAreaView,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import MobileBanner from "@/src/components/Mobile/Banner/MobileBanner";
import { MobileContentCardData } from "@/src/components/Mobile/Cards/MobileContentCard";
import MobileContentRow from "@/src/components/Mobile/Rows/MobileContentRow";
import { Colors } from "@/src/constants/Colors";
import {
  useInfiniteContentList,
  getFlattenedInfiniteData,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

export default function MobileHomePage() {
  const { show: showBackdrop } = useBackdropManager();

  // Fetch different content types for the home page with infinite scrolling
  const {
    data: recentlyWatchedData,
    isLoading: recentlyWatchedLoading,
    fetchNextPage: fetchNextRecentlyWatched,
    hasNextPage: hasNextRecentlyWatchedPage,
    isFetchingNextPage: isFetchingNextRecentlyWatchedPage,
    refetch: refetchRecentlyWatched,
  } = useInfiniteContentList({
    type: "recentlyWatched",
    limit: 20,
    includeWatchHistory: true,
    isTVdevice: false,
  });

  // Flatten the paginated data
  const recentlyWatchedItems = useMemo(() => {
    return getFlattenedInfiniteData(recentlyWatchedData);
  }, [recentlyWatchedData]);

  // Handle loading more recently watched content
  const handleLoadMoreRecentlyWatched = useCallback(() => {
    if (hasNextRecentlyWatchedPage && !isFetchingNextRecentlyWatchedPage) {
      fetchNextRecentlyWatched();
    }
  }, [
    hasNextRecentlyWatchedPage,
    isFetchingNextRecentlyWatchedPage,
    fetchNextRecentlyWatched,
  ]);

  const {
    data: recentlyAddedData,
    isLoading: recentlyAddedLoading,
    fetchNextPage: fetchNextRecentlyAdded,
    hasNextPage: hasNextRecentlyAddedPage,
    isFetchingNextPage: isFetchingNextRecentlyAddedPage,
    refetch: refetchRecentlyAdded,
  } = useInfiniteContentList({
    type: "recentlyAdded",
    limit: 20,
    includeWatchHistory: true,
    isTVdevice: false,
  });

  // Flatten the paginated data
  const recentlyAddedItems = useMemo(() => {
    return getFlattenedInfiniteData(recentlyAddedData);
  }, [recentlyAddedData]);

  // Handle loading more recently added content
  const handleLoadMoreRecentlyAdded = useCallback(() => {
    if (hasNextRecentlyAddedPage && !isFetchingNextRecentlyAddedPage) {
      fetchNextRecentlyAdded();
    }
  }, [
    hasNextRecentlyAddedPage,
    isFetchingNextRecentlyAddedPage,
    fetchNextRecentlyAdded,
  ]);

  // Use infinite query for movies with pagination support
  const {
    data: moviesData,
    isLoading: moviesLoading,
    fetchNextPage: fetchNextMovies,
    hasNextPage: hasNextMoviesPage,
    isFetchingNextPage: isFetchingNextMoviesPage,
    refetch: refetchMovies,
  } = useInfiniteContentList({
    type: "movie",
    limit: 20,
    includeWatchHistory: true,
    isTVdevice: false,
  });

  // Flatten the paginated data
  const movies = useMemo(() => {
    return getFlattenedInfiniteData(moviesData);
  }, [moviesData]);

  // Handle loading more movies
  const handleLoadMoreMovies = useCallback(() => {
    if (hasNextMoviesPage && !isFetchingNextMoviesPage) {
      fetchNextMovies();
    }
  }, [hasNextMoviesPage, isFetchingNextMoviesPage, fetchNextMovies]);

  // Use infinite query for TV shows with pagination support
  const {
    data: tvShowsData,
    isLoading: tvShowsLoading,
    fetchNextPage: fetchNextTvShows,
    hasNextPage: hasNextTvShowsPage,
    isFetchingNextPage: isFetchingNextTvShowsPage,
    refetch: refetchTvShows,
  } = useInfiniteContentList({
    type: "tv",
    limit: 20,
    includeWatchHistory: true,
    isTVdevice: false,
  });

  // Flatten the paginated data
  const tvShows = useMemo(() => {
    return getFlattenedInfiniteData(tvShowsData);
  }, [tvShowsData]);

  // Handle loading more TV shows
  const handleLoadMoreTvShows = useCallback(() => {
    if (hasNextTvShowsPage && !isFetchingNextTvShowsPage) {
      fetchNextTvShows();
    }
  }, [hasNextTvShowsPage, isFetchingNextTvShowsPage, fetchNextTvShows]);

  // Convert MediaItem to MobileContentCardData
  const transformMediaItems = useCallback(
    (items: MediaItem[] = []): MobileContentCardData[] => {
      return items.map((item) => ({
        id: item.id,
        title: item.title,
        thumbnailUrl: item.posterURL,
        thumbnailBlurhash: item.posterBlurhash,
        backdropUrl: item.backdrop,
        backdropBlurhash: item.backdropBlurhash,
        mediaType: item.type,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        showId: item.id,
        hdr: item.hdr,
        logo: item.logo,
      }));
    },
    [],
  );

  // Handle play content - direct to watch page
  const handlePlayContent = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      // Show backdrop immediately for smooth transition
      if (backdropUrl) {
        showBackdrop(backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: backdropBlurhash,
        });
      }

      // Navigate directly to watch page
      navigationHelper.navigateToWatch({
        id: showId,
        type: mediaType,
        ...(seasonNumber && { season: seasonNumber }),
        ...(episodeNumber && { episode: episodeNumber }),
        ...(backdropUrl && { backdrop: backdropUrl }),
        ...(backdropBlurhash && { backdropBlurhash }),
      });
    },
    [showBackdrop],
  );

  // Handle info content - navigate to appropriate info page
  const handleInfoContent = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      // Show backdrop immediately for smooth transition
      if (backdropUrl) {
        showBackdrop(backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: backdropBlurhash,
        });
      }

      // Navigate to appropriate info page
      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        // Episode - go to episode info page
        navigationHelper.navigateToEpisodeInfo({
          showId,
          season: seasonNumber,
          episode: episodeNumber,
        });
      } else {
        // Movie or TV show - go to media info page
        navigationHelper.navigateToMediaInfo({
          id: showId,
          type: mediaType,
          ...(seasonNumber && { season: seasonNumber }),
        });
      }
    },
    [showBackdrop],
  );

  // Handle "See All" navigation
  const handleSeeAllMovies = useCallback(() => {
    navigationHelper.navigateToTab("movies");
  }, []);

  const handleSeeAllShows = useCallback(() => {
    navigationHelper.navigateToTab("shows");
  }, []);

  // Pull to refresh
  const isRefreshing =
    recentlyWatchedLoading ||
    recentlyAddedLoading ||
    moviesLoading ||
    tvShowsLoading ||
    isFetchingNextRecentlyWatchedPage ||
    isFetchingNextRecentlyAddedPage ||
    isFetchingNextMoviesPage ||
    isFetchingNextTvShowsPage;

  const handleRefresh = useCallback(() => {
    refetchRecentlyWatched();
    refetchRecentlyAdded();
    refetchMovies();
    refetchTvShows();
  }, [
    refetchRecentlyWatched,
    refetchRecentlyAdded,
    refetchMovies,
    refetchTvShows,
  ]);

  // Focus-aware data refresh - refetch data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Refresh all data when screen becomes focused for fresh content
      handleRefresh();
    }, [handleRefresh]),
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.dark.brandPrimary}
              colors={[Colors.dark.brandPrimary]}
            />
          }
        >
          {/* Featured Banner with gesture control */}
          <View style={{ flex: 1 }}>
            <MobileBanner />
          </View>
          {/* Continue Watching with infinite scrolling */}
          {recentlyWatchedItems && recentlyWatchedItems.length > 0 && (
            <MobileContentRow
              title="Continue Watching"
              data={transformMediaItems(recentlyWatchedItems)}
              onPlayContent={handlePlayContent}
              onInfoContent={handleInfoContent}
              cardSize="medium"
              loading={recentlyWatchedLoading}
              hasNextPage={hasNextRecentlyWatchedPage}
              isFetchingNextPage={isFetchingNextRecentlyWatchedPage}
              onLoadMore={handleLoadMoreRecentlyWatched}
            />
          )}

          {/* Recently Added with infinite scrolling */}
          <MobileContentRow
            title="Recently Added"
            data={transformMediaItems(recentlyAddedItems)}
            onPlayContent={handlePlayContent}
            onInfoContent={handleInfoContent}
            cardSize="medium"
            loading={recentlyAddedLoading}
            hasNextPage={hasNextRecentlyAddedPage}
            isFetchingNextPage={isFetchingNextRecentlyAddedPage}
            onLoadMore={handleLoadMoreRecentlyAdded}
          />

          {/* Movies with infinite scrolling */}
          <MobileContentRow
            title="Movies"
            data={transformMediaItems(movies)}
            onPlayContent={handlePlayContent}
            onInfoContent={handleInfoContent}
            cardSize="medium"
            showMoreButton
            onShowMore={handleSeeAllMovies}
            loading={moviesLoading}
            hasNextPage={hasNextMoviesPage}
            isFetchingNextPage={isFetchingNextMoviesPage}
            onLoadMore={handleLoadMoreMovies}
          />

          {/* TV Shows with infinite scrolling */}
          <MobileContentRow
            title="TV Shows"
            data={transformMediaItems(tvShows)}
            onPlayContent={handlePlayContent}
            onInfoContent={handleInfoContent}
            cardSize="medium"
            showMoreButton
            onShowMore={handleSeeAllShows}
            loading={tvShowsLoading}
            hasNextPage={hasNextTvShowsPage}
            isFetchingNextPage={isFetchingNextTvShowsPage}
            onLoadMore={handleLoadMoreTvShows}
          />
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  scrollView: {
    flex: 1,
  },
});
