import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { memo, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { Colors } from "@/src/constants/Colors";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useDimensions } from "@/src/hooks/useDimensions";

// Create a TV-compatible TouchableOpacity component
interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

// Use TypeScript casting to create a TV-compatible TouchableOpacity
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

export interface ContentItemData {
  id: string;
  tmdbId?: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  thumbnailBlurhash?: string; // for episodes
  showId?: string;
  // Use raw numbers from API instead of formatted strings
  seasonNumber?: number;
  episodeNumber?: number;
  // Additional fields for the video player
  mediaType?: "movie" | "tv";
  link?: string;
  backdropUrl?: string;
  backdropBlurhash?: string;
  hdr?: string;
  logo?: string;
  year?: string;
  isAvailable?: boolean;
  isTrailer?: boolean;
}

interface ContentItemProps {
  item: ContentItemData;
  onSelect: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
    backdropUrl?: string, // Optional backdrop URL for video player
    backdropBlurhash?: string, // Optional backdrop blurhash for video player
  ) => void;
  size?: "small" | "medium" | "large";
  customWidth?: number;
  hasTVPreferredFocus?: boolean;
  /** Controlled by the parent row's programmatic focus system on TV */
  isFocused?: boolean;
  /** Pass false to remove this item from the tvOS focus graph */
  isTVSelectable?: boolean;
}

