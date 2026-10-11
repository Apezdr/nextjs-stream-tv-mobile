import React, { memo, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, type ViewStyle } from "react-native";

/**
 * What the screensaver shows while it has no content to show: during a
 * server outage, this is on screen for as long as the outage lasts. On an
 * otherwise black screen the only thing that can burn in is this text, so
 * it is dim grey rather than white, and it fades out and reappears in a
 * different corner every MOVE_INTERVAL_MS with a small random offset, the
 * same idea the screensaver uses for its instruction text.
 */
const INSET = 72;
const MOVE_INTERVAL_MS = 20_000;
const JITTER_PX = 24;
const FADE_MS = 600;

const CORNERS: ViewStyle[] = [
  { top: INSET, left: INSET, alignItems: "flex-start" },
  { top: INSET, right: INSET, alignItems: "flex-end" },
  { bottom: INSET, right: INSET, alignItems: "flex-end" },
  { bottom: INSET, left: INSET, alignItems: "flex-start" },
];

const jitter = () => Math.round((Math.random() * 2 - 1) * JITTER_PX);

function ScreensaverUnavailableComponent() {
  const [corner, setCorner] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fade = (toValue: number, onDone?: () => void) =>
      Animated.timing(opacity, {
        toValue,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => finished && onDone?.());

    fade(1);
    const timer = setInterval(() => {
      fade(0, () => {
        setCorner((c) => (c + 1) % CORNERS.length);
        setOffset({ x: jitter(), y: jitter() });
        fade(1);
      });
    }, MOVE_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      opacity.stopAnimation();
    };
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.notice,
        CORNERS[corner],
        {
          opacity,
          transform: [{ translateX: offset.x }, { translateY: offset.y }],
        },
      ]}
    >
      <Text style={styles.title}>Screensaver content unavailable</Text>
      <Text style={styles.subtitle}>Retrying automatically…</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  notice: {
    maxWidth: 520,
    position: "absolute",
  },
  subtitle: {
    color: "#6a6a6a",
    fontSize: 16,
    marginTop: 6,
  },
  title: {
    color: "#8c8c8c",
    fontSize: 22,
    fontWeight: "600",
  },
});

export const ScreensaverUnavailable = memo(ScreensaverUnavailableComponent);
