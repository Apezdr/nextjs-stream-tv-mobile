import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { Colors } from "@/src/constants/Colors";
import { useDimensions } from "@/src/hooks/useDimensions";

export interface MobileContentCardData {
  id: string;
  tmdbId?: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailBlurhash?: string;
  showId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  mediaType?: "movie" | "tv";
  link?: string;
  isUnavailable?: boolean;
  isComingSoon?: boolean;
  comingSoonDate?: string | null;
  backdropUrl?: string;
  backdropBlurhash?: string;
  hdr?: string;
  logo?: string;
  releaseDate?: string;
  rating?: number;
  isTrailer?: boolean;
}

interface MobileContentCardProps {
  item: MobileContentCardData;
  /** Called when the card is tapped. The parent is responsible for showing the action sheet. */
  onPress: (item: MobileContentCardData) => void;
  layout?: "grid" | "list";
  size?: "small" | "medium" | "large";
}

const MobileContentCard = ({
  item,
  onPress,
  layout = "grid",
  size = "medium",
}: MobileContentCardProps) => {
  // Get responsive dimensions that will update with orientation changes
  const { window } = useDimensions();
  const screenWidth = window.width;

  // Check if we're in landscape mode
  const isLandscape = window.width > window.height;

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

    // Grid layout calculations - adjust columns based on orientation
    let columns;
    if (isLandscape) {
      // More columns in landscape mode
      columns = size === "small" ? 5 : size === "large" ? 3.5 : 4;
    } else {
      // Fewer columns in portrait mode
      columns = size === "small" ? 3 : size === "large" ? 2 : 2.5;
    }

    const padding = 16;
    // Calculate fixed card width based on screen size and columns
    const cardWidth = Math.floor(
      (screenWidth - padding * (columns + 1)) / columns,
    );
    // Maintain aspect ratio for posters (2:3)
    const cardHeight = Math.floor(cardWidth * 1.5);

    return {
      width: cardWidth,
      height: cardHeight,
      imageWidth: cardWidth,
      imageHeight: cardWidth * 1.4,
    };
  }, [layout, size, screenWidth, isLandscape]);

  const handlePress = useCallback(() => {
    onPress(item);
  }, [onPress, item]);

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

        {/* Trailer badge */}
        {item.isTrailer && (
          <View style={[styles.trailerBadge, styles.trailerBadgeAbsolute]}>
            <Ionicons name="play-circle" size={10} color="#FFFFFF" />
            <Text style={styles.trailerBadgeText}>Trailer</Text>
          </View>
        )}

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
        width={450}
        quality={75}
        placeholder={{
          uri: `data:image/png;base64,${item?.thumbnailBlurhash}`,
        }}
        placeholderContentFit="cover"
        contentFit="cover"
        transition={300}
        priority="high"
        recyclingKey={`${item.thumbnailUrl}-${dimensions.width}x${dimensions.height}`}
      />

      {/* Top-left badge stack: season/episode and/or trailer */}
      {((item.seasonNumber && item.episodeNumber) || item.isTrailer) && (
        <View style={styles.topLeftBadges}>
          {item.seasonNumber && item.episodeNumber && (
            <View style={styles.gridEpisodeOverlay}>
              <Text style={styles.gridEpisodeText}>
                S{item.seasonNumber}E{item.episodeNumber}
              </Text>
            </View>
          )}
          {item.isTrailer && (
            <View style={styles.trailerBadge}>
              <Ionicons name="play-circle" size={10} color="#FFFFFF" />
              <Text style={styles.trailerBadgeText}>Trailer</Text>
            </View>
          )}
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
    margin: 5,
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
    paddingHorizontal: 6,
    paddingVertical: 3,
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
    fontSize: 12,
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
  topLeftBadges: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
    left: 8,
    position: "absolute",
    top: 8,
    zIndex: 2,
  },
  trailerBadge: {
    alignItems: "center",
    backgroundColor: "rgba(147, 51, 234, 0.9)",
    borderRadius: 4,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  trailerBadgeAbsolute: {
    left: 8,
    position: "absolute",
    top: 8,
    zIndex: 2,
  },
  trailerBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "600",
  },
});

const areEqual = (
  prevProps: MobileContentCardProps,
  nextProps: MobileContentCardProps,
) => {
  return (
    prevProps.item === nextProps.item &&
    prevProps.onPress === nextProps.onPress &&
    prevProps.layout === nextProps.layout &&
    prevProps.size === nextProps.size
  );
};

export default memo(MobileContentCard, areEqual);
