import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  Platform,
  TVFocusGuideView,
  FlatList,
  type LayoutChangeEvent,
} from "react-native";

import ContentItem, {
  ContentItemData,
} from "@/src/components/TV/Pages/ContentRow/ContentItem";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useSmartInfiniteScroll } from "@/src/hooks/useSmartInfiniteScroll";

// Horizontal padding applied to the grid's content container.
const GRID_HORIZONTAL_PADDING = 12;
// Per-item margin baked into ContentItem (8px each side).
const ITEM_MARGIN = 16;
// Breathing room left above the focused row when it snaps toward the top,
// matching the browse page's stepped-scroll inset.
const GRID_TOP_INSET = 24;
// Non-thumbnail chrome height baked into every ContentItem card (title/overlay
// area below the poster). Mirrors ContentItem's `itemHeight + 180` sizing.
const CARD_CHROME_HEIGHT = 180;

interface ContentGridProps {
  items: ContentItemData[];
  onSelectContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  numColumns?: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreThreshold?: number;
  preferFirstItemFocus?: boolean;
  /** Rendered above the grid; scrolls with the content. */
  header?: React.ReactElement | null;
}

const ContentGrid = ({
  items,
  onSelectContent,
  numColumns = 5,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  loadMoreThreshold = 0.5,
  preferFirstItemFocus = false,
  header,
}: ContentGridProps) => {
  const { window } = useDimensions();

  const listRef = useRef<FlatList<ContentItemData>>(null);
  // Tracks the last focused row so left/right moves within a row don't
  // re-trigger a vertical scroll (mirrors the browse page's guard).
  const lastFocusedRow = useRef<number | null>(null);
  // Measured header height, used as the offset origin for stepped scrolling.
  const headerHeight = useRef(0);
  // Measured Y offset of each grid row (cell), keyed by row index. Like the
  // browse page's per-row onLayout map, this grounds stepped scrolling in the
  // list's real layout instead of estimated row heights — estimates drift when
  // pages load in mid-scroll and the drift then persists.
  const rowOffsets = useRef<Record<number, number>>({});

  // Paginated genre data can repeat items across page boundaries (page-number
  // pagination over a "newest"-sorted, changing library). Duplicate keys
  // permanently corrupt FlatList's layout bookkeeping, so dedupe defensively.
  const gridItems = useMemo(() => {
    const seen = new Set<string>();
    const deduped = items.filter((item) =>
      seen.has(item.id) ? false : (seen.add(item.id), true),
    );
    if (__DEV__ && deduped.length !== items.length) {
      console.warn(
        `[ContentGrid] Dropped ${items.length - deduped.length} duplicate item(s) across pages`,
      );
    }
    return deduped;
  }, [items]);

  // Trigger load-more when the focused item is within two rows of the end. On
  // TV the grid scrolls in discrete focus steps, so velocity often never builds
  // enough to trip the scroll predictor — a fixed look-ahead is reliable.
  const loadMoreLookahead = numColumns * 2;

  // Size each card so exactly `numColumns` fit within the available width,
  // accounting for the per-item margin and the container's horizontal padding.
  const itemWidth = useMemo(() => {
    const available = window.width - GRID_HORIZONTAL_PADDING * 2;
    return (available - numColumns * ITEM_MARGIN) / numColumns;
  }, [window.width, numColumns]);

  // Full height of one grid row: poster + card chrome + vertical margin.
  // Only a fallback for rows that haven't reported a measured offset yet.
  const rowHeight = useMemo(
    () => itemWidth * 0.6 + CARD_CHROME_HEIGHT + ITEM_MARGIN,
    [itemWidth],
  );

  // Measured offsets are invalidated by any geometry change.
  useEffect(() => {
    rowOffsets.current = {};
  }, [itemWidth, numColumns]);

  // Wrap each FlatList cell (one cell = one grid row when numColumns > 1) to
  // record its real Y position within the list content. Chains the list's own
  // onLayout so virtualization measurement keeps working. Stable identity —
  // it closes over refs only — so cells don't remount on re-render.
  const CellRenderer = useCallback(
    ({
      index,
      children,
      onLayout,
      ...props
    }: React.ComponentProps<typeof View> & { index: number }) => (
      <View
        {...props}
        onLayout={(e: LayoutChangeEvent) => {
          rowOffsets.current[index] = e.nativeEvent.layout.y;
          onLayout?.(e);
        }}
      >
        {children}
      </View>
    ),
    [],
  );

  // Wrap the header so we can measure its height for accurate scroll offsets.
  const headerElement = useMemo(() => {
    if (!header) return null;
    const onLayout = (e: LayoutChangeEvent) => {
      headerHeight.current = e.nativeEvent.layout.height;
    };
    return <View onLayout={onLayout}>{header}</View>;
  }, [header]);

  // Velocity/onEndReached-based loading as a fallback for fast scrolling.
  const smartScroll = useSmartInfiniteScroll({
    hasNextPage,
    isFetching: isFetchingNextPage,
    onLoadMore: onLoadMore ?? (() => {}),
    horizontal: false,
    predictAheadMs: 1000,
    endReachedThreshold: loadMoreThreshold,
  });

  const handleItemFocus = useCallback(
    (index: number) => {
      // Stepped vertical scroll: snap the focused row toward the top, matching
      // the browse page. Only scroll when the focused ROW changes so left/right
      // navigation within a row doesn't re-trigger a vertical scroll.
      //
      // Uses scrollToOffset (never throws) with the row's MEASURED Y position
      // — a focused row is always mounted, so its cell has laid out and
      // reported its real offset. The estimate is only a first-frame fallback.
      const rowIndex = Math.floor(index / numColumns);
      if (lastFocusedRow.current !== rowIndex) {
        lastFocusedRow.current = rowIndex;
        const measuredY = rowOffsets.current[rowIndex];
        const rowY =
          measuredY !== undefined
            ? measuredY
            : headerHeight.current + rowIndex * rowHeight;
        // Row 0 -> offset 0 keeps the header pinned in view at the top.
        const offset = rowIndex === 0 ? 0 : Math.max(0, rowY - GRID_TOP_INSET);
        try {
          listRef.current?.scrollToOffset({ offset, animated: true });
        } catch {
          // A scroll hiccup must never take down the screen.
        }
      }

      if (
        hasNextPage &&
        !isFetchingNextPage &&
        onLoadMore &&
        index >= gridItems.length - loadMoreLookahead
      ) {
        onLoadMore();
      }
    },
    [
      numColumns,
      rowHeight,
      hasNextPage,
      isFetchingNextPage,
      onLoadMore,
      gridItems.length,
      loadMoreLookahead,
    ],
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
        customWidth={itemWidth}
        hasTVPreferredFocus={preferFirstItemFocus && index === 0}
        index={index}
        onFocus={handleItemFocus}
      />
    ),
    [onSelectContent, itemWidth, preferFirstItemFocus, handleItemFocus],
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

  if (gridItems.length === 0) return null;

  return (
    <TVFocusGuideView autoFocus trapFocusLeft trapFocusRight>
      <FlatList
        ref={listRef}
        data={gridItems}
        extraData={[gridItems.length, hasNextPage, isFetchingNextPage]}
        numColumns={numColumns}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator={Platform.isTV}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
        ListHeaderComponent={headerElement}
        ListFooterComponent={renderFooter}
        CellRendererComponent={CellRenderer}
        {...smartScroll}
      />
    </TVFocusGuideView>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 40,
    paddingHorizontal: GRID_HORIZONTAL_PADDING,
  },
  loadingFooter: {
    alignItems: "center",
    paddingVertical: 16,
    width: "100%",
  },
  loadingText: { color: "#999", fontSize: 14 },
  row: {
    justifyContent: "flex-start",
  },
});

export default memo(ContentGrid);
