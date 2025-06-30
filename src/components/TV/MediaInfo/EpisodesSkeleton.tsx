import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";

export default function EpisodesSkeleton() {
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

  return (
    <View style={styles.container}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.episodeItem}>
          <Animated.View style={[styles.episodeThumbnail, shimmerStyle]} />
          <View style={styles.episodeDetails}>
            <Animated.View style={[styles.episodeTitle, shimmerStyle]} />
            <Animated.View style={[styles.episodeDescription, shimmerStyle]} />
            <Animated.View
              style={[styles.episodeDescriptionShort, shimmerStyle]}
            />
            <Animated.View style={[styles.episodeDuration, shimmerStyle]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingVertical: 8,
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
    marginBottom: 8,
    width: "60%",
  },
  episodeDetails: {
    flex: 1,
  },
  episodeDuration: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 12,
    width: "30%",
  },
  episodeItem: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    flexDirection: "row",
    marginVertical: 6,
    padding: 12,
  },
  episodeThumbnail: {
    backgroundColor: "#333333",
    borderRadius: 8,
    height: 90,
    marginRight: 16,
    width: 160,
  },
  episodeTitle: {
    backgroundColor: "#333333",
    borderRadius: 4,
    height: 18,
    marginBottom: 8,
    width: "80%",
  },
});
