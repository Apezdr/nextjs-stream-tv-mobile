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
  trapFocusDown = false,
  trapFocusLeft = false,
  trapFocusRight = true,
  showHeader = true,
  preferFirstItemFocus = false,
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

  const smartScroll = useSmartInfiniteScroll({
    hasNextPage,
    isFetching: isFetchingNextPage,
    onLoadMore: onLoadMore ?? (() => {}),
    horizontal: true,
    predictAheadMs: 1000,
  });

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
      />
    ),
    [onSelectContent, itemSize, preferFirstItemFocus],
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
    <View style={styles.container}>
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
