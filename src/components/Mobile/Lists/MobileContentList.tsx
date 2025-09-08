import React, { memo, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ListRenderItem,
  RefreshControl,
} from "react-native";

import MobileContentCard, {
  MobileContentCardData,
} from "@/src/components/Mobile/Cards/MobileContentCard";
import { Colors } from "@/src/constants/Colors";

interface MobileContentListProps {
  title: string;
  data: MobileContentCardData[];
  onPlayContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  onInfoContent: (
    showId: string,
    mediaType: "movie" | "tv",
    seasonNumber?: number,
    episodeNumber?: number,
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  layout?: "grid" | "list";
  cardSize?: "small" | "medium" | "large";
  horizontal?: boolean;
  showHeader?: boolean;
  // Infinite scroll support
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  // Pull to refresh support
  isRefreshing?: boolean;
  onRefresh?: () => void;
  // Empty state
  emptyMessage?: string;
  // Loading state
  loading?: boolean;
  numColumns?: number;
}

const MobileContentList = ({
  title,
  data,
  onPlayContent,
  onInfoContent,
  layout = "grid",
  cardSize = "medium",
  horizontal = false,
  showHeader = true,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  isRefreshing = false,
  onRefresh,
  emptyMessage = "No content available",
  loading = false,
  numColumns,
}: MobileContentListProps) => {
  // Calculate number of columns for grid layout
  const columns =
    numColumns || (cardSize === "small" ? 3 : cardSize === "large" ? 1 : 2);

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
      onPlayContent(
        showId,
        mediaType,
        seasonNumber,
        episodeNumber,
        backdropUrl,
        backdropBlurhash,
      );
    },
    [onPlayContent],
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
      onInfoContent(
        showId,
        mediaType,
        seasonNumber,
        episodeNumber,
        backdropUrl,
        backdropBlurhash,
      );
    },
    [onInfoContent],
  );

  // Render individual content card
  const renderItem: ListRenderItem<MobileContentCardData> = useCallback(
    ({ item }) => (
      <MobileContentCard
        item={item}
        onPlay={handlePlayContent}
        onInfo={handleInfoContent}
        layout={layout}
        size={cardSize}
      />
    ),
    [handlePlayContent, handleInfoContent, layout, cardSize],
  );

  // Handle end reached for infinite scroll
  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && onLoadMore) {
      onLoadMore();
    }
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  // Render loading footer
  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;

    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.loadingText}>Loading more...</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  // Render empty state
  const renderEmpty = useCallback(() => {
    if (loading) return null;

    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }, [loading, emptyMessage]);

  // Key extractor
  const keyExtractor = useCallback(
    (item: MobileContentCardData) => item.id,
    [],
  );

  // Loading skeleton (simplified)
  if (loading) {
    return (
      <View style={styles.container}>
        {showHeader && (
          <View style={styles.header}>
            <View style={styles.loadingTitle} />
          </View>
        )}
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            Loading {title.toLowerCase()}...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {showHeader && (
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
      )}

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal={horizontal}
        numColumns={horizontal ? 1 : columns}
        key={`${horizontal ? "horizontal" : "vertical"}-${columns}`} // Force re-render when layout changes
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={!horizontal}
        contentContainerStyle={[
          styles.listContent,
          horizontal && styles.horizontalContent,
          data.length === 0 && styles.emptyListContent,
        ]}
        columnWrapperStyle={!horizontal && columns > 1 ? styles.row : undefined}
        // Infinite scroll
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        // Pull to refresh
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.dark.brandPrimary}
              colors={[Colors.dark.brandPrimary]}
            />
          ) : undefined
        }
        // Empty state
        ListEmptyComponent={renderEmpty}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={horizontal ? 10 : 6}
        windowSize={horizontal ? 21 : 10}
        initialNumToRender={horizontal ? 6 : 4}
        getItemLayout={
          layout === "grid" && !horizontal
            ? (data, index) => {
                const itemHeight =
                  cardSize === "small" ? 200 : cardSize === "large" ? 300 : 250;
                return {
                  length: itemHeight,
                  offset: itemHeight * Math.floor(index / columns),
                  index,
                };
              }
            : undefined
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 60,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    textAlign: "center",
  },
  header: {
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  horizontalContent: {
    paddingHorizontal: 8,
  },
  listContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  loadingFooter: {
    alignItems: "center",
    paddingVertical: 20,
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
  },
  loadingTitle: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 4,
    height: 24,
    width: 120,
  },
  row: {
    justifyContent: "space-around",
    paddingHorizontal: 8,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 22,
    fontWeight: "bold",
  },
});

// Only re-render when essential props change
const areEqual = (
  prevProps: MobileContentListProps,
  nextProps: MobileContentListProps,
) => {
  return (
    prevProps.title === nextProps.title &&
    prevProps.data.length === nextProps.data.length &&
    prevProps.layout === nextProps.layout &&
    prevProps.cardSize === nextProps.cardSize &&
    prevProps.horizontal === nextProps.horizontal &&
    prevProps.loading === nextProps.loading &&
    prevProps.isRefreshing === nextProps.isRefreshing &&
    prevProps.isFetchingNextPage === nextProps.isFetchingNextPage
  );
};

export default memo(MobileContentList, areEqual);
