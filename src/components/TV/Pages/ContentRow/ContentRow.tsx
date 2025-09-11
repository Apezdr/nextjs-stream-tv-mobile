import React, { memo, useCallback, useMemo, useRef, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  TVFocusGuideView,
} from "react-native";

import ContentItem, {
  ContentItemData,
} from "@/src/components/TV/Pages/ContentRow/ContentItem";
import { useDimensions } from "@/src/hooks/useDimensions";

interface TVTouchableProps
  extends React.ComponentProps<typeof RNTouchableOpacity> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

interface ContentRowProps {
  title: string;
  items: ContentItemData[];
  onSelectContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  itemSize?: "small" | "medium" | "large";
  showMoreButton?: boolean;
  onShowMore?: () => void;
  // Infinite scroll
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreThreshold?: number; // ratio 0–1 of items before end
  trapFocusDown?: boolean;
}

const ContentRow = ({
  title,
  items,
  onSelectContent,
  itemSize = "medium",
  showMoreButton = false,
  onShowMore,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  loadMoreThreshold = 0.3, // start prefetch when 30% from end
  trapFocusDown = false,
}: ContentRowProps) => {
  // Simplified load guard - just track if we're currently loading
  const isLoadingMore = useRef(false);

  // Reset loading state when items change (new data arrived)
  useEffect(() => {
    isLoadingMore.current = false;
  }, [items.length]);

  // Reset loading state when fetching status changes
  useEffect(() => {
    if (!isFetchingNextPage) {
      isLoadingMore.current = false;
    }
  }, [isFetchingNextPage]);

  // Get dynamic dimensions
  const { window } = useDimensions();

  // calculate item width + total spacing
  const itemDimensions = useMemo(() => {
    const itemWidth =
      itemSize === "small"
        ? window.width / 5
        : itemSize === "large"
          ? window.width / 2.7
          : window.width / 3.5;
    const itemMargin = 16; // your 8px each side
    return { itemWidth, totalItemWidth: itemWidth + itemMargin };
  }, [itemSize, window.width]);

  // Simplified and reliable end reached handler
  const handleEndReached = useCallback(() => {
    // Only proceed if we have a next page, aren't already fetching, have a load function, and aren't already loading
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      onLoadMore &&
      !isLoadingMore.current
    ) {
      isLoadingMore.current = true;
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  const renderItem = useCallback(
    ({ item }: { item: ContentItemData }) => (
      <ContentItem
        item={item}
        onSelect={(
          showId: string,
          seasonNumber: number | undefined,
          episodeNumber: number | undefined,
          mediaType: "movie" | "tv",
          backdropUrl?: string,
          backdropBlurhash?: string,
        ) =>
          onSelectContent(
            showId,
            mediaType,
            seasonNumber,
            episodeNumber,
            backdropUrl,
            backdropBlurhash,
          )
        }
        size={itemSize}
      />
    ),
    [onSelectContent, itemSize],
  );

  const keyExtractor = useCallback((item: ContentItemData) => item.id, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<ContentItemData> | null | undefined, index: number) => ({
      length: itemDimensions.totalItemWidth,
      offset: itemDimensions.totalItemWidth * index,
      index,
    }),
    [itemDimensions.totalItemWidth],
  );

  // Stable footer component to prevent flickering
  const renderFooter = useMemo(() => {
    if (!isFetchingNextPage && !isLoadingMore.current) return null;
    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.loadingText}>Loading more…</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  if (items.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{title}</Text>
        {showMoreButton && onShowMore && (
          <TouchableOpacity
            onPress={onShowMore}
            style={styles.showMoreButton}
            isTVSelectable={Platform.isTV}
          >
            <Text style={styles.showMoreText}>See All</Text>
          </TouchableOpacity>
        )}
      </View>

      <TVFocusGuideView autoFocus trapFocusRight trapFocusDown={trapFocusDown}>
        <FlatList
          data={items}
          extraData={[items.length, hasNextPage, isFetchingNextPage]}
          horizontal
          showsHorizontalScrollIndicator={Platform.isTV}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          initialNumToRender={Platform.isTV ? 52 : 8}
          maxToRenderPerBatch={Platform.isTV ? 60 : 8}
          updateCellsBatchingPeriod={Platform.isTV ? 12 : 50}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.scrollContent}
          style={styles.scrollView}
        />
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 30 },
  headerContainer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  loadingFooter: {
    alignItems: "center",
    paddingVertical: 10,
    width: 100,
  },
  loadingText: { color: "#999", fontSize: 12 },
  scrollContent: { paddingHorizontal: 2 },
  scrollView: { flexGrow: 0, width: "100%" },
  showMoreButton: { padding: 8 },
  showMoreText: { color: "#999", fontSize: 16 },
  title: { color: "#FFF", fontSize: 24, fontWeight: "bold" },
});

export default memo(ContentRow);
