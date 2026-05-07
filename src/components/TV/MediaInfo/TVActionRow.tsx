import { useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import YouTubeIcon from "@/src/assets/third-party/youtube-icon.svg";
import { Colors } from "@/src/constants/Colors";
import { WatchlistToggleResult } from "@/src/hooks/useWatchlistToggle";

const WATCHLIST_BTN_BG = "rgba(255, 255, 255, 0.1)";
const WATCHLIST_BTN_BG_FOCUSED = "rgba(255, 255, 255, 0.22)";
const ACTION_TILE_LABEL_COLOR = "rgba(255, 255, 255, 0.75)";
const WATCHLIST_BTN_BORDER = "rgba(255, 255, 255, 0.3)";
const WATCHLIST_BTN_BORDER_FOCUSED = "#FFFFFF";

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

interface TVActionRowProps {
  watchlist: WatchlistToggleResult;
  trailerUrl?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export default function TVActionRow({
  watchlist,
  trailerUrl,
  onFocus,
  onBlur,
}: TVActionRowProps) {
  const watchlistScale = useRef(new Animated.Value(1)).current;
  const trailerScale = useRef(new Animated.Value(1)).current;

  const handleWatchlistFocus = useCallback(() => {
    onFocus?.();
    Animated.spring(watchlistScale, {
      toValue: 1.05,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [onFocus, watchlistScale]);

  const handleWatchlistBlur = useCallback(() => {
    onBlur?.();
    Animated.spring(watchlistScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [onBlur, watchlistScale]);

  const handleTrailerFocus = useCallback(() => {
    Animated.spring(trailerScale, {
      toValue: 1.05,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [trailerScale]);

  const handleTrailerBlur = useCallback(() => {
    Animated.spring(trailerScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [trailerScale]);

  const handleOpenTrailer = useCallback(async () => {
    if (!trailerUrl) return;
    const videoId = extractYouTubeId(trailerUrl);
    if (videoId) {
      const appUrl = `youtube://watch?v=${videoId}`;
      const canOpen = await Linking.canOpenURL(appUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(appUrl).catch(() => Linking.openURL(trailerUrl));
        return;
      }
    }
    await Linking.openURL(trailerUrl).catch(() => {});
  }, [trailerUrl]);

  return (
    <View style={styles.TVActionRow}>
      <Animated.View style={{ transform: [{ scale: watchlistScale }] }}>
        <Pressable
          focusable
          style={({ focused }) => [
            styles.actionTile,
            focused && styles.actionTileFocused,
            (watchlist.isToggling || watchlist.isLoadingStatus) &&
              styles.actionTileDisabled,
          ]}
          onFocus={handleWatchlistFocus}
          onBlur={handleWatchlistBlur}
          onPress={() => void watchlist.toggle()}
          disabled={watchlist.isToggling || watchlist.isLoadingStatus}
        >
          {watchlist.isLoadingStatus ? (
            <ActivityIndicator size="small" color={Colors.dark.whiteText} />
          ) : (
            <>
              <Text style={styles.actionTileIcon}>
                {watchlist.isInWatchlist ? "✓" : "+"}
              </Text>
              <Text style={styles.actionTileLabel}>
                {watchlist.isToggling
                  ? watchlist.isInWatchlist
                    ? "Removing"
                    : "Adding"
                  : watchlist.isInWatchlist
                    ? "In My List"
                    : "My List"}
              </Text>
            </>
          )}
        </Pressable>
      </Animated.View>

      {!!trailerUrl && (
        <Animated.View style={{ transform: [{ scale: trailerScale }] }}>
          <Pressable
            focusable
            style={({ focused }) => [
              styles.actionTile,
              focused && styles.actionTileFocused,
            ]}
            onFocus={handleTrailerFocus}
            onBlur={handleTrailerBlur}
            onPress={() => void handleOpenTrailer()}
          >
            <YouTubeIcon width={32} height={22} />
            <Text style={styles.actionTileLabel}>Trailer</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  TVActionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
    marginTop: 4,
  },
  actionTile: {
    alignItems: "center",
    backgroundColor: WATCHLIST_BTN_BG,
    borderColor: WATCHLIST_BTN_BORDER,
    borderRadius: 10,
    borderWidth: 1,
    height: 56,
    justifyContent: "center",
    minWidth: 68,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  actionTileDisabled: {
    opacity: 0.6,
  },
  actionTileFocused: {
    backgroundColor: WATCHLIST_BTN_BG_FOCUSED,
    borderColor: WATCHLIST_BTN_BORDER_FOCUSED,
    borderWidth: 2,
  },
  actionTileIcon: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
  },
  actionTileLabel: {
    color: ACTION_TILE_LABEL_COLOR,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
});
