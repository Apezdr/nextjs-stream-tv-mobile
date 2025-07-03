import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { WatchHistory } from "@/src/data/types/content.types";

interface EpisodeProgressBarProps {
  watchHistory?: WatchHistory;
  duration: number; // Duration in milliseconds
}

export default function EpisodeProgressBar({
  watchHistory,
  duration,
}: EpisodeProgressBarProps) {
  // Convert duration from milliseconds to seconds (API returns duration in milliseconds)
  const durationInSeconds = duration / 1000;

  if (!watchHistory || !watchHistory.playbackTime || durationInSeconds <= 0) {
    return null;
  }

  const progressPercentage = Math.min(
    (watchHistory.playbackTime / durationInSeconds) * 100,
    100,
  );

  // Don't show progress bar if progress is minimal (less than 1%)
  if (progressPercentage < 1) {
    return null;
  }

  // Show "Watched" for 95%+ completion
  const isWatched = progressPercentage >= 95;

  return (
    <View style={styles.container}>
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercentage}%` },
              isWatched && styles.progressBarFillComplete,
            ]}
          />
        </View>
        {isWatched && <Text style={styles.watchedText}>Watched</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  progressBarContainer: {
    alignItems: "center",
    flexDirection: "row",
  },
  progressBarBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    flex: 1,
    height: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    backgroundColor: "#E50914",
    height: "100%",
  },
  progressBarFillComplete: {
    backgroundColor: "#46D369",
  },
  watchedText: {
    color: "#46D369",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
  },
});