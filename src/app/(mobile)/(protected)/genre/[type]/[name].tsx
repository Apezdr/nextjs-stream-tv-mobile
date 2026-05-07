import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileContentCardData } from "@/src/components/Mobile/Cards/MobileContentCard";
import MobileContentList from "@/src/components/Mobile/Lists/MobileContentList";
import { Colors } from "@/src/constants/Colors";
import { queryKeys } from "@/src/data/query/queryKeys";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

const transformMediaItems = (
  items: MediaItem[] = [],
): MobileContentCardData[] =>
  items.map((item) => ({
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
    tmdbId: item.tmdbId ?? item.metadata?.tmdbId ?? item.metadata?.tmdb_id,
    hdr: item.hdr,
    link: item.link,
    isUnavailable:
      item.isAvailable === false ||
      item.unavailable === true ||
      item.available === false ||
      (typeof item.link === "string" && item.link.trim().length === 0),
    isComingSoon: item.isComingSoon,
    comingSoonDate: item.comingSoonDate,
    logo: item.logo,
  }));

export default function GenreScreen() {
  const { type, name } = useLocalSearchParams<{ type: string; name: string }>();
  const insets = useSafeAreaInsets();
  const { show: showBackdrop } = useBackdropManager();

  const mediaType = (type === "tv" ? "tv" : "movie") as "movie" | "tv";
  const genreName = Array.isArray(name) ? name[0] : (name ?? "");

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: queryKeys.genreContent({
      genre: genreName,
      type: mediaType,
      limit: 30,
      sort: "newest",
      sortOrder: "desc",
    }),
    queryFn: async ({ pageParam = 0 }) =>
      contentService.getGenreContent({
        action: "content",
        genre: genreName,
        type: mediaType,
        page: pageParam as number,
        limit: 30,
        sort: "newest",
        sortOrder: "desc",
        includeWatchHistory: true,
        isTVdevice: false,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage?.nextItem ? allPages.length : undefined,
    enabled: !!genreName,
  });

  const items = useMemo(
    () => data?.pages.flatMap((page) => page.currentItems || []) ?? [],
    [data],
  );

  const cardItems = useMemo(() => transformMediaItems(items), [items]);

  const handlePlayContent = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      if (backdropUrl) {
        showBackdrop(backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: backdropBlurhash,
        });
      }
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

  const handleInfoContent = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      if (backdropUrl) {
        showBackdrop(backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: backdropBlurhash,
        });
      }
      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        navigationHelper.navigateToEpisodeInfo({
          showId,
          season: seasonNumber,
          episode: episodeNumber,
        });
      } else {
        navigationHelper.navigateToMediaInfo({
          id: showId,
          type: mediaType,
          ...(seasonNumber && { season: seasonNumber }),
          ...(backdropUrl && { backdrop: backdropUrl }),
          ...(backdropBlurhash && { backdropBlurhash }),
        });
      }
    },
    [showBackdrop],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const typeLabel = mediaType === "movie" ? "Movies" : "TV Shows";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons
            name="chevron-back"
            size={28}
            color={Colors.dark.whiteText}
          />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            {genreName}
          </Text>
          <Text style={styles.subtitle}>{typeLabel}</Text>
        </View>
      </View>

      <MobileContentList
        title=""
        data={cardItems}
        onPlayContent={handlePlayContent}
        onInfoContent={handleInfoContent}
        layout="grid"
        cardSize="medium"
        showHeader={false}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={handleLoadMore}
        loading={isLoading && cardItems.length === 0}
        onRefresh={refetch}
        hasTabBar={false}
        emptyMessage={`No ${typeLabel.toLowerCase()} found in ${genreName}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    padding: 4,
  },
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  header: {
    alignItems: "center",
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerText: {
    flex: 1,
  },
  subtitle: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
    marginTop: 2,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
  },
});
