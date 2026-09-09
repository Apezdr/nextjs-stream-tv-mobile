import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";
import { WatchHistory } from "@/src/data/types/content.types";
import {
  durationMsToSeconds,
  isWatchCompleted,
  watchProgressPercent,
} from "@/src/utils/watchProgress";

interface WatchProgressBarProps {
  watchHistory?: WatchHistory;
  duration?: number; // Duration in MILLISECONDS (the server's unit)
  style?: any;
}

// Helper function to format time in MM:SS or HH:MM:SS format
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export default function WatchProgressBar({
  watchHistory,
  duration,
  style,
}: WatchProgressBarProps) {
  // Convert duration from milliseconds to seconds (API returns duration in milliseconds)
  const adjustedDuration = durationMsToSeconds(duration);

  // Nothing to show if we don't have a valid duration
  if (!adjustedDuration) {
    return null;
  }

  const playbackTime = watchHistory?.playbackTime ?? 0;
  const progressPercentage = watchProgressPercent(watchHistory, duration) ?? 0;

  // Only render the progress bar component when user has watched 10+ seconds
  if (playbackTime < 10) {
    return null;
  }

  // Server verdict when present, else the shared local threshold.
  const isCompleted = isWatchCompleted(watchHistory, duration);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.progressContainer}>
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progressPercentage}%` },
              isCompleted && styles.progressFillCompleted,
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {`${formatTime(playbackTime)} / ${formatTime(adjustedDuration)}`}
        </Text>
      </View>

      {/* "Watched" label aligned with the progress row */}
      {isCompleted && <Text style={styles.watchedLabel}>Watched</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  progressContainer: {
    alignItems: "center",
    flexDirection: "row",
    flex: 1,
  },
  progressFill: {
    backgroundColor: Colors.dark.tint,
    borderRadius: 2,
    height: "100%",
  },
  progressFillCompleted: {
    backgroundColor: "#4CAF50", // Green for completed
  },
  progressText: {
    color: "#CCCCCC",
    fontSize: 14,
    textAlign: "right",
  },
  progressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    flex: 1,
    height: 4,
    marginRight: 12,
  },
  watchedLabel: {
    color: "#30830fff",
    fontSize: 12,
    fontStyle: "italic",
    fontWeight: "800",
    marginLeft: 12,
  },
});
