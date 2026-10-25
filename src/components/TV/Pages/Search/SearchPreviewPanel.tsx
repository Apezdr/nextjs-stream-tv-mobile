import { Ionicons } from "@expo/vector-icons";
import React, { memo, useEffect, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity as RNTouchableOpacity,
  View,
} from "react-native";

import OptimizedImage from "@/src/components/common/OptimizedImage";
import {
  kindLabel,
  type SearchPosterItem,
} from "@/src/components/TV/Pages/Search/SearchPosterCard";
import { Colors } from "@/src/constants/Colors";
import { useWatchlistToggle } from "@/src/hooks/useWatchlistToggle";

interface TVTouchableProps extends React.ComponentProps<
  typeof RNTouchableOpacity
> {
  isTVSelectable?: boolean;
  hasTVPreferredFocus?: boolean;
}
const TouchableOpacity =
  RNTouchableOpacity as React.ComponentType<TVTouchableProps>;

/** Height shared by the preview and the no-results panel, so the grid never moves. */
export const PANEL_HEIGHT = 106;
const BACKDROP_WIDTH = 188;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface PanelButtonProps {
  label: string;
  icon?: IoniconName;
  primary?: boolean;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  onFocus: () => void;
  onPress: () => void;
}

// A pill button whose focus ring is a constant-width border (transparent until
// focused), so focusing never changes the panel's layout.
const PanelButton = ({
  label,
  icon,
  primary = false,
  disabled = false,
  hasTVPreferredFocus = false,
  onFocus,
  onPress,
}: PanelButtonProps) => {
  const [focused, setFocused] = useState(false);
  const textColor = primary
    ? Colors.dark.cardBackground
    : Colors.dark.whiteText;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonGhost,
        focused && styles.buttonFocused,
        disabled && styles.buttonDisabled,
      ]}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        onFocus();
      }}
      onBlur={() => setFocused(false)}
      activeOpacity={0.8}
      disabled={disabled}
      isTVSelectable={Platform.isTV}
      hasTVPreferredFocus={hasTVPreferredFocus && Platform.isTV}
    >
      {icon ? <Ionicons name={icon} size={13} color={textColor} /> : null}
      <Text style={[styles.buttonText, { color: textColor }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

interface SearchPreviewPanelProps {
  item: SearchPosterItem;
  /**
   * The user selected this title: show Play / Details / My List, with focus
   * on Play. While false the panel is a passive preview with no focusable
   * children, so moving up from the grid never lands on it.
   */
  actionsOpen: boolean;
  /** Any button in the panel gained focus. */
  onButtonFocus: () => void;
  onPlay: (item: SearchPosterItem) => void;
  onDetails: (item: SearchPosterItem) => void;
}

/**
 * The focused title's preview: backdrop, title and year · kind, plus
 * Play / Details / My List once the title is selected. Render it with
 * `key={item.id}` so the watchlist state starts fresh for each title; the
 * status is fetched when the actions open.
 */
const SearchPreviewPanelBase = ({
  item,
  actionsOpen,
  onButtonFocus,
  onPlay,
  onDetails,
}: SearchPreviewPanelProps) => {
  const watchlist = useWatchlistToggle({
    id: item.id,
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
  });
  const { fetchStatus } = watchlist;

  useEffect(() => {
    if (actionsOpen) void fetchStatus();
  }, [actionsOpen, fetchStatus]);

  const episodeLabel =
    item.seasonNumber && item.episodeNumber
      ? ` · S${item.seasonNumber}E${item.episodeNumber}`
      : "";
  const meta = `${item.year ? `${item.year} · ` : ""}${kindLabel(item.mediaType)}${episodeLabel}`;

  const watchlistLabel = watchlist.isToggling
    ? "Saving…"
    : watchlist.isInWatchlist
      ? "In My List"
      : "My List";
  const watchlistIcon: IoniconName = watchlist.isInWatchlist
    ? "checkmark"
    : "add";

  const backdrop = item.backdropUrl ?? item.posterUrl;
  const backdropBlurhash = item.backdropUrl
    ? item.backdropBlurhash
    : item.posterBlurhash;

  return (
    <View style={styles.panel}>
      <View style={styles.backdropFrame}>
        <OptimizedImage
          source={backdrop ? { uri: backdrop } : undefined}
          style={styles.backdrop}
          placeholder={
            backdrop && backdropBlurhash
              ? { uri: `data:image/png;base64,${backdropBlurhash}` }
              : undefined
          }
          placeholderContentFit="cover"
          transition={150}
          contentFit="cover"
          width={BACKDROP_WIDTH * 2}
          quality={75}
          cachePolicy="memory-disk"
        />
      </View>
      <View style={styles.body}>
        <View>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        {actionsOpen ? (
          <View style={styles.buttons}>
            <PanelButton
              label="Play"
              icon="play"
              primary
              hasTVPreferredFocus
              onFocus={onButtonFocus}
              onPress={() => onPlay(item)}
            />
            <PanelButton
              label="Details"
              onFocus={onButtonFocus}
              onPress={() => onDetails(item)}
            />
            <PanelButton
              label={watchlistLabel}
              icon={watchlistIcon}
              disabled={watchlist.isToggling}
              onFocus={onButtonFocus}
              onPress={() => void watchlist.toggle()}
            />
          </View>
        ) : (
          <Text style={styles.hint} numberOfLines={1}>
            Select a title for Play, Details and My List
          </Text>
        )}
      </View>
    </View>
  );
};

export const SearchPreviewPanel = memo(SearchPreviewPanelBase);

interface SearchEmptyPanelProps {
  query: string;
  onButtonFocus: () => void;
  onClear: () => void;
}

/** Takes the preview's place when a query matches nothing. */
const SearchEmptyPanelBase = ({
  query,
  onButtonFocus,
  onClear,
}: SearchEmptyPanelProps) => (
  <View style={[styles.panel, styles.emptyPanel]}>
    <Ionicons
      name="search-outline"
      size={38}
      color={Colors.dark.videoDescriptionText}
    />
    <View style={styles.emptyText}>
      <Text style={styles.emptyTitle} numberOfLines={2}>
        No titles match “{query}”
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        Check the spelling, or try fewer letters.
      </Text>
    </View>
    <PanelButton
      label="Clear search"
      primary
      onFocus={onButtonFocus}
      onPress={onClear}
    />
  </View>
);

export const SearchEmptyPanel = memo(SearchEmptyPanelBase);

const styles = StyleSheet.create({
  backdrop: {
    height: "100%",
    width: "100%",
  },
  backdropFrame: {
    backgroundColor: Colors.dark.surfaceElevated,
    height: "100%",
    width: BACKDROP_WIDTH,
  },
  body: {
    flex: 1,
    justifyContent: "space-between",
    minWidth: 0,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  button: {
    alignItems: "center",
    borderColor: Colors.dark.transparentBorder,
    borderRadius: 16,
    borderWidth: 2,
    flexDirection: "row",
    gap: 5,
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonFocused: {
    borderColor: Colors.dark.brandPrimary,
  },
  buttonGhost: {
    backgroundColor: Colors.dark.surfaceElevated,
  },
  buttonPrimary: {
    backgroundColor: Colors.dark.whiteBg,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "700",
  },
  buttons: {
    flexDirection: "row",
    gap: 7,
  },
  emptyPanel: {
    alignItems: "center",
    backgroundColor: Colors.dark.transparentBg,
    borderColor: Colors.dark.outline,
    borderWidth: 1,
    gap: 18,
    paddingHorizontal: 22,
  },
  emptyText: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  emptyTitle: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "800",
  },
  hint: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 10,
    fontWeight: "600",
  },
  meta: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 11,
    marginTop: 3,
  },
  panel: {
    backgroundColor: Colors.dark.cardBackground,
    borderRadius: 11,
    flexDirection: "row",
    height: PANEL_HEIGHT,
    overflow: "hidden",
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 19,
    fontWeight: "800",
  },
});
