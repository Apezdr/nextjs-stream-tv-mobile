import { FlashList, ListRenderItem } from "@shopify/flash-list";
import { memo, useCallback, useMemo, useState } from "react";
import { StyleSheet, View, Text, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileActionSheet } from "@/src/components/Mobile/ActionSheet";
import MobileContentCard, {
  MobileContentCardData,
} from "@/src/components/Mobile/Cards/MobileContentCard";
import { Colors } from "@/src/constants/Colors";
import { MOBILE_TAB_CONFIG } from "@/src/constants/MobileNavConstants";
import {
  useActionSheetConfig,
  ActionSheetContentData,
} from "@/src/hooks/useActionSheetConfig";
import { useSmartInfiniteScroll } from "@/src/hooks/useSmartInfiniteScroll";

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
  // Whether this list sits behind a tab bar (adds tab bar height to bottom padding)
  hasTabBar?: boolean;
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
  hasTabBar = true,
}: MobileContentListProps) => {
  const { bottom } = useSafeAreaInsets();
  // Tab bar is absolutely positioned; total height = paddingTop(12) + TAB_BAR_HEIGHT + Math.max(bottom, 12)
  const listBottomPadding = horizontal
    ? 0
    : hasTabBar
      ? MOBILE_TAB_CONFIG.TAB_BAR_HEIGHT + Math.max(bottom, 12) + 12
      : Math.max(bottom, 12);

  // Calculate number of columns for grid layout
  const columns =
    numColumns || (cardSize === "small" ? 3 : cardSize === "large" ? 1 : 2);

  // Single action sheet instance for the entire list
  const { generateConfig, invalidateItemStatus } = useActionSheetConfig();
  const [selectedItem, setSelectedItem] =
    useState<MobileContentCardData | null>(null);

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
      isUnavailable: selectedItem.isUnavailable,
      isComingSoon: selectedItem.isComingSoon,
      comingSoonDate: selectedItem.comingSoonDate,
      backdrop: selectedItem.backdropUrl,
      backdropBlurhash:
        selectedItem.backdropBlurhash || selectedItem.thumbnailBlurhash,
    };
    return generateConfig(contentData, "card", {
      onClose: handleClose,
      onPlay: (data) => {
        handleClose();
        onPlayContent(
          data.id,
          data.mediaType,
          data.seasonNumber,
          data.episodeNumber,
          data.backdrop,
          data.backdropBlurhash,
        );
      },
      onInfo: (data) => {
        handleClose();
        onInfoContent(
          data.id,
          data.mediaType,
          data.seasonNumber,
          data.episodeNumber,
          data.backdrop,
          data.backdropBlurhash,
        );
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

  const renderItem: ListRenderItem<MobileContentCardData> = useCallback(
    ({ item }) => (
      <MobileContentCard
        item={item}
        onPress={handleCardPress}
        layout={layout}
        size={cardSize}
      />
    ),
    [handleCardPress, layout, cardSize],
  );

  const smartScroll = useSmartInfiniteScroll({
    hasNextPage,
    isFetching: isFetchingNextPage,
    onLoadMore: onLoadMore ?? (() => {}),
    horizontal,
    predictAheadMs: 1200,
  });

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

      <FlashList
        data={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        horizontal={horizontal}
        numColumns={horizontal ? 1 : columns}
        key={`${horizontal ? "horizontal" : "vertical"}-${columns}`}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={!horizontal}
        contentContainerStyle={[
          styles.listContent,
          horizontal
            ? styles.horizontalContent
            : { paddingBottom: listBottomPadding },
        ]}
        drawDistance={500}
        // Smart infinite scroll
        {...smartScroll}
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
    paddingBottom: 80,
    paddingLeft: 16,
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
