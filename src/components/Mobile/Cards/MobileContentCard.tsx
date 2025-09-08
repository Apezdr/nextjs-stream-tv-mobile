import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Platform,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import {
  MobileActionSheet,
  ActionSheetAction,
} from "@/src/components/Mobile/ActionSheet";
import { Colors } from "@/src/constants/Colors";
import { useBackdropManager } from "@/src/hooks/useBackdrop";

// Get screen width for responsive sizing
const { width: screenWidth } = Dimensions.get("window");

export interface MobileContentCardData {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailBlurhash?: string;
  showId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  mediaType?: "movie" | "tv";
  link?: string;
  backdropUrl?: string;
  backdropBlurhash?: string;
  hdr?: string;
  logo?: string;
  releaseDate?: string;
  rating?: number;
}

interface MobileContentCardProps {
  item: MobileContentCardData;
  onPlay: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  onInfo: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
    backdropUrl?: string,
    backdropBlurhash?: string,
  ) => void;
  layout?: "grid" | "list";
  size?: "small" | "medium" | "large";
}

const MobileContentCard = ({
  item,
  onPlay,
  onInfo,
  layout = "grid",
  size = "medium",
}: MobileContentCardProps) => {
  const { show: showBackdrop } = useBackdropManager();
  const [actionSheetVisible, setActionSheetVisible] = useState(false);

  // Calculate responsive dimensions
  const dimensions = useMemo(() => {
    if (layout === "list") {
      return {
        width: screenWidth - 32, // Full width minus padding
        height: 120,
        imageWidth: 160,
        imageHeight: 90,
      };
    }

    // Grid layout calculations
    const columns = size === "small" ? 3 : size === "large" ? 2 : 2.5;
    const padding = 16;
    const cardWidth = (screenWidth - padding * (columns + 1)) / columns;
    const cardHeight = cardWidth * 1.5; // 2:3 aspect ratio for posters

    return {
      width: cardWidth,
      height: cardHeight,
      imageWidth: cardWidth,
      imageHeight: cardWidth * 1.5,
    };
  }, [layout, size]);

  // Handle card press - show action sheet
  const handlePress = useCallback(() => {
    setActionSheetVisible(true);
  }, []);

  // Handle play action
  const handlePlay = useCallback(() => {
    // Show backdrop if available
    if (item.backdropUrl) {
      showBackdrop(item.backdropUrl, {
        fade: true,
        duration: 300,
        blurhash: item.backdropBlurhash || item.thumbnailBlurhash,
      });

      // Prefetch backdrop for smooth transition
      Image.prefetch(item.backdropUrl).catch((err) =>
        console.warn("[MobileContentCard] prefetch error:", err),
      );
    }

    onPlay(
      item.showId || item.id,
      item.seasonNumber,
      item.episodeNumber,
      item.mediaType || "movie",
      item.backdropUrl,
      item.backdropBlurhash || item.thumbnailBlurhash,
    );
  }, [
    showBackdrop,
    onPlay,
    item.showId,
    item.id,
    item.seasonNumber,
    item.episodeNumber,
    item.mediaType,
    item.backdropUrl,
    item.backdropBlurhash,
    item.thumbnailBlurhash,
  ]);

  // Handle info action
  const handleInfo = useCallback(() => {
    // Show backdrop if available
    if (item.backdropUrl) {
      showBackdrop(item.backdropUrl, {
        fade: true,
        duration: 300,
        blurhash: item.backdropBlurhash || item.thumbnailBlurhash,
      });

      // Prefetch backdrop for smooth transition
      Image.prefetch(item.backdropUrl).catch((err) =>
        console.warn("[MobileContentCard] prefetch error:", err),
      );
    }

    onInfo(
      item.showId || item.id,
      item.seasonNumber,
      item.episodeNumber,
      item.mediaType || "movie",
      item.backdropUrl,
      item.backdropBlurhash || item.thumbnailBlurhash,
    );
  }, [
    showBackdrop,
    onInfo,
    item.showId,
    item.id,
    item.seasonNumber,
    item.episodeNumber,
    item.mediaType,
    item.backdropUrl,
    item.backdropBlurhash,
    item.thumbnailBlurhash,
  ]);

  // Generate action sheet actions
  const actionSheetActions = useMemo((): ActionSheetAction[] => {
    const actions: ActionSheetAction[] = [];

    // Play action
    actions.push({
      id: "play",
      title: "Play",
      icon: "play",
      variant: "primary",
      onPress: handlePlay,
    });

    // Info action - varies based on content type
    if (item.mediaType === "tv" && item.seasonNumber && item.episodeNumber) {
      // Episode - go to episode info
      actions.push({
        id: "info",
        title: "Episode Info",
        icon: "information-circle",
        onPress: handleInfo,
      });
    } else {
      // Movie or show - go to media info
      actions.push({
        id: "info",
        title: item.mediaType === "movie" ? "Movie Info" : "Show Info",
        icon: "information-circle",
        onPress: handleInfo,
      });
    }

    return actions;
  }, [
    item.mediaType,
    item.seasonNumber,
    item.episodeNumber,
    handlePlay,
    handleInfo,
  ]);

  // Generate action sheet title and subtitle
  const actionSheetTitle = item.title;
  const actionSheetSubtitle = useMemo(() => {
    if (item.mediaType === "tv" && item.seasonNumber && item.episodeNumber) {
      return `S${item.seasonNumber}E${item.episodeNumber}`;
    }
    return item.mediaType === "movie" ? "Movie" : "TV Show";
  }, [item.mediaType, item.seasonNumber, item.episodeNumber]);

  if (layout === "list") {
    return (
      <TouchableOpacity
        style={[styles.listContainer, { height: dimensions.height }]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <OptimizedImage
          source={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
          style={[
            styles.listImage,
            {
              width: dimensions.imageWidth,
              height: dimensions.imageHeight,
            },
          ]}
          placeholder={{
            uri: `data:image/png;base64,${item?.thumbnailBlurhash}`,
          }}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={200}
        />

        <View style={styles.listContent}>
          <Text style={styles.listTitle} numberOfLines={2}>
            {item.title}
          </Text>

          {item.description && (
            <Text style={styles.listDescription} numberOfLines={3}>
              {item.description}
            </Text>
          )}

          <View style={styles.listMeta}>
            {item.seasonNumber && item.episodeNumber && (
              <Text style={styles.listEpisodeInfo}>
                S{item.seasonNumber}E{item.episodeNumber}
              </Text>
            )}

            {item.hdr && (
              <View style={styles.hdrBadge}>
                <Text style={styles.hdrText}>HDR</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.listPlayButton}>
          <Ionicons
            name="play-circle"
            size={28}
            color={Colors.dark.brandPrimary}
          />
        </View>
      </TouchableOpacity>
    );
  }

  // Grid layout
  return (
    <>
      <TouchableOpacity
        style={[
          styles.gridContainer,
          {
            width: dimensions.width,
            height: dimensions.height,
          },
        ]}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <OptimizedImage
          source={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
          style={[
            styles.gridImage,
            {
              width: dimensions.imageWidth,
              height: dimensions.imageHeight * 0.75, // Leave room for title
            },
          ]}
          placeholder={{
            uri: `data:image/png;base64,${item?.thumbnailBlurhash}`,
          }}
          placeholderContentFit="cover"
          contentFit="cover"
          transition={200}
        />

        {/* Season/Episode overlay for TV shows */}
        {item.seasonNumber && item.episodeNumber && (
          <View style={styles.gridEpisodeOverlay}>
            <Text style={styles.gridEpisodeText}>
              S{item.seasonNumber}E{item.episodeNumber}
            </Text>
          </View>
        )}

        {/* HDR badge */}
        {item.hdr && (
          <View style={styles.gridHdrBadge}>
            <Text style={styles.gridHdrText}>HDR</Text>
          </View>
        )}

        {/* Play button overlay */}
        <View style={styles.gridPlayOverlay}>
          <Ionicons
            name="play-circle"
            size={32}
            color="rgba(255, 255, 255, 0.9)"
          />
        </View>

        {/* Title section */}
        <View style={styles.gridTitleSection}>
          <Text style={styles.gridTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Action Sheet */}
      <MobileActionSheet
        visible={actionSheetVisible}
        onClose={() => setActionSheetVisible(false)}
        title={actionSheetTitle}
        subtitle={actionSheetSubtitle}
        actions={actionSheetActions}
      />
    </>
  );
};

const styles = StyleSheet.create({
  // List layout styles
  listContainer: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    flexDirection: "row",
    marginBottom: 12,
    marginHorizontal: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  listImage: {
    borderBottomLeftRadius: 8,
    borderTopLeftRadius: 8,
  },
  listContent: {
    flex: 1,
    justifyContent: "space-between",
    padding: 12,
  },
  listTitle: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  listDescription: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  listMeta: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  listEpisodeInfo: {
    color: Colors.dark.brandPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  listPlayButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },

  // Grid layout styles
  gridContainer: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 8,
    margin: 8,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  gridImage: {
    width: "100%",
  },
  gridEpisodeOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 4,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    position: "absolute",
    top: 8,
  },
  gridEpisodeText: {
    color: Colors.dark.whiteText,
    fontSize: 11,
    fontWeight: "600",
  },
  gridHdrBadge: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: "absolute",
    right: 8,
    top: 8,
  },
  gridHdrText: {
    color: Colors.dark.whiteText,
    fontSize: 9,
    fontWeight: "700",
  },
  gridPlayOverlay: {
    left: "50%",
    opacity: 0.8,
    position: "absolute",
    top: "35%",
    transform: [{ translateX: -16 }, { translateY: -16 }],
  },
  gridTitleSection: {
    flex: 1,
    justifyContent: "center",
    padding: 12,
  },
  gridTitle: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "500",
    textAlign: "center",
  },

  // Common badge styles
  hdrBadge: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  hdrText: {
    color: Colors.dark.whiteText,
    fontSize: 9,
    fontWeight: "700",
  },
});

// Optimization: Only re-render when essential props change
const areEqual = (
  prevProps: MobileContentCardProps,
  nextProps: MobileContentCardProps,
) => {
  return (
    prevProps.layout === nextProps.layout &&
    prevProps.size === nextProps.size &&
    prevProps.item === nextProps.item
  );
};

export default memo(MobileContentCard, areEqual);
