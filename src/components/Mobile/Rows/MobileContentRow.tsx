import React, { memo, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ListRenderItem,
} from "react-native";

import MobileContentCard, {
  MobileContentCardData,
} from "@/src/components/Mobile/Cards/MobileContentCard";
import { Colors } from "@/src/constants/Colors";
import { useDimensions } from "@/src/hooks/useDimensions";

interface MobileContentRowProps {
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
  cardSize?: "small" | "medium" | "large";
  showMoreButton?: boolean;
  onShowMore?: () => void;
  // Infinite scroll support
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  // Loading state
  loading?: boolean;
  // Empty state
  emptyMessage?: string;
}

const MobileContentRow = ({
  title,
  data,
  onPlayContent,
  onInfoContent,
  cardSize = "medium",
  showMoreButton = false,
  onShowMore,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  loading = false,
  emptyMessage = "No content available",
}: MobileContentRowProps) => {
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
  // Get screen dimensions to detect orientation changes
  const { window } = useDimensions();
  const screenWidth = window.width;
  const screenHeight = window.height;
  const isLandscape = screenWidth > screenHeight;

  // Create a unique orientation key that changes when orientation changes
  const orientationKey = useMemo(
    () =>
      `orientation-${isLandscape ? "landscape" : "portrait"}-${screenWidth}x${screenHeight}`,
    [screenWidth, screenHeight, isLandscape],
  );

  // Render individual content card with orientation awareness
  const renderItem: ListRenderItem<MobileContentCardData> = useCallback(
    ({ item, index }) => (
      <View style={[styles.cardContainer, index === 0 && styles.firstCard]}>
        <MobileContentCard
          item={item}
          onPlay={handlePlayContent}
          onInfo={handleInfoContent}
          layout="grid"
          size={cardSize}
          // Pass a key that changes with orientation to force re-render
          orientationKey={orientationKey}
        />
      </View>
    ),
    [handlePlayContent, handleInfoContent, cardSize, orientationKey],
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
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  // Key extractor - include orientation in the key to force re-render on orientation change
  const keyExtractor = useCallback(
    (item: MobileContentCardData, index: number) =>
      `${title}-${item.id}-${index}-${orientationKey}`,
    [title, orientationKey],
  );

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.loadingTitle} />
        </View>
        <View style={styles.loadingCardsContainer}>
          {[1, 2, 3].map((index) => (
            <View key={index} style={styles.loadingCard} />
          ))}
        </View>
      </View>
    );
  }

  // Empty state
  if (data.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {showMoreButton && onShowMore && (
          <TouchableOpacity onPress={onShowMore} style={styles.showMoreButton}>
            <Text style={styles.showMoreText}>See All</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        // Infinite scroll
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        // Performance optimizations
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={21}
        initialNumToRender={4}
        // Force re-render when orientation changes
        extraData={orientationKey}
        // Key that changes with orientation to force component recreation
        key={`row-${title}-${orientationKey}`}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginHorizontal: 4,
  },
  container: {
    marginBottom: 24,
  },
  emptyContainer: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  emptyText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 14,
    textAlign: "center",
  },
  firstCard: {
    marginLeft: 8,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingHorizontal: 8,
  },
  loadingCard: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    height: 180,
    width: 120,
  },
  loadingCardsContainer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
  },
  loadingFooter: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  loadingText: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 12,
  },
  loadingTitle: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 4,
    height: 20,
    width: 140,
  },
  showMoreButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  showMoreText: {
    color: Colors.dark.brandPrimary,
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
  },
});

// Only re-render when essential props change or dimensions change
const areEqual = (
  prevProps: MobileContentRowProps,
  nextProps: MobileContentRowProps,
) => {
  // Always re-render if data reference changes
  if (prevProps.data !== nextProps.data) {
    return false;
  }

  // Fast-fail on props that definitely require re-render
  if (
    prevProps.title !== nextProps.title ||
    prevProps.cardSize !== nextProps.cardSize ||
    prevProps.loading !== nextProps.loading ||
    prevProps.isFetchingNextPage !== nextProps.isFetchingNextPage ||
    prevProps.showMoreButton !== nextProps.showMoreButton
  ) {
    return false;
  }

  // Consider equal (no re-render needed)
  return true;
};

export default memo(MobileContentRow, areEqual);
