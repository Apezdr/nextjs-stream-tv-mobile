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
  // Don't render if no watch history or no playback time
  if (
    !watchHistory ||
    !watchHistory.playbackTime ||
    watchHistory.playbackTime <= 0
  ) {
    return null;
  }

  // Convert duration from milliseconds to seconds (API returns duration in milliseconds)
  const adjustedDuration = duration ? duration / 1000 : 0;

  // Calculate progress percentage
  const progressPercentage = adjustedDuration
    ? Math.min((watchHistory.playbackTime / adjustedDuration) * 100, 100)
    : 0;

  // Don't show progress bar if we don't have duration or if progress is minimal
  if (!adjustedDuration || progressPercentage < 1) {
    return null;
  }

  const isCompleted = progressPercentage >= 95; // Consider 95%+ as completed

  return (
    <View style={[styles.container, style]}>
      <View style={styles.progressContainer}>
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
          {isCompleted
            ? "Watched"
            : `${formatTime(watchHistory.playbackTime)} / ${formatTime(adjustedDuration || 0)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
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
    minWidth: 100,
    textAlign: "right",
  },
  progressTrack: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    flex: 1,
    height: 4,
    marginRight: 12,
  },
});
