import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { Colors } from "@/src/constants/Colors";
import { WatchHistory } from "@/src/data/types/content.types";

interface WatchProgressBarProps {
  watchHistory?: WatchHistory;
  duration?: number; // Duration in seconds
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
  const adjustedDuration = duration ? duration / 1000 : 0;

  // Nothing to show if we don't have a valid duration
  if (!adjustedDuration) {
    return null;
  }

  // Determine if we have useful watch history
  const hasWatchHistory =
    !!watchHistory &&
    !!watchHistory.playbackTime &&
    watchHistory.playbackTime > 0;

  const playbackTime = watchHistory?.playbackTime ?? 0;

  const progressPercentage = hasWatchHistory
    ? Math.min((playbackTime / adjustedDuration) * 100, 100)
    : 0;

  // Only render the progress bar component when user has watched 10+ seconds
  if (!hasWatchHistory || playbackTime < 10) {
    return null;
  }

  const isCompleted = progressPercentage >= 95; // Consider 95%+ as completed

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

      {/* "Watched" label below the progress container */}
      {isCompleted && (
        <View style={styles.watchedContainer}>
          <Text style={styles.watchedLabel}>Watched</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    position: "relative", // Enable absolute positioning for child elements
  },
  progressContainer: {
    alignItems: "center",
    flexDirection: "row",
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
  watchedContainer: {
    position: "absolute",
    right: 20,
    top: 16,
  },
  watchedLabel: {
    color: "#30830fff",
    fontSize: 12,
    fontStyle: "italic",
    fontWeight: "800",
  },
});
