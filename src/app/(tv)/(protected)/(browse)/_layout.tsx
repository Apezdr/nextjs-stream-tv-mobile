import { Slot, useFocusEffect } from "expo-router";
import React, { useEffect, useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";

import { TVSidebar } from "@/src/components/TV/Navigation";
import { useTVAppState } from "@/src/context/TVAppStateContext";

export default function BrowseLayout() {
  const { setMode } = useTVAppState();
  const [shouldSidebarHandleBackButton, setShouldSidebarHandleBackButton] =
    useState(false);

  // Ensure we're in browse mode for all browse routes
  useEffect(() => {
    console.log("BrowseLayout: Setting mode to browse");
    setMode("browse");
  }, [setMode]);

  // Use focus effect to control when sidebar should handle back button
  useFocusEffect(
    useCallback(() => {
      // When this screen gains focus, allow sidebar to handle back button
      setShouldSidebarHandleBackButton(true);

      return () => {
        // When this screen loses focus, disable sidebar back button handling
        setShouldSidebarHandleBackButton(false);
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      {/* Sidebar is always present in browse mode */}
      <TVSidebar
        shouldRegisterBackButtonHandler={shouldSidebarHandleBackButton}
      />
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#141414",
    flex: 1,
  },
});
