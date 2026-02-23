import { lazy, Suspense } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";

import { Colors } from "@/src/constants/Colors";

// Lazy load the heavy TV shows page content for code-splitting
const LazyTVShowsPageContent = lazy(
  () => import("@/src/components/TV/Pages/TVShows/TVShowsPageContent"),
);

// Lightweight fallback for the entire page
const TVShowsPageFallback = () => (
  <View style={styles.container}>
    <View style={styles.fallbackContainer}>
      <Text style={styles.title}>TV Shows</Text>
      <ActivityIndicator color="#FFFFFF" size="large" />
      <Text style={styles.fallbackText}>Loading TV shows page...</Text>
    </View>
  </View>
);

export default function TVShowsPage() {
  return (
    <Suspense fallback={<TVShowsPageFallback />}>
      <LazyTVShowsPageContent />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  fallbackContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingVertical: 50,
  },
  fallbackText: {
    color: "#CCCCCC",
    fontSize: 16,
    marginTop: 15,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
