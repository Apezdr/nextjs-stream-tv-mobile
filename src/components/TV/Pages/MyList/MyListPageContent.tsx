import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TVFocusGuideView,
  TouchableOpacity as RNTouchableOpacity,
  View,
} from "react-native";

import ContentRow from "@/src/components/TV/Pages/ContentRow";
import { Colors } from "@/src/constants/Colors";
import {
  getFlattenedInfiniteWatchlistData,
  useInfiniteWatchlistContent,
} from "@/src/data/hooks/queries/useInfiniteContentQueries";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { navigationHelper } from "@/src/utils/navigationHelper";

interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

type WatchlistFilter = "all" | "movie" | "tv";
type WatchlistSort = "recent" | "titleAsc" | "titleDesc";

const FILTER_OPTIONS: Array<{ label: string; value: WatchlistFilter }> = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movie" },
  { label: "TV Shows", value: "tv" },
];

const SORT_OPTIONS: Array<{ label: string; value: WatchlistSort }> = [
  { label: "Recently Added", value: "recent" },
  { label: "Title A–Z", value: "titleAsc" },
  { label: "Title Z–A", value: "titleDesc" },
];

const MyListPageContent = memo(function MyListPageContent() {
  const isScreenFocused = useIsFocused();
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>("");
  const [mediaFilter, setMediaFilter] = useState<WatchlistFilter>("all");
  const [focusedPlaylistId, setFocusedPlaylistId] = useState<string | null>(
    null,
  );
  const [focusedFilter, setFocusedFilter] = useState<WatchlistFilter | null>(
    null,
  );
  const [sortMode, setSortMode] = useState<WatchlistSort>("recent");
  const [isSortFocused, setIsSortFocused] = useState(false);

  const {
    data: playlistsData,
    isLoading: isLoadingPlaylists,
    error: playlistsError,
  } = useQuery({
    queryKey: ["watchlist", "playlists", "tv"],
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

  const totalItems = selectedPlaylist?.itemCounts?.total;
  const movieCount = selectedPlaylist?.itemCounts?.movie ?? 0;
  const tvCount = selectedPlaylist?.itemCounts?.tv ?? 0;
  const effectiveMediaFilter = useMemo<WatchlistFilter>(() => {
    const isMovieFilterInvalid = mediaFilter === "movie" && movieCount === 0;
    const isTvFilterInvalid = mediaFilter === "tv" && tvCount === 0;

    if (!isMovieFilterInvalid && !isTvFilterInvalid) {
      return mediaFilter;
    }

    if (movieCount > 0) return "movie";
    if (tvCount > 0) return "tv";
    return "all";
  }, [mediaFilter, movieCount, tvCount]);

  const {
    data: watchlistContent,
    isLoading: isLoadingContent,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteWatchlistContent(
    {
      playlistId: selectedPlaylistId,
      limit: 30,
      mediaType:
        effectiveMediaFilter === "all" ? undefined : effectiveMediaFilter,
      includeWatchHistory: true,
      includeUnavailable: true,
      hideUnavailable: false,
      isTVdevice: true,
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

  const loadedPageCount = watchlistContent?.pages?.length ?? 0;
  const totalPageCount = watchlistContent?.pages?.[0]?.pagination?.totalPages;

  useEffect(() => {
    if (!isScreenFocused || !selectedPlaylistId) return;
    if (!hasNextPage || isFetchingNextPage) return;

    if (
      typeof totalPageCount === "number" &&
      loadedPageCount >= totalPageCount
    ) {
      return;
    }

    const prefetchTimer = setTimeout(() => {
      fetchNextPage();
    }, 250);

    return () => clearTimeout(prefetchTimer);
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isScreenFocused,
    loadedPageCount,
    selectedPlaylistId,
    totalPageCount,
  ]);

  const transformItems = useCallback((items: MediaItem[]) => {
    return items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.type === "tv" ? "TV SHOW" : "MOVIE",
      thumbnailUrl: item.thumbnailUrl || item.posterURL,
      thumbnailBlurhash: item.thumbnailBlurhash || item.posterBlurhash || "",
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      mediaType: item.type,
      link: item.link,
      backdropUrl: item.backdropUrl || item.backdrop,
      backdropBlurhash: item.backdropBlurhash,
      hdr: item.hdr,
      logo: item.logo,
      tmdbId: item.tmdbId,
      isAvailable: item.isAvailable,
    }));
  }, []);

  const sortedWatchlistItems = useMemo(() => {
    if (sortMode === "recent") return watchlistItems;

    const sortedItems = [...watchlistItems];
    sortedItems.sort((firstItem, secondItem) => {
      const firstTitle = firstItem.title || "";
      const secondTitle = secondItem.title || "";
      const titleComparison = firstTitle.localeCompare(secondTitle, undefined, {
        sensitivity: "base",
      });

      if (sortMode === "titleAsc") {
        return titleComparison;
      }

      return titleComparison * -1;
    });

    return sortedItems;
  }, [watchlistItems, sortMode]);

  const unavailableItemIds = useMemo(() => {
    return new Set(
      sortedWatchlistItems
        .filter((item) => {
          if (item.unavailable === true) return true;
          if (item.isAvailable === false) return true;
          if (item.available === false) return true;
          if (typeof item.link === "string" && item.link.trim().length === 0) {
            return true;
          }
          return false;
        })
        .map((item) => item.id),
    );
  }, [sortedWatchlistItems]);

  const contentItems = useMemo(
    () => transformItems(sortedWatchlistItems),
    [sortedWatchlistItems, transformItems],
  );

  const currentSortLabel = useMemo(() => {
    return (
      SORT_OPTIONS.find((option) => option.value === sortMode)?.label ||
      "Recently Added"
    );
  }, [sortMode]);

  const handleChangeSortMode = useCallback(() => {
    const currentSortIndex = SORT_OPTIONS.findIndex(
      (option) => option.value === sortMode,
    );
    const nextSortIndex = (currentSortIndex + 1) % SORT_OPTIONS.length;
    setSortMode(SORT_OPTIONS[nextSortIndex].value);
  }, [sortMode]);

  const handleSelectContent = useCallback(
    (
      showId: string,
      mediaType: "movie" | "tv",
      seasonNumber?: number,
      episodeNumber?: number,
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      if (unavailableItemIds.has(showId)) {
        return;
      }

      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        navigationHelper.navigateToWatch({
          id: showId,
          type: mediaType,
          season: seasonNumber,
          episode: episodeNumber,
          ...(backdropUrl && { backdrop: backdropUrl }),
          ...(backdropBlurhash && { backdropBlurhash }),
        });
        return;
      }

      navigationHelper.navigateToMediaInfo({
        id: showId,
        type: mediaType,
        ...(seasonNumber && { season: seasonNumber }),
        ...(backdropUrl && { backdrop: backdropUrl }),
        ...(backdropBlurhash && { backdropBlurhash }),
      });
    },
    [unavailableItemIds],
  );

  useEffect(() => {
    if (effectiveMediaFilter !== mediaFilter) {
      setMediaFilter(effectiveMediaFilter);
      setFocusedFilter(null);
    }
  }, [effectiveMediaFilter, mediaFilter]);

  const filteredCount =
    effectiveMediaFilter === "movie"
      ? movieCount
      : effectiveMediaFilter === "tv"
        ? tvCount
        : totalItems || 0;

  if (isLoadingPlaylists) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.title}>My List</Text>
        <ActivityIndicator color={Colors.dark.whiteText} size="large" />
        <Text style={styles.subtitle}>Loading your playlists...</Text>
      </View>
    );
  }

  if (playlistsError) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.title}>My List</Text>
        <Text style={styles.errorText}>Failed to load playlists</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>My List</Text>
            <Text style={styles.subtitle}>
              {playlists.length} lists
              {typeof totalItems === "number" ? ` • ${totalItems} items` : ""}
            </Text>
          </View>

          <Text style={styles.contextText}>
            {selectedPlaylist?.name || "Watchlist"}
          </Text>

          {(movieCount > 0 || tvCount > 0) && (
            <Text style={styles.metaText}>
              {movieCount} movies • {tvCount} TV shows
            </Text>
          )}

          <View style={styles.controlsPanel}>
            <TVFocusGuideView style={styles.controlsTopRow}>
              <View style={styles.playlistRailContainer}>
                <TVFocusGuideView trapFocusDown trapFocusLeft>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.playlistSelector}
                    contentContainerStyle={styles.playlistSelectorContent}
                  >
                    {playlists.map((playlist) => {
                      const isSelected = playlist.id === selectedPlaylistId;
                      const isFocused = playlist.id === focusedPlaylistId;

                      return (
                        <TouchableOpacity
                          key={playlist.id}
                          isTVSelectable={Platform.isTV}
                          onFocus={() => setFocusedPlaylistId(playlist.id)}
                          onBlur={() =>
                            setFocusedPlaylistId((prev) =>
                              prev === playlist.id ? null : prev,
                            )
                          }
                          onPress={() => setSelectedPlaylistId(playlist.id)}
                          style={[
                            styles.playlistButton,
                            isSelected && styles.playlistButtonActive,
                            isFocused && styles.playlistButtonFocused,
                          ]}
                        >
                          <Text
                            style={[
                              styles.playlistButtonText,
                              isSelected && styles.playlistButtonTextActive,
                              isFocused && styles.playlistButtonTextFocused,
                            ]}
                          >
                            {playlist.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </TVFocusGuideView>
              </View>

              <TVFocusGuideView trapFocusDown trapFocusRight>
                <TouchableOpacity
                  isTVSelectable={Platform.isTV}
                  onFocus={() => setIsSortFocused(true)}
                  onBlur={() => setIsSortFocused(false)}
                  onPress={handleChangeSortMode}
                  style={[
                    styles.utilityButton,
                    isSortFocused && styles.utilityButtonFocused,
                  ]}
                >
                  <Text
                    style={[
                      styles.utilityButtonText,
                      isSortFocused && styles.utilityButtonTextFocused,
                    ]}
                  >
                    {currentSortLabel}
                  </Text>
                  <Text
                    style={[
                      styles.utilityChevron,
                      isSortFocused && styles.utilityChevronFocused,
                    ]}
                  >
                    ▾
                  </Text>
                </TouchableOpacity>
              </TVFocusGuideView>
            </TVFocusGuideView>

            <View style={styles.controlsBottomRow}>
              <TVFocusGuideView trapFocusRight>
                <View style={styles.filterRow}>
                  {FILTER_OPTIONS.map((option) => {
                    const isActive = option.value === effectiveMediaFilter;
                    const isFocused = option.value === focusedFilter;
                    const isDisabled =
                      (option.value === "movie" && movieCount === 0) ||
                      (option.value === "tv" && tvCount === 0);

                    return (
                      <TouchableOpacity
                        key={option.value}
                        isTVSelectable={Platform.isTV && !isDisabled}
                        onFocus={() =>
                          !isDisabled && setFocusedFilter(option.value)
                        }
                        onBlur={() =>
                          setFocusedFilter((prev) =>
                            prev === option.value ? null : prev,
                          )
                        }
                        onPress={() =>
                          !isDisabled && setMediaFilter(option.value)
                        }
                        style={[
                          styles.filterButton,
                          isActive && styles.filterButtonActive,
                          isFocused && styles.filterButtonFocused,
                          isDisabled && styles.filterButtonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterButtonText,
                            isActive && styles.filterButtonTextActive,
                            isFocused && styles.filterButtonTextFocused,
                            isDisabled && styles.filterButtonTextDisabled,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </TVFocusGuideView>

              <View style={styles.resultsMetaContainer}>
                <Text style={styles.resultsMetaText}>
                  Sorted: {currentSortLabel}
                </Text>
                <Text style={styles.resultsMetaText}>
                  {filteredCount} results
                </Text>
              </View>
            </View>
          </View>
        </View>

        {isLoadingContent ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={Colors.dark.whiteText} size="large" />
            <Text style={styles.subtitle}>Loading watchlist content...</Text>
          </View>
        ) : contentItems.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              No items found for this playlist.
            </Text>
          </View>
        ) : (
          <ContentRow
            title=""
            items={contentItems}
            onSelectContent={handleSelectContent}
            itemSize="small"
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={fetchNextPage}
            trapFocusDown
            trapFocusLeft
            showHeader={false}
          />
        )}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  centeredContainer: {
    alignItems: "center",
    backgroundColor: Colors.dark.background,
    flex: 1,
    justifyContent: "center",
  },
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  contextText: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "600",
    marginTop: 4,
  },
  controlsBottomRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  controlsPanel: {
    backgroundColor: Colors.dark.surfaceCard,
    borderColor: Colors.dark.outline,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 16,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    shadowColor: Colors.dark.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
  },
  controlsTopRow: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 3,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 18,
  },
  errorText: {
    color: Colors.dark.brandPrimary,
    fontSize: 18,
    marginTop: 10,
  },
  filterButton: {
    backgroundColor: Colors.dark.surface,
    borderColor: Colors.dark.outline,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterButtonActive: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderColor: Colors.dark.outline,
  },
  filterButtonDisabled: {
    opacity: 0.45,
  },
  filterButtonFocused: {
    borderColor: Colors.dark.whiteText,
    shadowColor: Colors.dark.focusGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    transform: [{ scale: 1.12 }],
  },
  filterButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
    fontWeight: "600",
  },
  filterButtonTextActive: {
    color: Colors.dark.whiteText,
  },
  filterButtonTextDisabled: {
    color: Colors.dark.icon,
  },
  filterButtonTextFocused: {
    color: Colors.dark.whiteText,
  },
  filterRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  headerContainer: {
    marginBottom: 18,
  },
  headerTitleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  metaText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 15,
    marginTop: 2,
  },
  playlistButton: {
    backgroundColor: Colors.dark.cardBackground,
    borderColor: Colors.dark.outline,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 12,
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  playlistButtonActive: {
    backgroundColor: Colors.dark.surfaceElevated,
    borderColor: Colors.dark.outline,
  },
  playlistButtonFocused: {
    borderColor: Colors.dark.whiteText,
    shadowColor: Colors.dark.focusGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 14,
  },
  playlistButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 17,
    fontWeight: "700",
  },
  playlistButtonTextActive: {
    color: Colors.dark.whiteText,
  },
  playlistButtonTextFocused: {
    color: Colors.dark.whiteText,
  },
  playlistRailContainer: {
    flex: 1,
  },
  playlistSelector: {
    marginBottom: 0,
  },
  playlistSelectorContent: {
    paddingRight: 20,
  },
  resultsMetaContainer: {
    alignItems: "flex-end",
    marginLeft: 12,
  },
  resultsMetaText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
    lineHeight: 18,
  },
  scrollContent: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  scrollView: {
    flex: 1,
  },
  subtitle: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    marginTop: 0,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 40,
    fontWeight: "bold",
  },
  utilityButton: {
    alignItems: "center",
    backgroundColor: Colors.dark.surface,
    borderColor: Colors.dark.outline,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    marginLeft: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  utilityButtonFocused: {
    borderColor: Colors.dark.whiteText,
    shadowColor: Colors.dark.focusGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    transform: [{ scale: 1.06 }],
  },
  utilityButtonText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
    fontWeight: "600",
  },
  utilityButtonTextFocused: {
    color: Colors.dark.whiteText,
  },
  utilityChevron: {
    color: Colors.dark.icon,
    fontSize: 12,
    marginLeft: 6,
  },
  utilityChevronFocused: {
    color: Colors.dark.whiteText,
  },
});

export default MyListPageContent;