const ContentItem = ({
  item,
  onSelect,
  size = "medium",
  customWidth,
  hasTVPreferredFocus = false,
  isFocused = false,
  isTVSelectable = Platform.isTV,
}: ContentItemProps) => {
  // Use the new Zustand-based backdrop manager
  const { show: showBackdrop } = useBackdropManager();

  // Get dynamic dimensions
  const { window } = useDimensions();

  // Memoize dimensions calculation
  const dimensions = useMemo(() => {
    const getItemWidth = () => {
      if (customWidth) return customWidth;
      switch (size) {
        case "small":
          return window.width / 5;
        case "large":
          return window.width / 2.9;
        case "medium":
        default:
          return window.width / 3.5;
      }
    };

    const itemWidth = getItemWidth();
    const itemHeight = itemWidth * 0.6; // 16:9 aspect ratio

    return { itemWidth, itemHeight };
  }, [size, customWidth, window.width]);

  const isUnavailableItem = useMemo(
    () => item.isAvailable === false || !item.link,
    [item.isAvailable, item.link],
  );

  // Memoize press handler - MIGRATED to use Zustand
  const handlePress = useCallback(() => {
    if (isUnavailableItem) {
      return;
    }

    if (item.backdropUrl) {
      // 1) Immediately show the backdrop using Zustand store
      showBackdrop(item.backdropUrl, {
        fade: true,
        duration: 300,
        blurhash: item.backdropBlurhash || item.thumbnailBlurhash, // Use backdrop blurhash if available, fallback to thumbnail
      });

      // 2) Fire‑and‑forget cache warming
      Image.prefetch(item.backdropUrl)
        .then((ok) => {
          if (!ok) {
            console.warn(
              "[ContentItem] prefetch returned false (may flicker):",
              item.backdropUrl,
            );
          }
        })
        .catch((err) => console.warn("[ContentItem] prefetch error:", err));
    }

    // 3) Now navigate
    onSelect(
      item.showId || item.id,
      item.seasonNumber,
      item.episodeNumber,
      item.mediaType || "movie",
      item.backdropUrl,
      item.backdropBlurhash || item.thumbnailBlurhash,
    );
  }, [
    showBackdrop, // NEW: Zustand action
    item.id,
    onSelect,
    item.showId,
    item.seasonNumber,
    item.episodeNumber,
    item.mediaType,
    item.backdropUrl,
    item.backdropBlurhash,
    item.thumbnailBlurhash,
    isUnavailableItem,
  ]);

  // Focus handler
  const handleFocus = useCallback(() => {
    // Focus handling logic can be added here if needed
  }, []);

  // omit the blurhash from the console log
  // if (item.episodeNumber) {
  //   console.log(
  //     "item",
  //     JSON.stringify(
  //       { ...item, thumbnailBlurhash: undefined, blurhash: undefined },
  //       null,
  //       2,
  //     ),
  //   );
  // }

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { width: dimensions.itemWidth, height: dimensions.itemHeight + 180 },
        isFocused && styles.focused,
      ]}
      onPress={handlePress}
      onFocus={handleFocus}
      activeOpacity={1.0}
      isTVSelectable={isTVSelectable}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      <OptimizedImage
        source={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
        style={styles.thumbnail}
        placeholder={
          item.thumbnailUrl && item.thumbnailBlurhash
            ? { uri: `data:image/png;base64,${item.thumbnailBlurhash}` }
            : undefined
        }
        placeholderContentFit="cover"
        transition={0}
        contentFit="cover"
        width={
          Math.round(dimensions.itemWidth) +
          (item.mediaType === "movie" ? 100 : 300)
        }
        quality={100}
        cachePolicy="memory-disk"
        recyclingKey={item.id}
      />

      {isUnavailableItem && (
        <View style={styles.unavailableOverlay}>
          <Text style={styles.unavailableText}>Unavailable</Text>
          {/* {item.tmdbId && (
            <Text style={styles.unavailableSubText}>TMDB #{item.tmdbId}</Text>
          )} */}
        </View>
      )}

      {/* Top-left badge stack: season/episode and/or trailer */}
      {((item.seasonNumber && item.episodeNumber) || item.isTrailer) && (
        <View style={styles.topLeftBadges}>
          {item.seasonNumber && item.episodeNumber && (
            <View style={styles.topOverlay}>
              <Text style={styles.seasonEpisodeText}>
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

      {/* Logo image above bottom overlay for episodes */}
      {item.seasonNumber && item.episodeNumber && item.logo && (
        <View style={styles.logoContainer}>
          <Image
            source={{ uri: item.logo }}
            style={styles.logoImage}
            contentFit="contain"
            transition={200}
          />
        </View>
      )}

      <View style={styles.overlay}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>

        {isUnavailableItem ? null : (
          <View style={styles.playButton}>
            <Ionicons
              name="information-circle-outline"
              size={24}
              color="#FFFFFF"
            />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 4,
    margin: 8,
    opacity: 0.22,
    overflow: "hidden",
  },
  focused: {
    borderColor: "#FFFFFF",
    borderWidth: 3,
    opacity: 1,
  },
  logoContainer: {
    alignItems: "center",
    bottom: 60,
    height: 60,
    justifyContent: "center",
    left: 12,
    position: "absolute",
    right: 12,
    zIndex: 2,
  },
  logoImage: {
    height: 50,
    width: "90%",
  },
  overlay: {
    alignItems: "center",
    backgroundColor: Colors.dark.videoControlCaptionButtonBg,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    padding: 8,
    position: "absolute",
    right: 0,
  },
  playButton: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  seasonEpisodeText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
    textShadowColor: Colors.dark.videoTextShadow,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  thumbnail: {
    height: "100%",
    width: "100%",
  },
  title: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    marginRight: 8,
  },
  topLeftBadges: {
    alignItems: "flex-start",
    flexDirection: "column",
    gap: 4,
    left: 8,
    position: "absolute",
    top: 8,
    zIndex: 1,
  },
  topOverlay: {
    backgroundColor: Colors.dark.videoOverlayBackground,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  trailerBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "600",
  },
  unavailableOverlay: {
    alignItems: "center",
    backgroundColor: Colors.dark.videoControlBackgroundPreviewBg,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },
  unavailableText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});

// Simplified comparison function to prevent flashing
const areEqual = (prevProps: ContentItemProps, nextProps: ContentItemProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.thumbnailUrl === nextProps.item.thumbnailUrl &&
    prevProps.item.thumbnailBlurhash === nextProps.item.thumbnailBlurhash &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.isAvailable === nextProps.item.isAvailable &&
    prevProps.size === nextProps.size &&
    prevProps.customWidth === nextProps.customWidth &&
    prevProps.hasTVPreferredFocus === nextProps.hasTVPreferredFocus &&
    prevProps.isFocused === nextProps.isFocused &&
    prevProps.isTVSelectable === nextProps.isTVSelectable
  );
};

export default memo(ContentItem, areEqual);
