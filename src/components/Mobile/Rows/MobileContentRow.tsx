import { FlashList, ListRenderItem } from "@shopify/flash-list";
import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, View, Text, TouchableOpacity } from "react-native";

import { MobileActionSheet } from "@/src/components/Mobile/ActionSheet";
import MobileContentCard, {
  MobileContentCardData,
} from "@/src/components/Mobile/Cards/MobileContentCard";
import { Colors } from "@/src/constants/Colors";
import { useDimensions } from "@/src/hooks/useDimensions";
import {
  useActionSheetConfig,
  ActionSheetContentData,
} from "@/src/hooks/useActionSheetConfig";
import { useSmartInfiniteScroll } from "@/src/hooks/useSmartInfiniteScroll";

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
  // Single action sheet instance for the entire row
  const { generateConfig, invalidateItemStatus } = useActionSheetConfig();
  const [selectedItem, setSelectedItem] = useState<MobileContentCardData | null>(null);

  const handleClose = useCallback(() => setSelectedItem(null), []);

  const actionSheetConfig = useMemo(() => {
    if (!selectedItem) return null;
    const contentData: ActionSheetContentData = {
      id: selectedItem.showId || selectedItem.id,
      tmdbId: selectedItem.tmdbId,
      title: selectedItem.title,
      mediaType: selectedItem.mediaType || "movie",
      seasonNumber: selectedItem.seasonNumber,
      episodeNumber: selectedItem.episodeNumber,
      backdrop: selectedItem.backdropUrl,
      backdropBlurhash: selectedItem.backdropBlurhash || selectedItem.thumbnailBlurhash,
    };
    return generateConfig(contentData, "card", {
      onClose: handleClose,
      onPlay: (data) => {
        handleClose();
        onPlayContent(data.id, data.mediaType, data.seasonNumber, data.episodeNumber, data.backdrop, data.backdropBlurhash);
      },
      onInfo: (data) => {
        handleClose();
        onInfoContent(data.id, data.mediaType, data.seasonNumber, data.episodeNumber, data.backdrop, data.backdropBlurhash);
      },
    });
  }, [selectedItem, generateConfig, handleClose, onPlayContent, onInfoContent]);

  const handleCardPress = useCallback(
    (item: MobileContentCardData) => {
      invalidateItemStatus({
        id: item.showId || item.id,
        tmdbId: item.tmdbId,
        title: item.title,
        mediaType: item.mediaType || "movie",
      });
      setSelectedItem(item);
    },
    [invalidateItemStatus],
  );

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

  // Mirror MobileContentCard's dimension calculation so FlashList has an
  // explicit height for the horizontal list (required by FlashList 2.x)
  const itemHeight = useMemo(() => {
    const columns = isLandscape
      ? cardSize === "small" ? 5 : cardSize === "large" ? 3.5 : 4
      : cardSize === "small" ? 3 : cardSize === "large" ? 2 : 2.5;
    const padding = 16;
    const cardWidth = Math.floor((screenWidth - padding * (columns + 1)) / columns);
    return Math.floor(cardWidth * 1.5);
  }, [screenWidth, isLandscape, cardSize]);

  const renderItem: ListRenderItem<MobileContentCardData> = useCallback(
    ({ item, index }) => (
      <View style={[styles.cardContainer, index === 0 && styles.firstCard]}>
        <MobileContentCard
          item={item}
          onPress={handleCardPress}
          layout="grid"
          size={cardSize}
        />
      </View>
    ),
    [handleCardPress, cardSize],
  );

  const smartScroll = useSmartInfiniteScroll({
    hasNextPage,
    isFetching: isFetchingNextPage,
    onLoadMore: onLoadMore ?? (() => {}),
    horizontal: true,
    predictAheadMs: 800,
  });

  // Render loading footer
  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;

    return (
      <View style={styles.loadingFooter}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }, [isFetchingNextPage]);

  const keyExtractor = useCallback(
    (item: MobileContentCardData, index: number) => `${title}-${item.id}-${index}`,
    [title],
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

      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        style={{ height: itemHeight }}
        // Smart infinite scroll
        {...smartScroll}
        ListFooterComponent={renderFooter}
        drawDistance={250}
        extraData={orientationKey}
        key={`row-${title}`}
      />

      {selectedItem && actionSheetConfig && (
        <MobileActionSheet
          visible
          onClose={handleClose}
          title={actionSheetConfig.title}
          subtitle={actionSheetConfig.subtitle}
          actions={actionSheetConfig.actions}
          onBack={actionSheetConfig.onBack}
        />
      )}
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
