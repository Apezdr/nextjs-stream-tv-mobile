import { useRouter, useFocusEffect, Href } from "expo-router";
import { useIsFocused } from "expo-router/react-navigation";
import { useEffect, useCallback, useRef } from "react";
import { StyleSheet, useTVEventHandler, Animated } from "react-native";

import { Screensaver } from "@/src/components/TV/Screensaver";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState, TVAppMode } from "@/src/context/TVAppStateContext";

export default function ScreensaverScreen() {
  const router = useRouter();
  const { hideScreensaver, isScreensaverActive } = useScreensaver();
  const { currentMode, setMode } = useTVAppState();
  const { resetActivityTimer } = useRemoteActivity();
  const isFocused = useIsFocused();

  // Screen fade-in animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // The mode this screen interrupted, captured on the first render before we
  // overwrite it, so exiting can put it back.
  const previousModeRef = useRef<TVAppMode | null>(null);
  if (previousModeRef.current === null && currentMode !== "screensaver") {
    previousModeRef.current = currentMode;
  }

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

  // Handle exit screensaver. Leaves at most once: the remote handler fires
  // on key-down and key-up, and the deactivation effect below runs for the
  // same exit, so a second call here would pop the screen underneath too.
  const leftRef = useRef(false);
  const exitScreensaver = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
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

  // The context can deactivate the screensaver without this route going
  // anywhere: a player behind it reports playing (on Android the remote's
  // play button is answered by the media session natively, never through
  // JS), or activity is seen while the mode is not "screensaver".
  // `hideScreensaver()` only clears a flag; the Screensaver component then
  // renders null, which left this route's black container on top with no
  // focusable view on it — so the DPAD never reached JS again and only Back
  // (the Activity path) worked. Pop the route ourselves — but only after the
  // context has been seen active from this route: showScreensaver() sets the
  // flag and pushes the route in one call, and nothing guarantees which
  // commit lands first, so a first render with the flag still false is the
  // route mounting, not a deactivation.
  const wasActiveRef = useRef(false);
  if (isScreensaverActive) wasActiveRef.current = true;
  useEffect(() => {
    if (isScreensaverActive || !isFocused || !wasActiveRef.current) return;
    console.log("[ScreensaverScreen] Deactivated while on top - leaving");
    exitScreensaver();
  }, [isScreensaverActive, isFocused, exitScreensaver]);

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
        // Let the screensaver component handle button presses
        // Don't exit immediately, let buttons handle their actions
        break;
      case "playPause":
        // Over the watch screen the viewer wants the video back, not the
        // action buttons. The player behind this route is stripped while its
        // screen is blurred (useOptimizedVideoPlayer), so the press itself
        // plays nothing; leaving lets the watch screen restore its position.
        if (previousModeRef.current === "watch") {
          exitScreensaver();
        }
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

      // Restore the mode we interrupted. NOTHING else will.
      //
      // `hideScreensaver()` only clears the context's visibility flag; the TV
      // app mode is separate and this screen is the only thing that ever set it
      // to "screensaver". The browse screens' "ensure browse mode" effects
      // cannot recover it either: they are gated on `currentMode` in their
      // deps, and once this screen stops re-asserting "screensaver" that value
      // never changes again, so those effects never re-run. The app stayed in
      // screensaver mode permanently and every mode-gated feature stayed
      // paused — most visibly the banner state machine, which is gated on
      // `currentMode === "browse"` and froze until the app was restarted.
      const restoreTo = previousModeRef.current ?? "browse";
      console.log(`[ScreensaverScreen] Restoring TV app mode to ${restoreTo}`);
      setMode(restoreTo);
    };
  }, [hideScreensaver, setMode]);

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
