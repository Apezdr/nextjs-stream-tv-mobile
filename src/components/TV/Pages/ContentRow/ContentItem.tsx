import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { memo, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  Platform,
  Dimensions,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { Colors } from "@/src/constants/Colors";
import { backdropManager } from "@/src/utils/BackdropManager";

// Create a TV-compatible TouchableOpacity component
interface TVTouchableProps
  extends React.ComponentProps<typeof RNTouchableOpacity> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}

// Use TypeScript casting to create a TV-compatible TouchableOpacity
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

// Get screen width to calculate item size
const { width } = Dimensions.get("window");

export interface ContentItemData {
  id: string;
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
  hasTVPreferredFocus?: boolean;
}

const ContentItem = ({
  item,
  onSelect,
  size = "medium",
  hasTVPreferredFocus = false,
}: ContentItemProps) => {
  // Memoize dimensions calculation
  const dimensions = useMemo(() => {
    const getItemWidth = () => {
      switch (size) {
        case "small":
          return width / 5;
        case "large":
          return width / 2.9;
        case "medium":
        default:
          return width / 3.5;
      }
    };

    const itemWidth = getItemWidth();
    const itemHeight = itemWidth * 0.6; // 16:9 aspect ratio

    return { itemWidth, itemHeight };
  }, [size]);

  // Memoize press handler
  const handlePress = useCallback(() => {
    if (item.backdropUrl) {
      // 1) Immediately show the blurhash/fade—even if the real image isn’t cached yet:
      backdropManager.show(item.backdropUrl, {
        fade: true,
        duration: 300,
        blurhash: item.thumbnailBlurhash, // pass the raw string
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
      item.thumbnailBlurhash,
    );
  }, [
    onSelect,
    item.showId,
    item.seasonNumber,
    item.episodeNumber,
    item.mediaType,
    item.backdropUrl,
    item.thumbnailBlurhash,
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
      ]}
      onPress={handlePress}
      onFocus={handleFocus}
      activeOpacity={1.0}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      <OptimizedImage
        source={item.thumbnailUrl ? { uri: item.thumbnailUrl } : undefined}
        style={styles.thumbnail}
        placeholder={{
          uri: `data:image/png;base64,${item?.thumbnailBlurhash}`,
        }}
        placeholderContentFit="cover"
        transition={200}
        contentFit="cover"
        width={
          Math.round(dimensions.itemWidth) +
          (item.mediaType === "movie" ? 100 : 300)
        }
        quality={100}
      />

      {/* Season/Episode info at the top */}
      {item.seasonNumber && item.episodeNumber && (
        <View style={styles.topOverlay}>
          <Text style={styles.seasonEpisodeText}>
            S{item.seasonNumber}E{item.episodeNumber}
          </Text>
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

        <View style={styles.playButton}>
          <Ionicons name="play-circle" size={24} color="#FFFFFF" />
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#333",
    borderRadius: 4,
    margin: 8,
    overflow: "hidden",
    opacity: 0.22, // Default 22% opacity
  },
  overlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 0,
    padding: 8,
    position: "absolute",
    right: 0,
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
    textShadowColor: "rgba(0, 0, 0, 0.8)",
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
  topOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 4,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
    top: 8,
    zIndex: 1,
  },
});

// Simplified comparison function to prevent flashing
const areEqual = (prevProps: ContentItemProps, nextProps: ContentItemProps) => {
  // Only compare the most essential props
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.size === nextProps.size &&
    prevProps.hasTVPreferredFocus === nextProps.hasTVPreferredFocus
  );
};

export default memo(ContentItem, areEqual);
