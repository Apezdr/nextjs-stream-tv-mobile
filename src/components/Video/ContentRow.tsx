import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  TVFocusGuideView,
} from "react-native";

import ContentItem, {
  ContentItemData,
} from "@/src/components/Video/ContentItem";
import { useScrollVelocityTracker } from "@/src/hooks/useScrollVelocityTracker";

// Create a TV-compatible TouchableOpacity component
interface TVTouchableProps
  extends React.ComponentProps<typeof RNTouchableOpacity> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

// Use TypeScript casting to create a TV-compatible TouchableOpacity
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

interface ContentRowProps {
  title: string;
  items: ContentItemData[];
  onSelectContent: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
  ) => void;
  itemSize?: "small" | "medium" | "large";
  showMoreButton?: boolean;
  onShowMore?: () => void;
  refreshing?: boolean;
  // Infinite scrolling props
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  loadMoreThreshold?: number; // Default: 0.6 (60% for faster preloading)
  onPrefetch?: () => void; // Early prefetch trigger
  onPrefetchMultiple?: (distance: number) => void; // Multi-page prefetch
  onPrefetchBulk?: (maxPages: number) => void; // Bulk prefetch
  prefetchThreshold?: number; // Default: 0.2 (20% for ultra-aggressive)
}

const ContentRow = ({
  title,
  items,
  onSelectContent,
  itemSize = "medium",
  showMoreButton = false,
  onShowMore,
  refreshing = false,
  // Infinite scrolling props
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  loadMoreThreshold = 0.7, // More conservative: trigger at 70%
  onPrefetch,
  onPrefetchMultiple,
  onPrefetchBulk,
  prefetchThreshold = 0.6, // More conservative: trigger at 60%
}: ContentRowProps) => {
  // Velocity tracking for aggressive prefetching
  const { velocityData, trackScrollVelocity } = useScrollVelocityTracker();

  // Track active prefetch requests for cleanup
  const activeRequests = useRef<Set<Promise<unknown>>>(new Set());

  // Direct prefetch with request tracking
  const triggerPrefetch = useCallback(() => {
    if (onPrefetch) {
      onPrefetch();
    }
  }, [onPrefetch]);

  // Multi-page prefetch based on velocity
  const triggerMultiPrefetch = useCallback(() => {
    if (onPrefetchMultiple && velocityData.prefetchDistance > 1) {
      onPrefetchMultiple(velocityData.prefetchDistance);
    }
  }, [onPrefetchMultiple, velocityData.prefetchDistance]);

  // Bulk prefetch for ultra-high velocity
  const triggerBulkPrefetch = useCallback(() => {
    if (onPrefetchBulk && velocityData.velocity > 5) {
      // More conservative: prefetch 2 pages for very fast scrolling
      onPrefetchBulk(2);
    }
  }, [onPrefetchBulk, velocityData.velocity]);

  // Calculate item dimensions for getItemLayout
  const itemDimensions = useMemo(() => {
    const { width } = Dimensions.get("window");
    const getItemWidth = () => {
      switch (itemSize) {
        case "small":
          return width / 5;
        case "large":
          return width / 2;
        case "medium":
        default:
          return width / 3.5;
      }
    };
    const itemWidth = getItemWidth();
    const itemMargin = 16; // 8px margin on each side
    return { itemWidth, itemMargin, totalItemWidth: itemWidth + itemMargin };
  }, [itemSize]);

  // Render item function for FlatList
  const renderItem = useCallback(
    ({ item, index }: { item: ContentItemData; index: number }) => (
      <ContentItem
        item={item}
        onSelect={onSelectContent}
        size={itemSize}
        hasTVPreferredFocus={index === 0}
      />
    ),
    [onSelectContent, itemSize],
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: ContentItemData) => item.id, []);

  // getItemLayout for better performance
  const getItemLayout = useCallback(
    (data: unknown, index: number) => ({
      length: itemDimensions.totalItemWidth,
      offset: itemDimensions.totalItemWidth * index,
      index,
    }),
    [itemDimensions.totalItemWidth],
  );

  // Handle end reached for infinite scrolling
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && onLoadMore) {
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  // Ultra-aggressive scroll handling with velocity-based prefetching
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!hasNextPage || isFetchingNextPage) return;

      // Track velocity first
      trackScrollVelocity(event);

      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const scrollPosition = contentOffset.x;
      const totalWidth = contentSize.width;
      const visibleWidth = layoutMeasurement.width;

      // Calculate scroll percentage
      const scrollPercentage = scrollPosition / (totalWidth - visibleWidth);

      // Ultra-aggressive prefetching strategy
      if (scrollPercentage >= prefetchThreshold) {
        // Always trigger basic prefetch
        triggerPrefetch();

        // Velocity-based aggressive prefetching
        if (velocityData.isHighVelocity) {
          triggerMultiPrefetch();
        }

        // Ultra-high velocity bulk prefetching
        if (velocityData.velocity > 5) {
          triggerBulkPrefetch();
        }
      }

      // More conservative: start prefetching at 40% for fast users
      if (scrollPercentage >= 0.4 && velocityData.velocity > 4) {
        triggerMultiPrefetch();
      }
    },
    [
      hasNextPage,
      isFetchingNextPage,
      prefetchThreshold,
      trackScrollVelocity,
      triggerPrefetch,
      triggerMultiPrefetch,
      triggerBulkPrefetch,
      velocityData.isHighVelocity,
      velocityData.velocity,
    ],
  );

  // Render footer for loading indicator
  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;

    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.loadingText}>Loading more...</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  // Cleanup effect to cancel pending requests when component unmounts
  useEffect(() => {
    const requests = activeRequests.current;
    return () => {
      // Cancel any pending prefetch requests
      requests.forEach((request) => {
        // Note: Individual request cancellation would need to be implemented
        // in the specific prefetch functions if they return cancellable promises
      });
      requests.clear();
    };
  }, []);

  if (!items || items.length === 0) {
    return null;
  }

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

      <TVFocusGuideView autoFocus trapFocusRight>
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          horizontal
          showsHorizontalScrollIndicator={Platform.isTV}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          fadingEdgeLength={50}
          // More conservative performance settings
          initialNumToRender={Platform.isTV ? 10 : 8}
          maxToRenderPerBatch={Platform.isTV ? 15 : 8}
          windowSize={Platform.isTV ? 15 : 8}
          updateCellsBatchingPeriod={Platform.isTV ? 16 : 50}
          // Scroll behavior optimization
          scrollEventThrottle={16}
          decelerationRate="fast"
          removeClippedSubviews={Platform.isTV}
          getItemLayout={getItemLayout}
          // Disable paging for TV to allow smooth scrolling
          pagingEnabled={!Platform.isTV}
          // Ultra-aggressive infinite scrolling
          onEndReached={handleEndReached}
          onEndReachedThreshold={loadMoreThreshold}
          onScroll={handleScroll}
          ListFooterComponent={renderFooter}
        />
      </TVFocusGuideView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 30,
  },
  headerContainer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  loadingFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 10,
    width: 100,
  },
  loadingText: {
    color: "#999",
    fontSize: 12,
  },
  scrollContent: {
    paddingLeft: 2,
    paddingRight: 2,
  },
  scrollView: {
    alignSelf: "center",
    flexGrow: 0,
    maxWidth: "100%",
    width: "99%",
  },
  showMoreButton: {
    padding: 8,
  },
  showMoreText: {
    color: "#999",
    fontSize: 16,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "bold",
  },
});

// Simplified comparison function to prevent excessive re-renders
const areEqual = (prevProps: ContentRowProps, nextProps: ContentRowProps) => {
  // Only compare essential props that would affect rendering
  if (
    prevProps.title !== nextProps.title ||
    prevProps.itemSize !== nextProps.itemSize ||
    prevProps.showMoreButton !== nextProps.showMoreButton ||
    prevProps.refreshing !== nextProps.refreshing ||
    prevProps.items.length !== nextProps.items.length
  ) {
    return false;
  }

  // Quick check for items array changes - only compare first few items
  for (let i = 0; i < Math.min(5, prevProps.items.length); i++) {
    if (prevProps.items[i]?.id !== nextProps.items[i]?.id) {
      return false;
    }
  }

  return true;
};

export default memo(ContentRow, areEqual);
