import React, { memo, useCallback, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  View,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import { Colors } from "@/src/constants/Colors";

// TV-compatible TouchableOpacity (adds the tvos-only focus props)
interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

/** Posters are portrait (`posterURL`), 2:3 like the genre cards. */
export const POSTER_ASPECT = 2 / 3;

export interface SearchPosterItem {
  id: string;
  title: string;
  mediaType: "movie" | "tv";
  posterUrl?: string;
  posterBlurhash?: string;
  backdropUrl?: string;
  backdropBlurhash?: string;
  tmdbId?: number;
  year?: string;
  seasonNumber?: number;
  episodeNumber?: number;
}

export const kindLabel = (mediaType: "movie" | "tv") =>
  mediaType === "tv" ? "TV Show" : "Movie";

/** Split a title around the first case-insensitive match of the query. */
export function splitHighlight(title: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return { pre: title, mid: "", post: "" };
  const at = title.toLowerCase().indexOf(needle);
  if (at < 0) return { pre: title, mid: "", post: "" };
  return {
    pre: title.slice(0, at),
    mid: title.slice(at, at + needle.length),
    post: title.slice(at + needle.length),
  };
}

interface SearchPosterCardProps {
  item: SearchPosterItem;
  index: number;
  width: number;
  /** The query, so its letters are highlighted inside the title. */
  highlight: string;
  hasTVPreferredFocus?: boolean;
  /** Fired with the item's index; the screen uses it for the preview and load-more. */
  onFocus: (index: number) => void;
  onPress: (item: SearchPosterItem, index: number) => void;
}

const SearchPosterCard = ({
  item,
  index,
  width,
  highlight,
  hasTVPreferredFocus = false,
  onFocus,
  onPress,
}: SearchPosterCardProps) => {
  const [focused, setFocused] = useState(false);

  const handleFocus = useCallback(() => {
    setFocused(true);
    onFocus(index);
  }, [onFocus, index]);
  const handleBlur = useCallback(() => setFocused(false), []);
  const handlePress = useCallback(
    () => onPress(item, index),
    [onPress, item, index],
  );

  const { pre, mid, post } = splitHighlight(item.title, highlight);
  const posterHeight = Math.round(width / POSTER_ASPECT);

  return (
    <TouchableOpacity
      style={[styles.card, { width }, focused && styles.cardFocused]}
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      activeOpacity={1}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      {/* The ring is a constant-width border so focus never reflows the grid */}
      <View
        style={[
          styles.posterFrame,
          { height: posterHeight },
          focused && styles.posterFrameFocused,
        ]}
      >
        <OptimizedImage
          source={item.posterUrl ? { uri: item.posterUrl } : undefined}
          style={styles.poster}
          placeholder={
            item.posterUrl && item.posterBlurhash
              ? { uri: `data:image/png;base64,${item.posterBlurhash}` }
              : undefined
          }
          placeholderContentFit="cover"
          transition={0}
          contentFit="cover"
          width={Math.round(width) * 2}
          quality={75}
          cachePolicy="memory-disk"
          recyclingKey={item.id}
        />
      </View>
      <Text style={styles.title} numberOfLines={1}>
        {pre}
        {mid ? <Text style={styles.titleMatch}>{mid}</Text> : null}
        {post}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {item.year ? `${item.year} · ` : ""}
        {kindLabel(item.mediaType)}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    alignItems: "stretch",
  },
  cardFocused: {
    transform: [{ scale: 1.04 }],
  },
  meta: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 9,
    marginTop: 2,
  },
  poster: {
    height: "100%",
    width: "100%",
  },
  posterFrame: {
    backgroundColor: Colors.dark.cardBackground,
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 7,
    borderWidth: 2.5,
    overflow: "hidden",
    width: "100%",
  },
  posterFrameFocused: {
    borderColor: Colors.dark.whiteBg,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
  },
  titleMatch: {
    color: Colors.dark.brandPrimary,
  },
});

export default memo(SearchPosterCard);
