import React from "react";
import { View, StyleSheet, Text } from "react-native";

export default function SettingsPage() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Configure your app</Text>
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
