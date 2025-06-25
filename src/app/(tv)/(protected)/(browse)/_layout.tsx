import { Slot } from "expo-router";
import React, { useEffect } from "react";
import { View, StyleSheet, TVFocusGuideView } from "react-native";

import { TVSidebar } from "@/src/components/TV/Navigation";
import { useTVAppState } from "@/src/context/TVAppStateContext";

export default function BrowseLayout() {
  const { setMode } = useTVAppState();

  // Ensure we're in browse mode for all browse routes
  useEffect(() => {
    console.log("BrowseLayout: Setting mode to browse");
    setMode("browse");
  }, [setMode]);

  return (
    <View style={styles.container}>
      {/* Sidebar is always present in browse mode */}
      <TVFocusGuideView style={styles.focusGuide} autoFocus focusable>
        <TVSidebar />
        <Slot />
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
  focusGuide: {
    flex: 1,
  },
});
