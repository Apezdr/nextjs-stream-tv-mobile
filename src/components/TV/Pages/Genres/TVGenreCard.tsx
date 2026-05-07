/**
 * Lightweight TV genre card component.
 * Shows the genre name, item count, and a small strip of preview posters.
 * Each card fetches only 3 items so the genre grid remains inexpensive.
 */
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { memo, useCallback, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  View,
} from "react-native";

import { Colors } from "@/src/constants/Colors";
import { contentService } from "@/src/data/services/contentService";

interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

export interface TVGenreCardGenre {
  id: number;
  name: string;
  movieCount?: number;
  tvShowCount?: number;
}

interface TVGenreCardProps {
  genre: TVGenreCardGenre;
  contentType: "movie" | "tv";
  onPress: (genreName: string) => void;
  hasTVPreferredFocus?: boolean;
}

const PREVIEW_COUNT = 3;

const TVGenreCard = memo(function TVGenreCard({
  genre,
  contentType,
  onPress,
  hasTVPreferredFocus = false,
}: TVGenreCardProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Fetch a tiny slice of content for the preview poster strip
  const { data: previewData } = useQuery({
    queryKey: ["tv-genre-preview", genre.name, contentType],
    queryFn: () =>
      contentService.getGenreContent({
        action: "content",
        genre: genre.name,
        type: contentType,
        page: 0,
        limit: PREVIEW_COUNT,
        sort: "newest",
        sortOrder: "desc",
        includeWatchHistory: false,
        isTVdevice: true,
      }),
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 10 * 60 * 1000,
  });

  const previewPosters =
    previewData?.currentItems?.slice(0, PREVIEW_COUNT) ?? [];
  const count = contentType === "tv" ? genre.tvShowCount : genre.movieCount;
  const countLabel = count
    ? `${count} ${contentType === "tv" ? "shows" : "movies"}`
    : contentType === "tv"
      ? "Shows"
      : "Movies";

  const handlePress = useCallback(
    () => onPress(genre.name),
    [onPress, genre.name],
  );

  return (
    <TouchableOpacity
      onPress={handlePress}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus}
      activeOpacity={0.85}
      style={[styles.card, isFocused && styles.cardFocused]}
    >
      {/* Poster preview strip */}
      <View style={styles.posterStrip}>
        {previewPosters.length > 0
          ? previewPosters.map((item, i) => (
              <View
                key={`${genre.id}-${item.id}-${i}`}
                style={[styles.poster, i > 0 && styles.posterGap]}
              >
                <Image
                  source={{ uri: item.thumbnailUrl || item.posterURL }}
                  style={styles.posterImage}
                  contentFit="cover"
                />
                <View style={styles.posterOverlay} />
              </View>
            ))
          : Array.from({ length: PREVIEW_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.poster,
                  styles.posterPlaceholder,
                  i > 0 && styles.posterGap,
                ]}
              />
            ))}
      </View>

      {/* Genre label */}
      <View style={styles.info}>
        <Text
          style={[styles.genreName, isFocused && styles.genreNameFocused]}
          numberOfLines={1}
        >
          {genre.name}
        </Text>
        <Text style={styles.genreCount}>{countLabel}</Text>
      </View>

      {/* Focus border overlay */}
      {isFocused && <View style={styles.focusBorder} pointerEvents="none" />}
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 10,
    flex: 1,
    margin: 8,
    overflow: "hidden",
  },
  cardFocused: {
    backgroundColor: Colors.dark.surfaceElevated,
    transform: [{ scale: 1.04 }],
  },
  focusBorder: {
    borderColor: Colors.dark.brandPrimary,
    borderRadius: 10,
    borderWidth: 3,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  genreCount: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 16,
    marginTop: 4,
  },
  genreName: {
    color: Colors.dark.whiteText,
    fontSize: 22,
    fontWeight: "bold",
  },
  genreNameFocused: {
    color: Colors.dark.brandPrimary,
  },
  info: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  poster: {
    aspectRatio: 2 / 3,
    flex: 1,
    position: "relative",
  },
  posterGap: {
    marginLeft: 2,
  },
  posterImage: {
    height: "100%",
    width: "100%",
  },
  posterOverlay: {
    backgroundColor: Colors.dark.videoOverlayBackground,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  posterPlaceholder: {
    backgroundColor: Colors.dark.outline,
  },
  posterStrip: {
    flexDirection: "row",
    height: 160,
  },
});

export default TVGenreCard;
