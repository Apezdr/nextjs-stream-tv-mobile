import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileContentCardData } from "@/src/components/Mobile/Cards/MobileContentCard";
import MobileContentList from "@/src/components/Mobile/Lists/MobileContentList";
import { Colors } from "@/src/constants/Colors";
import {
  getFlattenedInfiniteWatchlistData,
  useInfiniteWatchlistContent,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { navigationHelper } from "@/src/utils/navigationHelper";

type WatchlistFilter = "all" | "movie" | "tv";

const FILTER_OPTIONS: Array<{ label: string; value: WatchlistFilter }> = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movie" },
  { label: "TV Shows", value: "tv" },
];

export default function MobileMyListPage() {
  const isScreenFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const { show: showBackdrop } = useBackdropManager();

  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [mediaFilter, setMediaFilter] = useState<WatchlistFilter>("all");

  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    error: playlistsError,
    refetch: refetchPlaylists,
  } = useQuery({
    queryKey: ["watchlist", "playlists", "mobile"],
    queryFn: () =>
      contentService.getWatchlistPlaylists({
        includeItemCounts: true,
        includeDefaultPlaylist: true,
      }),
    refetchInterval: isScreenFocused ? 15000 : false,
    refetchIntervalInBackground: true,
  });

  const playlists = useMemo(
    () => playlistsData?.playlists || [],
    [playlistsData],
  );

  useEffect(() => {
    if (!playlists.length) return;

    const defaultPlaylistId =
      playlistsData?.defaultPlaylistId ||
      playlists.find((playlist) => playlist.isDefault)?.id ||
      playlists[0]?.id;

    const selectedPlaylistStillExists = playlists.some(
      (playlist) => playlist.id === selectedPlaylistId,
    );

    if (!selectedPlaylistId || !selectedPlaylistStillExists) {
      if (defaultPlaylistId) {
        setSelectedPlaylistId(defaultPlaylistId);
      }
    }
  }, [playlists, playlistsData?.defaultPlaylistId, selectedPlaylistId]);

  const selectedPlaylist = useMemo(
    () => playlists.find((playlist) => playlist.id === selectedPlaylistId),
    [playlists, selectedPlaylistId],
  );

  const movieCount = selectedPlaylist?.itemCounts?.movie ?? 0;
  const tvCount = selectedPlaylist?.itemCounts?.tv ?? 0;

  useEffect(() => {
    const isMovieFilterInvalid = mediaFilter === "movie" && movieCount === 0;
    const isTvFilterInvalid = mediaFilter === "tv" && tvCount === 0;

    if (!isMovieFilterInvalid && !isTvFilterInvalid) {
      return;
    }

    const fallbackFilter: WatchlistFilter =
      movieCount > 0 ? "movie" : tvCount > 0 ? "tv" : "all";

    if (fallbackFilter !== mediaFilter) {
      setMediaFilter(fallbackFilter);
    }
  }, [mediaFilter, movieCount, tvCount]);

  const {
    data: watchlistContent,
    isLoading: isLoadingContent,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch: refetchWatchlistContent,
  } = useInfiniteWatchlistContent(
    {
      playlistId: selectedPlaylistId,
      limit: 30,
      mediaType: mediaFilter === "all" ? undefined : mediaFilter,
      includeWatchHistory: true,
      includeUnavailable: true,
      hideUnavailable: false,
      isTVdevice: false,
    },
    {
      enabled: isScreenFocused,
      refetchInterval: isScreenFocused ? 15000 : false,
      refetchIntervalInBackground: true,
    },
  );

  const watchlistItems = useMemo(() => {
    return getFlattenedInfiniteWatchlistData(watchlistContent);
  }, [watchlistContent]);

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
    },
    [],
  );

  const cardItems = useMemo(
    () => transformMediaItems(watchlistItems),
    [watchlistItems, transformMediaItems],
  );

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

  const handleRefresh = useCallback(() => {
    refetchPlaylists();
    refetchWatchlistContent();
  }, [refetchPlaylists, refetchWatchlistContent]);

  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const totalItems = selectedPlaylist?.itemCounts?.total;
  const isRefreshing = isLoadingPlaylists || isFetchingNextPage;

  if (isLoadingPlaylists) {
    return (
      <View style={[styles.centeredContainer, { paddingTop: insets.top }]}>
        <Text style={styles.title}>My List</Text>
        <ActivityIndicator color={Colors.dark.whiteText} size="large" />
        <Text style={styles.subtitle}>Loading your playlists...</Text>
      </View>
    );
  }

  if (playlistsError) {
    return (
      <View style={[styles.centeredContainer, { paddingTop: insets.top }]}>
        <Text style={styles.title}>My List</Text>
        <Text style={styles.errorText}>Failed to load playlists</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>My List</Text>
        <Text style={styles.subtitle}>
          {selectedPlaylist?.name || "Watchlist"}
          {typeof totalItems === "number" ? ` • ${totalItems} items` : ""}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.playlistSelector}
        contentContainerStyle={styles.playlistSelectorContent}
      >
        {playlists.map((playlist) => {
          const isSelected = playlist.id === selectedPlaylistId;
          return (
            <TouchableOpacity
              key={playlist.id}
              onPress={() => setSelectedPlaylistId(playlist.id)}
              style={[
                styles.playlistButton,
                isSelected && styles.playlistButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.playlistButtonText,
                  isSelected && styles.playlistButtonTextActive,
                ]}
              >
                {playlist.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.filterRow}>
        {FILTER_OPTIONS.map((option) => {
          const isActive = option.value === mediaFilter;
          return (
            <TouchableOpacity
              key={option.value}
              onPress={() => setMediaFilter(option.value)}
              style={[
                styles.filterButton,
                isActive && styles.filterButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  isActive && styles.filterButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoadingContent ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.whiteText} size="large" />
          <Text style={styles.subtitle}>Loading watchlist content...</Text>
        </View>
      ) : (
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
          loading={false}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          emptyMessage="No items found for this playlist"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centeredContainer: {
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  errorText: {
    color: Colors.dark.brandPrimary,
    fontSize: 16,
    marginTop: 12,
  },
  filterButton: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterButtonActive: {
    backgroundColor: Colors.dark.brandPrimary,
  },
  filterButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: Colors.dark.whiteText,
  },
  filterRow: {
    flexDirection: "row",
    marginBottom: 10,
    paddingHorizontal: 16,
  },
  header: {
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  playlistButton: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    marginRight: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  playlistButtonActive: {
    backgroundColor: Colors.dark.whiteText,
  },
  playlistButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    fontWeight: "600",
  },
  playlistButtonTextActive: {
    color: Colors.dark.background,
  },
  playlistSelector: {
    marginBottom: 10,
    maxHeight: 42,
    minHeight: 42,
    paddingHorizontal: 16,
  },
  playlistSelectorContent: {
    alignItems: "center",
    paddingRight: 16,
  },
  subtitle: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    marginTop: 4,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "bold",
  },
});
