import React from "react";
import { View, StyleSheet, Text } from "react-native";

export default function MyListPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My List</Text>
      <Text style={styles.subtitle}>Your saved content</Text>
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
