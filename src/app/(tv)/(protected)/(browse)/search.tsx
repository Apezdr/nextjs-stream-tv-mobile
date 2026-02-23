import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity as RNTouchableOpacity,
  ActivityIndicator,
  Platform,
  LayoutChangeEvent,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import ContentItem, {
  ContentItemData,
} from "@/src/components/TV/Pages/ContentRow/ContentItem";
import { Colors } from "@/src/constants/Colors";
import { contentService } from "@/src/data/services/contentService";
import { MediaItem } from "@/src/data/types/content.types";
import { useSearchPreferencesStore } from "@/src/stores/searchPreferencesStore";
import { navigationHelper } from "@/src/utils/navigationHelper.tv";

// Create a TV-compatible TouchableOpacity component
interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

// Keyboard layout for TV
const KEYBOARD_ROWS = [
  ["a", "b", "c", "d", "e", "f"],
  ["g", "h", "i", "j", "k", "l"],
  ["m", "n", "o", "p", "q", "r"],
  ["s", "t", "u", "v", "w", "x"],
  ["y", "z", "1", "2", "3", "4"],
  ["5", "6", "7", "8", "9", "0"],
];

const SPECIAL_KEYS = ["Space", "Clear", "Backspace"];

// Key button component with focus-based opacity
const KeyButton = ({
  keyValue,
  onPress,
  style,
  label,
  hasTVPreferredFocus,
}: {
  keyValue: string;
  onPress: () => void;
  style?: object;
  label?: string;
  hasTVPreferredFocus?: boolean;
}) => {
  const [focused, setFocused] = useState(false);

  return (
    <TouchableOpacity
      style={[
        styles.key,
        style,
        { opacity: focused ? 1 : 0.25, borderWidth: focused ? 0.82 : 0 },
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      activeOpacity={0.7}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Text style={styles.keyText}>{label ?? keyValue}</Text>
    </TouchableOpacity>
  );
};

// Row item component for list view (1-column mode)
const SearchRowItem = ({
  item,
  onPress,
}: {
  item: ContentItemData;
  onPress: () => void;
}) => {
  const [focused, setFocused] = useState(false);

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

  return (
    <TouchableOpacity
      style={[
        styles.rowItem,
        { opacity: focused ? 1 : 0.35, borderWidth: focused ? 1 : 0 },
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      activeOpacity={0.8}
      isTVSelectable={Platform.isTV}
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
          width={180}
          quality={90}
        />
        {/* HDR badge */}
        {item.hdr && (
          <View style={styles.rowHdrBadge}>
            <Text style={styles.rowHdrText}>{item.hdr}</Text>
          </View>
        )}
      </View>

      {/* Details */}
      <View style={styles.rowDetails}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={styles.rowMeta}>
          {item.year ? (
            <Text style={styles.rowMetaText}>{item.year}</Text>
          ) : null}
          {mediaLabel ? (
            <Text style={styles.rowMetaText}>{mediaLabel}</Text>
          ) : null}
          {episodeLabel ? (
            <Text style={styles.rowMetaText}>{episodeLabel}</Text>
          ) : null}
        </View>
      </View>

      {/* Play icon */}
      <View style={styles.rowPlayIcon}>
        <Ionicons name="play-circle" size={28} color={Colors.dark.whiteText} />
      </View>
    </TouchableOpacity>
  );
};

// Grid layout options
const GRID_OPTIONS = [1, 2, 3] as const;
type GridColumns = (typeof GRID_OPTIONS)[number];

// Grid toggle button with focus support
const GridToggleButton = ({
  columns,
  isActive,
  onPress,
}: {
  columns: GridColumns;
  isActive: boolean;
  onPress: () => void;
}) => {
  const [focused, setFocused] = useState(false);
  const iconName =
    columns === 1 ? "list" : columns === 2 ? "grid-outline" : "grid";

  return (
    <TouchableOpacity
      style={[
        styles.gridToggleBtn,
        isActive && styles.gridToggleBtnActive,
        {
          opacity: focused || isActive ? 1 : 0.4,
          borderWidth: focused ? 0.82 : 0,
        },
      ]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      activeOpacity={0.7}
      isTVSelectable={Platform.isTV}
    >
      <Ionicons
        name={iconName as any}
        size={18}
        color={isActive ? Colors.dark.brandPrimary : Colors.dark.whiteText}
      />
    </TouchableOpacity>
  );
};

export default function SearchPage() {
  // Search query state
  const [searchQuery, setSearchQuery] = useState("");
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState("");

  // Grid layout state (persisted)
  const numColumns = useSearchPreferencesStore((s) => s.tvGridColumns);
  const setNumColumns = useSearchPreferencesStore((s) => s.setTvGridColumns);
  const [resultsWidth, setResultsWidth] = useState(0);

  // Measure results container width
  const handleResultsLayout = useCallback((e: LayoutChangeEvent) => {
    setResultsWidth(e.nativeEvent.layout.width);
  }, []);

  // Calculate item width based on container and columns
  const itemWidth = useMemo(() => {
    if (!resultsWidth) return undefined;
    const horizontalPadding = 16; // margin on each side of items
    return (resultsWidth - horizontalPadding * (numColumns + 1)) / numColumns;
  }, [resultsWidth, numColumns]);

  // Debounce the search query
  const updateDebouncedQuery = useCallback((query: string) => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    debounceTimeout.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300); // Shorter debounce for TV
  }, []);

  // Handle key press
  const handleKeyPress = useCallback(
    (key: string) => {
      let newQuery = searchQuery;

      if (key === "Backspace") {
        newQuery = searchQuery.slice(0, -1);
      } else if (key === "Space") {
        newQuery = searchQuery + " ";
      } else if (key === "Clear") {
        newQuery = "";
      } else {
        newQuery = searchQuery + key;
      }

      setSearchQuery(newQuery);
      updateDebouncedQuery(newQuery);
    },
    [searchQuery, updateDebouncedQuery],
  );

  // Fetch search results using React Query
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

  // Transform MediaItem to ContentItemData
  const transformedResults = useMemo((): ContentItemData[] => {
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
      year: (() => {
        const dateStr =
          item.metadata?.release_date ??
          item.metadata?.first_air_date ??
          item.releaseDate;
        if (!dateStr) return undefined;
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime())
          ? undefined
          : parsed.getFullYear().toString();
      })(),
    }));
  }, [searchResults]);

  // Handle content selection
  const handleSelect = useCallback(
    (
      showId: string,
      seasonNumber: number | undefined,
      episodeNumber: number | undefined,
      mediaType: "movie" | "tv",
      backdropUrl?: string,
      backdropBlurhash?: string,
    ) => {
      // Navigate to appropriate info page
      if (mediaType === "tv" && seasonNumber && episodeNumber) {
        navigationHelper.navigateToEpisodeInfo({
          showId,
          season: seasonNumber,
          episode: episodeNumber,
          ...(backdropUrl && { backdrop: backdropUrl }),
          ...(backdropBlurhash && { backdropBlurhash }),
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
    [],
  );

  // Render keyboard key
  const renderKey = useCallback(
    (key: string, index: number) => (
      <KeyButton
        key={key}
        keyValue={key}
        onPress={() => handleKeyPress(key)}
        hasTVPreferredFocus={index === 0 && !searchQuery}
      />
    ),
    [handleKeyPress, searchQuery],
  );

  // Render special key
  const renderSpecialKey = useCallback(
    (key: string) => (
      <KeyButton
        key={key}
        keyValue={key}
        label={key === "Backspace" ? "⌫" : key === "Clear" ? "✕" : key}
        onPress={() => handleKeyPress(key)}
        style={styles.specialKey}
      />
    ),
    [handleKeyPress],
  );

  // Render item for results grid
  const renderItem = useCallback(
    ({ item }: { item: ContentItemData }) => {
      if (numColumns === 1) {
        return (
          <SearchRowItem
            item={item}
            onPress={() =>
              handleSelect(
                item.showId || item.id,
                item.seasonNumber,
                item.episodeNumber,
                item.mediaType || "movie",
                item.backdropUrl,
                item.backdropBlurhash,
              )
            }
          />
        );
      }
      return (
        <ContentItem
          item={item}
          onSelect={handleSelect}
          size="small"
          customWidth={itemWidth}
        />
      );
    },
    [handleSelect, itemWidth, numColumns],
  );

  // Key extractor
  const keyExtractor = useCallback((item: ContentItemData) => item.id, []);

  return (
    <View style={styles.container}>
      <View style={styles.contentWrapper}>
        {/* Left side - Keyboard */}
        <View style={styles.keyboardContainer}>
          {/* Search query display */}
          <View style={styles.queryDisplay}>
            <Text style={styles.queryText} numberOfLines={1}>
              {searchQuery || " "}
            </Text>
          </View>

          {/* Keyboard rows */}
          <View style={styles.keyboardRows}>
            {KEYBOARD_ROWS.map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} style={styles.keyboardRow}>
                {row.map((key, keyIndex) =>
                  renderKey(key, rowIndex * 6 + keyIndex),
                )}
              </View>
            ))}

            {/* Special keys row */}
            <View style={styles.keyboardRow}>
              {SPECIAL_KEYS.map(renderSpecialKey)}
            </View>
          </View>
        </View>

        {/* Right side - Results */}
        <View style={styles.resultsContainer} onLayout={handleResultsLayout}>
          {/* Header */}
          <View style={styles.resultsHeader}>
            <View style={styles.resultsHeaderLeft}>
              <Text style={styles.resultsTitle}>
                {searchQuery
                  ? `Results for "${searchQuery}"`
                  : "Recently Added"}
              </Text>
              {!isLoading && transformedResults.length > 0 && (
                <Text style={styles.resultCount}>
                  {transformedResults.length}{" "}
                  {transformedResults.length === 1 ? "result" : "results"}
                </Text>
              )}
            </View>

            {/* Grid toggle */}
            <View style={styles.gridToggle}>
              {GRID_OPTIONS.map((cols) => (
                <GridToggleButton
                  key={cols}
                  columns={cols}
                  isActive={numColumns === cols}
                  onPress={() => setNumColumns(cols)}
                />
              ))}
            </View>
          </View>

          {/* Results grid */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                color={Colors.dark.brandPrimary}
                size="large"
              />
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
              contentContainerStyle={styles.gridContainer}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews={Platform.isTV}
              maxToRenderPerBatch={9}
              initialNumToRender={12}
              windowSize={5}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: 40,
    paddingTop: 40,
  },
  emptyContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 18,
    textAlign: "center",
  },
  gridContainer: {
    paddingBottom: 120,
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  gridToggle: {
    flexDirection: "row",
    gap: 6,
  },
  gridToggleBtn: {
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderColor: Colors.light.whiteBg,
    borderRadius: 6,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  gridToggleBtnActive: {
    backgroundColor: "#1A1A1A",
    borderColor: Colors.dark.brandPrimary,
    borderWidth: 1,
  },
  key: {
    alignItems: "center",
    backgroundColor: "#2A2A2A",
    borderColor: Colors.light.whiteBg,
    borderRadius: 6,
    height: 35,
    justifyContent: "center",
    margin: 2,
    minWidth: 50,
  },
  keyText: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "500",
  },
  keyboardContainer: {
    paddingRight: 40,
    width: 400,
  },
  keyboardRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginBottom: 4,
  },
  keyboardRows: {
    marginTop: 20,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    marginTop: 12,
  },
  queryDisplay: {
    backgroundColor: "#1A1A1A",
    borderColor: Colors.dark.brandPrimary,
    borderRadius: 8,
    borderWidth: 2,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  queryText: {
    color: Colors.dark.whiteText,
    fontSize: 28,
    fontWeight: "600",
  },
  resultCount: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
  },
  resultsContainer: {
    flex: 1,
  },
  resultsHeader: {
    alignItems: "center",
    borderBottomColor: Colors.dark.outline,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
  },
  resultsHeaderLeft: {
    flex: 1,
    gap: 4,
  },
  resultsTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
  },
  specialKey: {
    backgroundColor: "#3A3A3A",
    flex: 1,
    marginHorizontal: 4,
  },
  // Row item styles (list view)
  rowItem: {
    alignItems: "center",
    backgroundColor: "#1E1E1E",
    borderColor: Colors.light.whiteBg,
    borderRadius: 8,
    flexDirection: "row",
    height: 80,
    marginBottom: 6,
    marginHorizontal: 8,
    overflow: "hidden",
  },
  rowThumbnailWrapper: {
    height: 80,
    position: "relative",
    width: 130,
  },
  rowThumbnail: {
    height: "100%",
    width: "100%",
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
    fontSize: 9,
    fontWeight: "700",
  },
  rowDetails: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  rowTitle: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
  },
  rowMeta: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  rowMetaText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
  },
  rowPlayIcon: {
    marginRight: 16,
  },
});
