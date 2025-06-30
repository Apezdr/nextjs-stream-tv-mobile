import { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface MediaInfoSkeletonProps {
  type?: "tv" | "movie";
}

export default function MediaInfoSkeleton({
  type = "tv",
}: MediaInfoSkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    shimmer.start();
    return () => shimmer.stop();
  }, [shimmerAnim]);

  const shimmerStyle = {
    opacity: shimmerAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 0.7],
    }),
  };

  if (type === "movie") {
    return (
      <View style={styles.container}>
        <View style={styles.movieLayout}>
          <View style={styles.movieColumn}>
            {/* Logo/Title Skeleton */}
            <Animated.View style={[styles.logoSkeleton, shimmerStyle]} />

            {/* Metadata Row Skeleton */}
            <View style={styles.metadataRow}>
              <Animated.View style={[styles.metadataItem, shimmerStyle]} />
              <Animated.View style={[styles.metadataItem, shimmerStyle]} />
              <Animated.View style={[styles.metadataItem, shimmerStyle]} />
            </View>

            {/* Overview Skeleton */}
            <View style={styles.overviewContainer}>
              <Animated.View style={[styles.overviewLine, shimmerStyle]} />
              <Animated.View style={[styles.overviewLine, shimmerStyle]} />
              <Animated.View style={[styles.overviewLineShort, shimmerStyle]} />
            </View>

            {/* Play Button Skeleton */}
            <Animated.View style={[styles.playButtonSkeleton, shimmerStyle]} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.twoColumnLayout}>
        {/* Left Column Skeleton */}
        <View style={styles.leftColumn}>
          {/* Logo Skeleton */}
          <Animated.View style={[styles.logoSkeleton, shimmerStyle]} />

          {/* Metadata Row Skeleton */}
          <View style={styles.metadataRow}>
            <Animated.View style={[styles.metadataItem, shimmerStyle]} />
            <Animated.View style={[styles.metadataItem, shimmerStyle]} />
            <Animated.View style={[styles.metadataItem, shimmerStyle]} />
          </View>

          {/* Overview Skeleton */}
          <View style={styles.overviewContainer}>
            <Animated.View style={[styles.overviewLine, shimmerStyle]} />
            <Animated.View style={[styles.overviewLine, shimmerStyle]} />
            <Animated.View style={[styles.overviewLineShort, shimmerStyle]} />
          </View>

          {/* Season Picker Skeleton */}
          <View style={styles.seasonPickerContainer}>
            <Animated.View style={[styles.seasonTitle, shimmerStyle]} />
            <View style={styles.seasonList}>
              {[1, 2, 3, 4].map((i) => (
                <Animated.View
                  key={i}
                  style={[styles.seasonItem, shimmerStyle]}
                />
              ))}
            </View>
          </View>
        </View>

        {/* Right Column Skeleton */}
        <View style={styles.rightColumn}>
          <Animated.View style={[styles.episodesTitle, shimmerStyle]} />
          <View style={styles.episodesList}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.episodeItem}>
                <Animated.View
                  style={[styles.episodeThumbnail, shimmerStyle]}
                />
                <View style={styles.episodeDetails}>
                  <Animated.View style={[styles.episodeTitle, shimmerStyle]} />
                  <Animated.View
                    style={[styles.episodeDescription, shimmerStyle]}
                  />
                  <Animated.View
                    style={[styles.episodeDescriptionShort, shimmerStyle]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.background,
    flex: 1,
  },
  twoColumnLayout: {
    flex: 1,
    flexDirection: "row",
    padding: 40,
  },
  leftColumn: {
    flex: 1,
    marginRight: 40,
  },
  rightColumn: {
    flex: 2,
  },
  movieLayout: {
    flex: 1,
    padding: 40,
  },
  movieColumn: {
    flex: 1,
    maxWidth: 600,
  },
  logoSkeleton: {
    backgroundColor: "#333333",
    borderRadius: 8,
    height: 80,
    marginBottom: 24,
    width: "60%",
  },
  metadataRow: {
    flexDirection: "row",
    marginBottom: 16,
  },
  metadataItem: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 16,
    marginRight: 12,
    width: 60,
  },
  overviewContainer: {
    marginBottom: 24,
  },
  overviewLine: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 14,
    marginBottom: 8,
    width: "100%",
  },
  overviewLineShort: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 14,
    width: "70%",
  },
  playButtonSkeleton: {
    backgroundColor: "#333333",
    borderRadius: 8,
    height: 50,
    marginTop: 32,
    width: 200,
  },
  seasonPickerContainer: {
    flex: 1,
    marginTop: 8,
  },
  seasonTitle: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 20,
    marginBottom: 16,
    width: 100,
  },
  seasonList: {
    flex: 1,
  },
  seasonItem: {
    backgroundColor: "#333333",
    borderRadius: 8,
    height: 40,
    marginVertical: 3,
    width: "100%",
  },
  episodesTitle: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 24,
    marginBottom: 20,
    width: 200,
  },
  episodesList: {
    flex: 1,
  },
  episodeItem: {
    flexDirection: "row",
    marginBottom: 16,
    padding: 12,
  },
  episodeThumbnail: {
    backgroundColor: "#333333",
    borderRadius: 8,
    height: 90,
    marginRight: 16,
    width: 160,
  },
  episodeDetails: {
    flex: 1,
  },
  episodeTitle: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 18,
    marginBottom: 8,
    width: "80%",
  },
  episodeDescription: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 14,
    marginBottom: 4,
    width: "100%",
  },
  episodeDescriptionShort: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 14,
    width: "60%",
  },
});
