import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useCallback, useMemo, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import MobileContentCard, {
  MobileContentCardData,
} from "@/src/components/Mobile/Cards/MobileContentCard";
import { Colors } from "@/src/constants/Colors";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useSearchPreferencesStore } from "@/src/stores/searchPreferencesStore";
import { navigationHelper } from "@/src/utils/navigationHelper";

// Grid layout options
const GRID_OPTIONS = [1, 2, 3] as const;
type GridColumns = (typeof GRID_OPTIONS)[number];

// Row item for list view (1-column mode)
const MobileSearchRowItem = ({
  item,
  onPress,
}: {
  item: MobileContentCardData;
  onPress: () => void;
}) => {
  const mediaLabel =
    item.mediaType === "tv"
      ? "TV Show"
      : item.mediaType === "movie"
        ? "Movie"
        : "";
  const episodeLabel =
    item.seasonNumber && item.episodeNumber
      ? `S${item.seasonNumber}E${item.episodeNumber}`
      : null;

  const year = item.releaseDate
    ? (() => {
        const parsed = new Date(item.releaseDate);
        return isNaN(parsed.getTime())
          ? undefined
          : parsed.getFullYear().toString();
      })()
    : undefined;

  return (
    <TouchableOpacity
      style={styles.rowItem}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Thumbnail */}
      <View style={styles.rowThumbnailWrapper}>
        <OptimizedImage
          source={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
          style={styles.rowThumbnail}
          placeholder={{
            uri: `data:image/png;base64,${item?.thumbnailBlurhash}`,
          }}
          placeholderContentFit="cover"
          transition={200}
          contentFit="cover"
          width={120}
          quality={90}
        />
        {item.hdr && (
          <View style={styles.rowHdrBadge}>
            <Text style={styles.rowHdrText}>{item.hdr}</Text>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.rowDetails}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          {year ? <Text style={styles.rowMetaText}>{year}</Text> : null}
          {mediaLabel ? (
            <Text style={styles.rowMetaText}>{mediaLabel}</Text>
          ) : null}
          {episodeLabel ? (
            <Text style={styles.rowMetaText}>{episodeLabel}</Text>
          ) : null}
        </View>
      </View>

      {/* Chevron icon */}
      <View style={styles.rowChevron}>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={Colors.dark.videoDescriptionText}
        />
      </View>
    </TouchableOpacity>
  );
};

export default function SearchPage() {
  const insets = useSafeAreaInsets();
  const { show: showBackdrop } = useBackdropManager();

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Grid layout state (persisted)
  const numColumns = useSearchPreferencesStore((s) => s.mobileGridColumns);
  const setNumColumns = useSearchPreferencesStore(
    (s) => s.setMobileGridColumns,
  );

  // Debounce the search query
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 400);
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
  }, []);

  // Fetch search results
  const {
    data: searchResults,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () =>
      contentService.search(debouncedQuery, debouncedQuery ? undefined : 30),
    enabled: true,
  });

  // Transform results
  const transformedResults = useMemo((): MobileContentCardData[] => {
    if (!searchResults) return [];

    return searchResults.map((item: MediaItem) => ({
      id: item.id,
      title: item.title,
      thumbnailUrl: item.posterURL,
      thumbnailBlurhash: item.posterBlurhash,
      backdropUrl: item.backdrop,
      backdropBlurhash: item.backdropBlurhash,
      mediaType: item.type,
      showId: item.id,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      hdr: item.hdr,
      logo: item.logo,
      link: item.link,
      releaseDate: (() => {
        const dateStr =
          item.metadata?.release_date ??
          item.metadata?.first_air_date ??
          item.releaseDate;
        return dateStr ?? undefined;
      })(),
    }));
  }, [searchResults]);

  // Handle play content
  const handlePlayContent = useCallback(
    (
      showId: string,
      seasonNumber: number | undefined,
      episodeNumber: number | undefined,
      mediaType: "movie" | "tv",
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

  // Handle info content
  const handleInfoContent = useCallback(
    (
      showId: string,
      seasonNumber: number | undefined,
      episodeNumber: number | undefined,
      mediaType: "movie" | "tv",
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
        });
      }
    },
    [showBackdrop],
  );

  // Navigate to info on row item press
  const handleRowPress = useCallback(
    (item: MobileContentCardData) => {
      if (item.backdropUrl) {
        showBackdrop(item.backdropUrl, {
          fade: true,
          duration: 300,
          blurhash: item.backdropBlurhash,
        });
        Image.prefetch(item.backdropUrl).catch(() => {});
      }

      if (item.mediaType === "tv" && item.seasonNumber && item.episodeNumber) {
        navigationHelper.navigateToEpisodeInfo({
          showId: item.showId || item.id,
          season: item.seasonNumber,
          episode: item.episodeNumber,
        });
      } else {
        navigationHelper.navigateToMediaInfo({
          id: item.showId || item.id,
          type: item.mediaType || "movie",
          ...(item.seasonNumber && { season: item.seasonNumber }),
        });
      }
    },
    [showBackdrop],
  );

  // Render item based on current layout
  const renderItem = useCallback(
    ({ item }: { item: MobileContentCardData }) => {
      if (numColumns === 1) {
        return (
          <MobileSearchRowItem
            item={item}
            onPress={() => handleRowPress(item)}
          />
        );
      }
      return (
        <MobileContentCard
          item={item}
          onPlay={handlePlayContent}
          onInfo={handleInfoContent}
          layout="grid"
          size={numColumns === 3 ? "small" : "medium"}
        />
      );
    },
    [numColumns, handlePlayContent, handleInfoContent, handleRowPress],
  );

  const keyExtractor = useCallback(
    (item: MobileContentCardData) => item.id,
    [],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header with search bar */}
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
      </View>

      {/* Search input */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchBar}>
          <Ionicons
            name="search"
            size={18}
            color={Colors.dark.videoDescriptionText}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearchChange}
            placeholder="Search movies and TV shows..."
            placeholderTextColor={Colors.dark.videoDescriptionText}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            clearButtonMode="never"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
              <Ionicons
                name="close-circle"
                size={18}
                color={Colors.dark.videoDescriptionText}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* Grid toggle */}
        <View style={styles.gridToggle}>
          {GRID_OPTIONS.map((cols) => {
            const iconName =
              cols === 1 ? "list" : cols === 2 ? "grid-outline" : "grid";
            const isActive = numColumns === cols;
            return (
              <TouchableOpacity
                key={cols}
                style={[
                  styles.gridToggleBtn,
                  isActive && styles.gridToggleBtnActive,
                ]}
                onPress={() => setNumColumns(cols)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={iconName as any}
                  size={16}
                  color={
                    isActive
                      ? Colors.dark.brandPrimary
                      : Colors.dark.videoDescriptionText
                  }
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Results header */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>
          {searchQuery ? `Results for "${searchQuery}"` : "Recently Added"}
        </Text>
        {!isLoading && transformedResults.length > 0 && (
          <Text style={styles.resultCount}>
            {transformedResults.length}{" "}
            {transformedResults.length === 1 ? "result" : "results"}
          </Text>
        )}
      </View>

      {/* Results */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.dark.brandPrimary} size="large" />
          <Text style={styles.loadingText}>
            {searchQuery ? "Searching..." : "Loading..."}
          </Text>
        </View>
      ) : error ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            Failed to load results. Please try again.
          </Text>
        </View>
      ) : transformedResults.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name="search-outline"
            size={48}
            color={Colors.dark.videoDescriptionText}
          />
          <Text style={styles.emptyText}>
            {searchQuery
              ? `No results found for "${searchQuery}"`
              : "No recently added content"}
          </Text>
        </View>
      ) : (
        <FlatList
          key={`grid-${numColumns}`}
          data={transformedResults}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
          contentContainerStyle={styles.gridContainer}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          removeClippedSubviews
          maxToRenderPerBatch={8}
          initialNumToRender={10}
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  clearButton: {
    padding: 4,
  },
  columnWrapper: {
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    textAlign: "center",
  },
  gridContainer: {
    paddingBottom: 100,
    paddingTop: 4,
  },
  gridToggle: {
    flexDirection: "row",
    gap: 4,
  },
  gridToggleBtn: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    borderColor: "transparent",
    borderRadius: 6,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  gridToggleBtnActive: {
    borderColor: Colors.dark.brandPrimary,
  },
  header: {
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    marginTop: 12,
  },
  resultCount: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
  },
  resultsHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  resultsTitle: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  // Row item (list view) styles
  rowChevron: {
    marginRight: 12,
  },
  rowDetails: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  rowHdrBadge: {
    backgroundColor: "rgba(0,0,0,0.7)",
    borderRadius: 3,
    bottom: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    position: "absolute",
  },
  rowHdrText: {
    color: Colors.dark.whiteText,
    fontSize: 8,
    fontWeight: "700",
  },
  rowItem: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    flexDirection: "row",
    height: 72,
    marginBottom: 6,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  rowMeta: {
    flexDirection: "row",
    gap: 8,
    marginTop: 3,
  },
  rowMetaText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
  },
  rowThumbnail: {
    height: "100%",
    width: "100%",
  },
  rowThumbnailWrapper: {
    height: 72,
    position: "relative",
    width: 100,
  },
  rowTitle: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "600",
  },
  searchBar: {
    alignItems: "center",
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 10,
    flex: 1,
    flexDirection: "row",
    height: 40,
    marginRight: 10,
    paddingHorizontal: 12,
  },
  searchBarContainer: {
    alignItems: "center",
    flexDirection: "row",
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 16,
    height: 40,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "bold",
  },
});
