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

import { Colors } from "@/src/constants/Colors";
import { useTVAppState } from "@/src/context/TVAppStateContext";

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
  showId: string;
  // Use raw numbers from API instead of formatted strings
  seasonNumber?: number;
  episodeNumber?: number;
  // Additional fields for the video player
  mediaType?: "movie" | "tv";
  videoLink?: string;
  backdropUrl?: string;
  hdr?: string;
  logoUrl?: string;
}

interface ContentItemProps {
  item: ContentItemData;
  onSelect: (
    showId: string,
    seasonNumber: number | undefined,
    episodeNumber: number | undefined,
    mediaType: "movie" | "tv",
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
  const { collapseSidebar } = useTVAppState();

  // Memoize dimensions calculation
  const dimensions = useMemo(() => {
    const getItemWidth = () => {
      switch (size) {
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
    const itemHeight = itemWidth * 0.6; // 16:9 aspect ratio

    return { itemWidth, itemHeight };
  }, [size]);

  // Memoize press handler
  const handlePress = useCallback(() => {
    onSelect(
      item.showId,
      item.seasonNumber,
      item.episodeNumber,
      item.mediaType || "movie",
    );
  }, [
    onSelect,
    item.showId,
    item.seasonNumber,
    item.episodeNumber,
    item.mediaType,
  ]);

  // Focus handler
  const handleFocus = useCallback(() => {
    collapseSidebar();
  }, [collapseSidebar]);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { width: dimensions.itemWidth, height: dimensions.itemHeight },
      ]}
      onPress={handlePress}
      onFocus={handleFocus}
      activeOpacity={0.5}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      <Image
        source={{ uri: item.thumbnailUrl }}
        style={styles.thumbnail}
        placeholder={{
          uri: `data:image/png;base64,${item?.thumbnailBlurhash}`,
        }}
        placeholderContentFit="cover"
        transition={200}
        contentFit="cover"
      />

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
  playButton: {
    alignItems: "center",
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  thumbnail: {
    height: "100%",
    width: "100%",
  },
  title: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    marginRight: 8,
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
