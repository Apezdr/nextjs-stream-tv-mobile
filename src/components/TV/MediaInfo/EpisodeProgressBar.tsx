import React from "react";
import { View, Text, StyleSheet } from "react-native";

import { WatchHistory } from "@/src/data/types/content.types";

interface EpisodeProgressBarProps {
  watchHistory?: WatchHistory;
  duration: number; // Duration in milliseconds
  // When true, omit the playback/duration time label. The bar still renders
  // its progress fill, but the row stays tight (~8px tall instead of ~24px).
  // Used by the EpisodeCarousel where vertical space is constrained.
  compact?: boolean;
}

function formatTime(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function EpisodeProgressBar({
  watchHistory,
  duration,
  compact = false,
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
  const playbackTime = watchHistory.playbackTime;

  return (
    <View style={compact ? styles.containerCompact : styles.container}>
      <View style={styles.progressBarContainer}>
        <View
          style={[
            styles.progressBarBackground,
            compact && styles.progressBarBackgroundCompact,
          ]}
        >
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercentage}%` },
              isWatched && styles.progressBarFillComplete,
            ]}
          />
        </View>
        {!compact && (
          <Text
            style={styles.timeText}
          >{`${formatTime(playbackTime)}/${formatTime(durationInSeconds)}`}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  // Used when the bar is rendered as an overlay (e.g. on the thumbnail bottom
  // in EpisodeCarousel). Drops the marginTop so the bar sits flush against
  // the parent's bottom edge.
  containerCompact: {
    marginTop: 0,
  },
  progressBarBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 2,
    flex: 1,
    height: 4,
    marginRight: 8,
    overflow: "hidden",
  },
  // In compact mode the time label is omitted so the bar has no sibling on
  // its right — drop the marginRight so it spans the full parent width.
  // Also round the bottom corners to match the thumbnail's borderRadius (6)
  // when the bar is overlaid on the thumbnail's bottom edge. Top corners stay
  // square so the bar blends into the thumbnail above instead of looking like
  // a free-floating pill.
  progressBarBackgroundCompact: {
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    marginRight: 0,
  },
  progressBarContainer: {
    alignItems: "center",
    flexDirection: "row",
  },
  progressBarFill: {
    backgroundColor: "#E50914",
    height: "100%",
  },
  progressBarFillComplete: {
    backgroundColor: "#46D369",
  },
  timeText: {
    color: "#CCCCCC",
    fontSize: 12,
    marginLeft: 8,
  },
});
