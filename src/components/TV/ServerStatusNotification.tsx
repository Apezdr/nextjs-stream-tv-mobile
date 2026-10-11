import React, { memo, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { Colors } from "@/src/constants/Colors";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import {
  selectHealthNotice,
  useServerHealthStore,
} from "@/src/stores/serverHealthStore";

/** How long the full bar stays before shrinking to the icon (watch screen). */
const FULL_MS = 6_000;
/** How long after a (re)appearance the icon fades out, while playing. */
const HIDE_AFTER_MS = 90_000;
const MINI_OPACITY = 0.45;
const FADE_MS = 500;

type Phase = "full" | "mini" | "hidden";
const PHASE_OPACITY: Record<Phase, { full: number; mini: number }> = {
  full: { full: 1, mini: 0 },
  mini: { full: 0, mini: MINI_OPACITY },
  hidden: { full: 0, mini: 0 },
};

/**
 * The TV's one line about connectivity: the device is offline, the server
 * can't be reached, or the server is up without its database. Driven by the
 * server-health store, which raises the server notices only after its own
 * probe failed twice — a single failed request never shows anything.
 *
 * On the watch screen it gets out of the way: the full bar for FULL_MS, then
 * a translucent icon (there if you look for it), then nothing after
 * HIDE_AFTER_MS of playback. Any remote press restarts that cycle, and while
 * the video is paused the icon stays. Not shown over the screensaver at all,
 * which has its own moving notice (burn-in).
 */
function ServerStatusNotificationComponent() {
  const notice = useServerHealthStore(selectHealthNotice);
  const { isScreensaverActive, isVideoPlaying } = useScreensaver();
  const { currentMode } = useTVAppState();
  const { isRemoteActive } = useRemoteActivity();

  const onWatchScreen = currentMode === "watch";

  // A remote press restarts the cycle. Rising edge only: isRemoteActive
  // stays true for 5 s after a press, and the cycle must not restart on
  // every render during that window.
  const [cycle, setCycle] = useState(0);
  const wasRemoteActive = useRef(isRemoteActive);
  useEffect(() => {
    if (isRemoteActive && !wasRemoteActive.current) setCycle((c) => c + 1);
    wasRemoteActive.current = isRemoteActive;
  }, [isRemoteActive]);

  const [phase, setPhase] = useState<Phase>("full");
  useEffect(() => {
    setPhase("full");
    if (!notice || !onWatchScreen) return;
    const toMini = setTimeout(() => setPhase("mini"), FULL_MS);
    // Paused: the user is looking at the screen, keep the icon.
    const toHidden = isVideoPlaying
      ? setTimeout(() => setPhase("hidden"), HIDE_AFTER_MS)
      : null;
    return () => {
      clearTimeout(toMini);
      if (toHidden) clearTimeout(toHidden);
    };
  }, [notice, onWatchScreen, isVideoPlaying, cycle]);

  const fullOpacity = useRef(new Animated.Value(1)).current;
  const miniOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const target = onWatchScreen ? PHASE_OPACITY[phase] : PHASE_OPACITY.full;
    Animated.parallel([
      Animated.timing(fullOpacity, {
        toValue: target.full,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
      Animated.timing(miniOpacity, {
        toValue: target.mini,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
    ]).start();
  }, [phase, onWatchScreen, fullOpacity, miniOpacity]);

  if (!notice || isScreensaverActive) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.notification, { opacity: fullOpacity }]}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.message}>{notice.message}</Text>
      </Animated.View>
      <Animated.View style={[styles.mini, { opacity: miniOpacity }]}>
        <Text style={styles.miniIcon}>⚠️</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 20,
    position: "absolute",
    right: 20,
    top: 20,
    zIndex: 1000,
  },
  icon: {
    color: Colors.dark.whiteText,
    fontSize: 20,
    marginRight: 12,
  },
  message: {
    color: Colors.dark.whiteText,
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
  },
  mini: {
    alignItems: "center",
    backgroundColor: "#dc3545",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    top: 0,
    width: 40,
  },
  miniIcon: {
    fontSize: 18,
  },
  notification: {
    alignItems: "center",
    backgroundColor: "#dc3545",
    borderRadius: 8,
    elevation: 5,
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
});

export const ServerStatusNotification = memo(ServerStatusNotificationComponent);
