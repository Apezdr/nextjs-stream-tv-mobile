import { useCallback, useRef, useState } from "react";
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

const PLAY_BTN_BG = "rgba(255, 255, 255, 0.15)";
const PLAY_BTN_BORDER = "rgba(255, 255, 255, 0.3)";
const PLAY_BTN_BG_FOCUSED = "#FFFFFF";
const PLAY_BTN_BORDER_FOCUSED = "#FFFFFF";
const PLAY_BTN_TEXT_FOCUSED = "#141414";
const SECONDARY_BTN_BG = "rgba(255, 255, 255, 0.1)";
const SECONDARY_BTN_BG_FOCUSED = "rgba(255, 255, 255, 0.22)";
const SECONDARY_BTN_BORDER = "rgba(255, 255, 255, 0.3)";
const SECONDARY_BTN_BORDER_FOCUSED = "#FFFFFF";

const COLLAPSED_WIDTH = 56;
const EXPANDED_WIDTH = 160;

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

interface MovieActionRowProps {
  onPlay: () => void;
  watchlist: WatchlistToggleResult;
  trailerUrl?: string;
  onWatchlistFocus: () => void;
  onWatchlistBlur: () => void;
}

export default function MovieActionRow({
  onPlay,
  watchlist,
  trailerUrl,
  onWatchlistFocus,
  onWatchlistBlur,
}: MovieActionRowProps) {
  const [isPlayFocused, setIsPlayFocused] = useState(false);
  const playScale = useRef(new Animated.Value(1)).current;

  // Watchlist animation
  const watchlistWidth = useRef(new Animated.Value(COLLAPSED_WIDTH)).current;
  const watchlistTextOpacity = useRef(new Animated.Value(0)).current;
  const watchlistAnimId = useRef(0);

  // Trailer animation
  const trailerWidth = useRef(new Animated.Value(COLLAPSED_WIDTH)).current;
  const trailerTextOpacity = useRef(new Animated.Value(0)).current;
  const trailerAnimId = useRef(0);

  const handlePlayFocus = useCallback(() => {
    setIsPlayFocused(true);
    Animated.spring(playScale, {
      toValue: 1.02,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [playScale]);

  const handlePlayBlur = useCallback(() => {
    setIsPlayFocused(false);
    Animated.spring(playScale, {
      toValue: 1,
      useNativeDriver: true,
      tension: 120,
      friction: 8,
    }).start();
  }, [playScale]);

  const handleWatchlistFocus = useCallback(() => {
    onWatchlistFocus();
    const id = ++watchlistAnimId.current;
    Animated.timing(watchlistWidth, {
      toValue: EXPANDED_WIDTH,
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      if (watchlistAnimId.current !== id) return;
      Animated.timing(watchlistTextOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
  }, [onWatchlistFocus, watchlistWidth, watchlistTextOpacity]);

  const handleWatchlistBlur = useCallback(() => {
    onWatchlistBlur();
    const id = ++watchlistAnimId.current;
    Animated.timing(watchlistTextOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      if (watchlistAnimId.current !== id) return;
      Animated.timing(watchlistWidth, {
        toValue: COLLAPSED_WIDTH,
        duration: 150,
        useNativeDriver: false,
      }).start();
    });
  }, [onWatchlistBlur, watchlistWidth, watchlistTextOpacity]);

  const handleTrailerFocus = useCallback(() => {
    const id = ++trailerAnimId.current;
    Animated.timing(trailerWidth, {
      toValue: EXPANDED_WIDTH,
      duration: 180,
      useNativeDriver: false,
    }).start(() => {
      if (trailerAnimId.current !== id) return;
      Animated.timing(trailerTextOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
  }, [trailerWidth, trailerTextOpacity]);

  const handleTrailerBlur = useCallback(() => {
    const id = ++trailerAnimId.current;
    Animated.timing(trailerTextOpacity, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start(() => {
      if (trailerAnimId.current !== id) return;
      Animated.timing(trailerWidth, {
        toValue: COLLAPSED_WIDTH,
        duration: 150,
        useNativeDriver: false,
      }).start();
    });
  }, [trailerWidth, trailerTextOpacity]);

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

  const watchlistLabel = watchlist.isToggling
    ? watchlist.isInWatchlist
      ? "Removing..."
      : "Adding..."
    : watchlist.isInWatchlist
      ? "In My List"
      : "My List";

  return (
    <View style={styles.actionRow}>
      {/* Play button */}
      <Animated.View
        style={[
          styles.playAnimatedWrapper,
          { transform: [{ scale: playScale }] },
        ]}
      >
        <Pressable
          focusable
          hasTVPreferredFocus
          style={[styles.playButton, isPlayFocused && styles.playButtonFocused]}
          onFocus={handlePlayFocus}
          onBlur={handlePlayBlur}
          onPress={onPlay}
        >
          <Text
            style={[
              styles.playButtonText,
              isPlayFocused && styles.playButtonTextFocused,
            ]}
          >
            ▶ Play Movie
          </Text>
        </Pressable>
      </Animated.View>

      {/* Watchlist button */}
      <Animated.View
        style={[styles.secondaryAnimatedWrapper, { width: watchlistWidth }]}
      >
        <Pressable
          focusable
          style={({ focused }) => [
            styles.secondaryButton,
            focused && styles.secondaryButtonFocused,
            watchlist.isToggling && styles.secondaryButtonDisabled,
          ]}
          onFocus={handleWatchlistFocus}
          onBlur={handleWatchlistBlur}
          onPress={() => void watchlist.toggle()}
          disabled={watchlist.isToggling || watchlist.isLoadingStatus}
        >
          <View style={styles.iconWrapper}>
            {watchlist.isLoadingStatus ? (
              <ActivityIndicator size="small" color={Colors.dark.whiteText} />
            ) : (
              <Text style={styles.secondaryIcon}>
                {watchlist.isInWatchlist ? "✓" : "+"}
              </Text>
            )}
          </View>
          <Animated.View
            style={[styles.labelWrapper, { opacity: watchlistTextOpacity }]}
          >
            <Text style={styles.secondaryLabel} numberOfLines={1}>
              {watchlistLabel}
            </Text>
          </Animated.View>
        </Pressable>
      </Animated.View>

      {/* Trailer button */}
      {!!trailerUrl && (
        <Animated.View
          style={[styles.secondaryAnimatedWrapper, { width: trailerWidth }]}
        >
          <Pressable
            focusable
            style={({ focused }) => [
              styles.secondaryButton,
              focused && styles.secondaryButtonFocused,
            ]}
            onFocus={handleTrailerFocus}
            onBlur={handleTrailerBlur}
            onPress={() => void handleOpenTrailer()}
          >
            <View style={styles.iconWrapper}>
              <YouTubeIcon width={28} height={20} />
            </View>
            <Animated.View
              style={[styles.labelWrapper, { opacity: trailerTextOpacity }]}
            >
              <Text style={styles.secondaryLabel} numberOfLines={1}>
                Trailer
              </Text>
            </Animated.View>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    alignItems: "stretch",
    flexDirection: "row",
    gap: 8,
    marginTop: 32,
  },
  iconWrapper: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: 0,
    width: COLLAPSED_WIDTH,
  },
  labelWrapper: {
    bottom: 0,
    justifyContent: "center",
    left: COLLAPSED_WIDTH,
    position: "absolute",
    right: 8,
    top: 0,
  },
  playAnimatedWrapper: {
    flex: 1,
  },
  playButton: {
    alignItems: "center",
    backgroundColor: PLAY_BTN_BG,
    borderColor: PLAY_BTN_BORDER,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 16,
  },
  playButtonFocused: {
    backgroundColor: PLAY_BTN_BG_FOCUSED,
    borderColor: PLAY_BTN_BORDER_FOCUSED,
  },
  playButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 18,
    fontWeight: "bold",
  },
  playButtonTextFocused: {
    color: PLAY_BTN_TEXT_FOCUSED,
  },
  secondaryAnimatedWrapper: {
    alignSelf: "stretch",
    borderRadius: 8,
    overflow: "hidden",
  },
  secondaryButton: {
    backgroundColor: SECONDARY_BTN_BG,
    borderColor: SECONDARY_BTN_BORDER,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonFocused: {
    backgroundColor: SECONDARY_BTN_BG_FOCUSED,
    borderColor: SECONDARY_BTN_BORDER_FOCUSED,
    borderWidth: 2,
  },
  secondaryIcon: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    fontWeight: "bold",
  },
  secondaryLabel: {
    color: Colors.dark.whiteText,
    fontSize: 14,
    fontWeight: "600",
  },
});
