import { Slot, usePathname } from "expo-router";
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";

import TVTopNavigation from "@/src/components/TV/Navigation/TVTopNavigation";
import { useTVAppState } from "@/src/context/TVAppStateContext";

export default function BrowseLayout() {
  const { setMode } = useTVAppState();
  const pathname = usePathname();

  // Ensure we're in browse mode for all browse routes
  useEffect(() => {
    console.log("BrowseLayout: Setting mode to browse");
    setMode("browse");
  }, [setMode]);

  return (
    <View style={styles.container}>
      {/* Top Navigation */}
      <TVTopNavigation currentRoute={pathname} />

      {/* Main Content */}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  content: {
    flex: 1,
    paddingTop: 80, // Account for fixed top navigation height
  },
});
