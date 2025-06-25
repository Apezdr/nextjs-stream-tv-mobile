import React from "react";
import { View, StyleSheet, Text } from "react-native";

export default function TVShowsPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>TV Shows</Text>
      <Text style={styles.subtitle}>Browse your favorite series</Text>
    </View>
  );
}

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
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
});
