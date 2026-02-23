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
import MobileGenreRow from "@/src/components/Mobile/Rows/MobileGenreRow";
import { Colors } from "@/src/constants/Colors";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

type ViewMode = "genres" | "all";
type SortOption = "newest" | "title" | "rating";

export default function ShowsPage() {
  const _router = useRouter();
  const { show: showBackdrop } = useBackdropManager();
  const [viewMode, setViewMode] = useState<ViewMode>("genres");
  const [sortBy, _setSortBy] = useState<SortOption>("newest");
  const insets = useSafeAreaInsets();

  // Fetch TV show genres
  const { data: genresData, isLoading: _genresLoading } = useQuery({
    queryKey: ["genres", "tvShows"],
    queryFn: () =>
      contentService.getGenresList({ type: "tv", includeCounts: true }),
  });

  // Fetch all TV shows with infinite scroll
  const {
    data: allShowsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: allShowsLoading,
    refetch: refetchAllShows,
  } = useInfiniteQuery({
    queryKey: ["content", "allShows", { type: "tv", sort: sortBy }],
    queryFn: ({ pageParam = 0 }) =>
      contentService.getContentList({
        type: "tv",
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

  // Transform MediaItem to MobileContentCardData
  const transformMediaItems = useCallback(
    (items: MediaItem[] = []): MobileContentCardData[] => {
      return items.map((item) => ({
        id: item.id,
        title: item.title,
        thumbnailUrl: item.thumbnailUrl || item.posterURL,
        thumbnailBlurhash: item.thumbnailBlurhash || item.posterBlurhash,
        backdropUrl: item.backdropUrl || item.backdrop,
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

  // Flatten all shows data for the "all" view
  const allShows = useMemo(() => {
    if (!allShowsData) return [];
    return allShowsData.pages.flatMap((page) => page?.currentItems || []);
  }, [allShowsData]);

  // Handle show more for genre
  const handleShowMore = useCallback((genre: string) => {
    console.log(`See all ${genre} TV shows`);
  }, []);

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
        // TV show - go to media info page
        navigationHelper.navigateToMediaInfo({
          id: showId,
          type: mediaType,
          ...(seasonNumber && { season: seasonNumber }),
        });
      }
    },
    [showBackdrop],
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
      refetchAllShows();
    }, [refetchAllShows]),
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>TV Shows</Text>
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
          {genresData?.availableGenres?.map((genreInfo) => (
            <MobileGenreRow
              key={genreInfo.name}
              genre={genreInfo.name}
              type="tv"
              onPlayContent={handlePlayContent}
              onInfoContent={handleInfoContent}
              cardSize="medium"
              showMoreButton
              onShowMore={handleShowMore}
              enabled={viewMode === "genres"}
              limit={20}
            />
          ))}
        </ScrollView>
      ) : (
        <MobileContentList
          title=""
          data={transformMediaItems(allShows)}
          onPlayContent={handlePlayContent}
          onInfoContent={handleInfoContent}
          layout="grid"
          cardSize="medium"
          showHeader={false}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={handleLoadMore}
          loading={allShowsLoading}
          onRefresh={refetchAllShows}
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
