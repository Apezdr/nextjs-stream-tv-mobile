import { memo } from "react";
import { View, StyleSheet, Text, ActivityIndicator } from "react-native";

import { Colors } from "@/src/constants/Colors";

interface GenreRowFallbackProps {
  genreName: string;
}

const GenreRowFallback = memo(function GenreRowFallback({
  genreName,
}: GenreRowFallbackProps) {
  return (
    <View style={styles.genreSection}>
      <Text style={styles.genreTitle}>{genreName} Movies</Text>
      <View style={styles.genreLoadingContainer}>
        <ActivityIndicator color="#FFFFFF" />
        <Text style={styles.genreLoadingText}>
          Loading {genreName.toLowerCase()}...
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  genreLoadingContainer: {
    alignItems: "center",
    flexDirection: "row",
    paddingVertical: 20,
  },
  genreLoadingText: {
    color: "#CCCCCC",
    fontSize: 14,
    marginLeft: 10,
  },
  genreSection: {
    marginBottom: 20,
    minHeight: 280,
    paddingVertical: 10,
  },
  genreTitle: {
    color: Colors.dark.whiteText,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 15,
  },
});

export default GenreRowFallback;
