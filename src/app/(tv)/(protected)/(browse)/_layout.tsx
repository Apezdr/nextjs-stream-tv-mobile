import { Slot, usePathname } from "expo-router";
import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";

import TVTopNavigation from "@/src/components/TV/Navigation/TVTopNavigation";
import { useTVAppState } from "@/src/context/TVAppStateContext";

export default function BrowseLayout() {
  const { currentMode, setMode } = useTVAppState();
  const pathname = usePathname();

  // Ensure we're in browse mode for all browse routes. The guard prevents a
  // mount-time ping-pong with WatchPage: when the user navigates from browse
  // to watch, this layout stays alive in the stack and its effect would
  // otherwise re-fire and bounce the mode back to "browse" immediately after
  // WatchPage sets it to "watch".
  useEffect(() => {
    if (currentMode !== "browse") {
      setMode("browse");
    }
  }, [currentMode, setMode]);

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
