import { lazy, Suspense } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/src/constants/Colors";

const LazyMyListPageContent = lazy(
  () => import("@/src/components/TV/Pages/MyList/MyListPageContent"),
);

export default function MyListPage() {
  return (
    <Suspense fallback={<MyListPageFallback />}>
      <LazyMyListPageContent />
    </Suspense>
  );
}

const MyListPageFallback = () => (
  <View style={styles.container}>
    <Text style={styles.title}>My List</Text>
    <ActivityIndicator color="#FFFFFF" size="large" />
    <Text style={styles.subtitle}>Loading your watchlist...</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#141414",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  subtitle: {
    color: "#CCCCCC",
    fontSize: 18,
  },
  title: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
