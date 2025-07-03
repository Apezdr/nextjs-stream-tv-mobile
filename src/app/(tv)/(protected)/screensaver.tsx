import { useRouter, useFocusEffect, Href } from "expo-router";
import { useEffect, useCallback, useRef } from "react";
import { StyleSheet, useTVEventHandler, Animated } from "react-native";

import { Screensaver } from "@/src/components/TV/Screensaver";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";

export default function ScreensaverScreen() {
  const router = useRouter();
  const { hideScreensaver } = useScreensaver();
  const { setMode } = useTVAppState();
  const { resetActivityTimer } = useRemoteActivity();

  // Screen fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Set mode to screensaver when this screen is active
  useEffect(() => {
    console.log("[ScreensaverScreen] Setting mode to screensaver");
    setMode("screensaver");

    // Start fade-in animation when screen mounts
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800, // 800ms fade-in
      useNativeDriver: true,
    }).start();
  }, [setMode, fadeAnim]);

  // Handle exit screensaver
  const exitScreensaver = useCallback(() => {
    console.log("[ScreensaverScreen] Exiting screensaver");
    hideScreensaver();

    // Navigate back to previous screen
    if (router.canGoBack()) {
      router.back();
    } else {
      // Fallback to browse if no back history
      router.replace("/(tv)/(protected)/(browse)/" as Href);
    }
  }, [router, hideScreensaver]);

  // Handle TV remote events for screensaver navigation and exit
  useTVEventHandler((event) => {
    if (!event) return;

    const { eventType } = event;
    console.log("[ScreensaverScreen] TV Event:", eventType);

    // Reset activity timer for any interaction
    resetActivityTimer();

    // Handle navigation and exit
    switch (eventType) {
      case "back":
      case "menu":
        // Always exit on back/menu
        exitScreensaver();
        break;
      case "left":
      case "right":
        // Let the screensaver component handle button navigation
        // Don't exit on left/right, allow button navigation
        break;
      case "select":
      case "playPause":
        // Let the screensaver component handle button presses
        // Don't exit immediately, let buttons handle their actions
        break;
      case "up":
      case "down":
        // Exit screensaver on up/down navigation
        exitScreensaver();
        break;
      default:
        // For other events, just reset activity but don't exit
        break;
    }
  });

  // Handle focus events - but don't exit screensaver on unfocus during navigation
  useFocusEffect(
    useCallback(() => {
      console.log("[ScreensaverScreen] Screen focused");
      // Ensure we're in screensaver mode when focused
      setMode("screensaver");

      return () => {
        console.log(
          "[ScreensaverScreen] Screen unfocused - hiding screensaver",
        );
        // Hide screensaver when this screen loses focus
        hideScreensaver();
      };
    }, [setMode, hideScreensaver]),
  );

  // Clean up when component unmounts
  useEffect(() => {
    return () => {
      console.log(
        "[ScreensaverScreen] Component unmounting - ensuring screensaver is hidden",
      );
      // Always hide screensaver when component unmounts
      hideScreensaver();
    };
  }, [hideScreensaver]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Screensaver />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000000",
    flex: 1,
  },
});
