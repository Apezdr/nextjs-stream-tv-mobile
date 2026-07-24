import React, { memo, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  TVFocusGuideView,
  FlatList,
} from "react-native";

import ContentItem, {
  ContentItemData,
} from "@/src/components/TV/Pages/ContentRow/ContentItem";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useSmartInfiniteScroll } from "@/src/hooks/useSmartInfiniteScroll";

interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

// Trigger load-more when the focused item is within this many items of the end.
// A small fixed look-ahead is reliable for focus-stepped TV navigation and keeps
// eagerness bounded on long lists (unlike a fraction-of-length threshold).
const LOAD_MORE_LOOKAHEAD = 5;

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
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreThreshold?: number;
  trapFocusDown?: boolean;
  trapFocusLeft?: boolean;
  trapFocusRight?: boolean;
  showHeader?: boolean;
  preferFirstItemFocus?: boolean;
  /** Fired when any item in this row gains focus (used to snap-scroll the row into view) */
  onRowFocus?: () => void;
  /** Drops the row's trailing margin so the last row has no dead scroll space below it */
  isLastRow?: boolean;
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
  loadMoreThreshold = 0.5,
  trapFocusDown = false,
  // Trap horizontal focus on both edges by default (symmetric with trapFocusRight)
  // so holding left/right at the start/end of a row keeps focus on the row instead
  // of jumping to an adjacent row. Screens that need left-exit can override.
  trapFocusLeft = true,
  trapFocusRight = true,
  showHeader = true,
  preferFirstItemFocus = false,
  onRowFocus,
  isLastRow = false,
}: ContentRowProps) => {
  const { window } = useDimensions();

  const itemDimensions = useMemo(() => {
    const itemWidth =
      itemSize === "small"
        ? window.width / 5
        : itemSize === "large"
          ? window.width / 2.7
          : window.width / 3.5;
    const totalItemWidth = itemWidth + 16; // 8px margin each side
    const totalItemHeight = Math.ceil(itemWidth * 0.6) + 180 + 16;
    return { itemWidth, totalItemWidth, totalItemHeight };
  }, [itemSize, window.width]);

  // Velocity/onEndReached-based loading. Kept as a fallback for fast (touch /
  // held-key) scrolling; the focus-index trigger below handles the common TV
  // case of stepping through a list where velocity never builds.
  const smartScroll = useSmartInfiniteScroll({
    hasNextPage,
    isFetching: isFetchingNextPage,
    onLoadMore: onLoadMore ?? (() => {}),
    horizontal: true,
    predictAheadMs: 1000,
    endReachedThreshold: loadMoreThreshold,
  });

  // Focus-index load-more: on TV the list scrolls in discrete focus steps, so a
  // short/carefully-navigated row (e.g. Continue Watching) never builds enough
  // scroll velocity to trip the predictor. Triggering when the focused item is
  // within LOAD_MORE_LOOKAHEAD of the end is reliable regardless of velocity.
  const handleItemFocus = useCallback(
    (index: number) => {
      onRowFocus?.();
      if (
        hasNextPage &&
        !isFetchingNextPage &&
        onLoadMore &&
        index >= items.length - LOAD_MORE_LOOKAHEAD
      ) {
        onLoadMore();
      }
    },
    [onRowFocus, hasNextPage, isFetchingNextPage, onLoadMore, items.length],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: ContentItemData; index: number }) => (
      <ContentItem
        item={item}
        onSelect={(
          showId,
          seasonNumber,
          episodeNumber,
          mediaType,
          backdropUrl,
          backdropBlurhash,
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
        hasTVPreferredFocus={preferFirstItemFocus && index === 0}
        index={index}
        onFocus={handleItemFocus}
      />
    ),
    [onSelectContent, itemSize, preferFirstItemFocus, handleItemFocus],
  );

  const keyExtractor = useCallback((item: ContentItemData) => item.id, []);

  const renderFooter = useMemo(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.loadingText}>Loading more…</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  if (items.length === 0) return null;

  return (
    <View style={[styles.container, isLastRow && styles.containerLast]}>
      {showHeader && (
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
      )}

      <TVFocusGuideView
        autoFocus
        trapFocusRight={trapFocusRight}
        trapFocusDown={trapFocusDown}
        trapFocusLeft={trapFocusLeft}
      >
        <FlatList
          data={items}
          extraData={[items.length, hasNextPage, isFetchingNextPage]}
          horizontal
          showsHorizontalScrollIndicator={Platform.isTV}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          {...smartScroll}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.scrollContent}
          style={{ height: itemDimensions.totalItemHeight }}
        />
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginBottom: 30 },
  containerLast: { marginBottom: 0 },
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
  showMoreButton: { padding: 8 },
  showMoreText: { color: "#999", fontSize: 16 },
  title: { color: "#FFF", fontSize: 24, fontWeight: "bold" },
});

export default memo(ContentRow);
