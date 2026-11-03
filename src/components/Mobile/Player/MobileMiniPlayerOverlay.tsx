import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { VideoPlayer } from "expo-video";
import { memo, useCallback } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface MobileMiniPlayerOverlayProps {
  player: VideoPlayer;
  isLoading: boolean;
  onExpand: () => void;
  onClose: () => void;
}

/**
 * The chrome over the in-app mini player: a tap anywhere brings the watch
 * page back, play/pause sits bottom-left, close top-right, and a thin
 * progress line runs along the bottom edge. The full controls stay mounted
 * underneath but hidden, so nothing here duplicates their state.
 */
const MobileMiniPlayerOverlay = memo(
  ({ player, isLoading, onExpand, onClose }: MobileMiniPlayerOverlayProps) => {
    const { isPlaying } = useEvent(player, "playingChange", {
      isPlaying: player.playing,
    });
    const { currentTime } = useEvent(player, "timeUpdate", {
      currentTime: player.currentTime || 0,
      currentLiveTimestamp: 0,
      currentOffsetFromLive: 0,
      bufferedPosition: 0,
    });
    const duration = player.duration || 0;
    const progress =
      duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

    const togglePlay = useCallback(() => {
      try {
        if (player.playing) {
          player.pause();
        } else {
          player.play();
        }
      } catch (error) {
        console.warn("[MobileMiniPlayerOverlay] toggle failed:", error);
      }
    }, [player]);

    return (
      <View style={StyleSheet.absoluteFill}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onExpand}
          accessibilityRole="button"
          accessibilityLabel="Expand player"
        />
        {isLoading ? (
          <View style={styles.center} pointerEvents="none">
            <ActivityIndicator color="#FFFFFF" />
          </View>
        ) : null}
        <Pressable
          style={[styles.button, styles.close]}
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close player"
        >
          <Ionicons name="close" size={18} color="#FFFFFF" />
        </Pressable>
        <Pressable
          style={[styles.button, styles.play]}
          onPress={togglePlay}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? "Pause" : "Play"}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={18}
            color="#FFFFFF"
          />
        </Pressable>
        <View style={styles.progressTrack} pointerEvents="none">
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>
    );
  },
);

MobileMiniPlayerOverlay.displayName = "MobileMiniPlayerOverlay";

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.55)",
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    position: "absolute",
    width: 32,
  },
  center: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  close: {
    right: 6,
    top: 6,
  },
  play: {
    bottom: 8,
    left: 6,
  },
  progressFill: {
    backgroundColor: Colors.dark.brandPrimary,
    height: "100%",
  },
  progressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    bottom: 0,
    height: 3,
    left: 0,
    position: "absolute",
    right: 0,
  },
});

export default MobileMiniPlayerOverlay;
