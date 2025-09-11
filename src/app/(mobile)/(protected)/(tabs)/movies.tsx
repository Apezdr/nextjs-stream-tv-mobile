import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileContentCardData } from "@/src/components/Mobile/Cards/MobileContentCard";
import MobileContentList from "@/src/components/Mobile/Lists/MobileContentList";
import MobileContentRow from "@/src/components/Mobile/Rows/MobileContentRow";
import { Colors } from "@/src/constants/Colors";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

type ViewMode = "genres" | "all";
type SortOption = "newest" | "title" | "rating";

export default function MoviesPage() {
  const router = useRouter();
  const { show: showBackdrop } = useBackdropManager();
  const [viewMode, setViewMode] = useState<ViewMode>("genres");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const insets = useSafeAreaInsets();

  // Fetch movie genres
  const { data: genresData, isLoading: genresLoading } = useQuery({
    queryKey: ["genres", "movies"],
    queryFn: () =>
      contentService.getGenresList({ type: "movie", includeCounts: true }),
  });

  // Fetch all movies with infinite scroll
  const {
    data: allMoviesData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: allMoviesLoading,
    refetch: refetchAllMovies,
  } = useInfiniteQuery({
    queryKey: ["content", "allMovies", { type: "movie", sort: sortBy }],
    queryFn: ({ pageParam = 0 }) =>
      contentService.getContentList({
        type: "movie",
        page: pageParam as number,
        limit: 20,
        sort: "id",
        sortOrder: sortBy === "newest" ? "desc" : "asc",
        includeWatchHistory: true,
        isTVdevice: false,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage?.nextItem) {
        return allPages.length;
      }
      return undefined;
    },
    enabled: viewMode === "all",
  });

  // Fetch movies by genre
  const genreMoviesQueries = useQuery({
    queryKey: ["genreMovies", "preview"],
    queryFn: async () => {
      if (!genresData?.availableGenres) return [];

      // Fetch a small sample from each genre for the genre view
      const genrePromises = genresData.availableGenres
        .slice(0, 6)
        .map(async (genre) => {
          const content = await contentService.getGenreContent({
            action: "content",
            genre: genre.name,
            type: "movie",
            limit: 10,
            includeWatchHistory: true,
            isTVdevice: false,
          });
          return {
            genre: genre.name,
            items: content.currentItems,
          };
        });

      return Promise.all(genrePromises);
    },
    enabled: viewMode === "genres" && !!genresData?.availableGenres,
  });

  // Transform MediaItem to MobileContentCardData
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

  // Flatten all movies data for the "all" view
  const allMovies = useMemo(() => {
    if (!allMoviesData) return [];
    return allMoviesData.pages.flatMap((page) => page?.currentItems || []);
  }, [allMoviesData]);

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
    [router, showBackdrop],
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
    [router, showBackdrop],
  );

  // Handle load more for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Handle view mode toggle
  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === "genres" ? "all" : "genres"));
  }, []);

  // Focus-aware data refresh - refetch data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Refresh data when screen becomes focused
      refetchAllMovies();
    }, [refetchAllMovies]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Movies</Text>
        <View style={styles.headerControls}>
          <TouchableOpacity
            style={[
              styles.viewToggle,
              viewMode === "genres" && styles.viewToggleActive,
            ]}
            onPress={toggleViewMode}
          >
            <Text
              style={[
                styles.viewToggleText,
                viewMode === "genres" && styles.viewToggleActiveText,
              ]}
            >
              Genres
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewToggle,
              viewMode === "all" && styles.viewToggleActive,
            ]}
            onPress={toggleViewMode}
          >
            <Text
              style={[
                styles.viewToggleText,
                viewMode === "all" && styles.viewToggleActiveText,
              ]}
            >
              All
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {viewMode === "genres" ? (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {genreMoviesQueries.data?.map((genreData) => (
            <MobileContentRow
              key={genreData.genre}
              title={genreData.genre}
              data={transformMediaItems(genreData.items)}
              onPlayContent={handlePlayContent}
              onInfoContent={handleInfoContent}
              cardSize="medium"
              showMoreButton
              onShowMore={() =>
                console.log(`See all ${genreData.genre} movies`)
              }
            />
          ))}
        </ScrollView>
      ) : (
        <MobileContentList
          title=""
          data={transformMediaItems(allMovies)}
          onPlayContent={handlePlayContent}
          onInfoContent={handleInfoContent}
          layout="grid"
          cardSize="medium"
          showHeader={false}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={handleLoadMore}
          loading={allMoviesLoading}
          onRefresh={refetchAllMovies}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: "center",
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerControls: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    flexDirection: "row",
    padding: 2,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "bold",
  },
  viewToggle: {
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewToggleActive: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  viewToggleActiveText: {
    color: Colors.dark.whiteText,
  },
  viewToggleText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "600",
  },
});
