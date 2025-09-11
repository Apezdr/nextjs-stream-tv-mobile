import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
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
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

export default function MobileHomePage() {
  const { show: showBackdrop } = useBackdropManager();

  // Fetch different content types for the home page
  const {
    data: recentlyWatched,
    isLoading: recentlyWatchedLoading,
    refetch: refetchRecentlyWatched,
  } = useQuery({
    queryKey: [
      "content",
      "recentlyWatched",
      { type: "recentlyWatched", limit: 20 },
    ],
    queryFn: () =>
      contentService.getContentList({
        type: "recentlyWatched",
        limit: 20,
        includeWatchHistory: true,
        isTVdevice: false,
      }),
    refetchInterval: 8000, // Refetch every 8 seconds
    refetchIntervalInBackground: true, // Continue refetching when app is in background
  });

  const {
    data: recentlyAdded,
    isLoading: recentlyAddedLoading,
    refetch: refetchRecentlyAdded,
  } = useQuery({
    queryKey: [
      "content",
      "recentlyAdded",
      { type: "recentlyAdded", limit: 20 },
    ],
    queryFn: () =>
      contentService.getContentList({
        type: "recentlyAdded",
        limit: 20,
        includeWatchHistory: true,
        isTVdevice: false,
      }),
    refetchInterval: 8000, // Refetch every 8 seconds
    refetchIntervalInBackground: true, // Continue refetching when app is in background
  });

  const {
    data: movies,
    isLoading: moviesLoading,
    refetch: refetchMovies,
  } = useQuery({
    queryKey: ["content", "movies", { type: "movie", limit: 20 }],
    queryFn: () =>
      contentService.getContentList({
        type: "movie",
        limit: 20,
        includeWatchHistory: true,
        isTVdevice: false,
      }),
    refetchInterval: 8000, // Refetch every 8 seconds
    refetchIntervalInBackground: true, // Continue refetching when app is in background
  });

  const {
    data: tvShows,
    isLoading: tvShowsLoading,
    refetch: refetchTvShows,
  } = useQuery({
    queryKey: ["content", "tvShows", { type: "tv", limit: 20 }],
    queryFn: () =>
      contentService.getContentList({
        type: "tv",
        limit: 20,
        includeWatchHistory: true,
        isTVdevice: false,
      }),
    refetchInterval: 8000, // Refetch every 8 seconds
    refetchIntervalInBackground: true, // Continue refetching when app is in background
  });

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
    tvShowsLoading;

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
          {/* Continue Watching */}
          {recentlyWatched?.currentItems &&
            recentlyWatched.currentItems.length > 0 && (
              <MobileContentRow
                title="Continue Watching"
                data={transformMediaItems(recentlyWatched.currentItems)}
                onPlayContent={handlePlayContent}
                onInfoContent={handleInfoContent}
                cardSize="medium"
                loading={recentlyWatchedLoading}
              />
            )}

          {/* Recently Added */}
          <MobileContentRow
            title="Recently Added"
            data={transformMediaItems(recentlyAdded?.currentItems)}
            onPlayContent={handlePlayContent}
            onInfoContent={handleInfoContent}
            cardSize="medium"
            loading={recentlyAddedLoading}
          />

          {/* Movies */}
          <MobileContentRow
            title="Movies"
            data={transformMediaItems(movies?.currentItems)}
            onPlayContent={handlePlayContent}
            onInfoContent={handleInfoContent}
            cardSize="medium"
            showMoreButton
            onShowMore={handleSeeAllMovies}
            loading={moviesLoading}
          />

          {/* TV Shows */}
          <MobileContentRow
            title="TV Shows"
            data={transformMediaItems(tvShows?.currentItems)}
            onPlayContent={handlePlayContent}
            onInfoContent={handleInfoContent}
            cardSize="medium"
            showMoreButton
            onShowMore={handleSeeAllShows}
            loading={tvShowsLoading}
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
