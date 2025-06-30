import { useCallback, useMemo } from "react";
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from "react-native-reanimated";

import { EXPANDED_WIDTH } from "@/src/constants/SidebarConstants";

export type SidebarAnimationState = "closed" | "minimized" | "expanded";

export const useSidebarAnimation = () => {
  // Animation values - completely isolated from context
  const sidebarProgress = useSharedValue(0.5); // Start minimized (0.5)
  const textOpacity = useSharedValue(0); // Start with text hidden (minimized state)

  // Optimized animation config - faster and more responsive
  const animationConfig = useMemo(
    () => ({
      progress: {
        duration: 150, // Reduced from 200ms for snappier feel
        easing: Easing.bezier(0.25, 0.46, 0.45, 0.94), // More responsive than cubic
      },
      opacity: {
        duration: 100, // Reduced from 150ms for faster text transitions
        easing: Easing.inOut(Easing.ease),
      },
    }),
    [],
  );

  // Direct worklet animation function (no runOnUI wrapper for better performance)
  const animateToState = useCallback(
    (state: SidebarAnimationState) => {
      "worklet";
      const targetProgress =
        state === "closed" ? 0 : state === "minimized" ? 0.5 : 1;
      const targetOpacity = state === "expanded" ? 1 : 0;

      sidebarProgress.value = withTiming(
        targetProgress,
        animationConfig.progress,
      );
      textOpacity.value = withTiming(targetOpacity, animationConfig.opacity);
    },
    [animationConfig],
  );

  // Optimized animated styles with inline constants to prevent worklet capture overhead
  const sidebarAnimatedStyle = useAnimatedStyle(() => {
    "worklet";
    // Use inline constants to prevent worklet capture overhead
    const MINIMIZED = 60;
    const EXPANDED = EXPANDED_WIDTH;

    const width = interpolate(
      sidebarProgress.value,
      [0, 0.5, 1],
      [0, MINIMIZED, EXPANDED],
    );

    const translateX = interpolate(
      sidebarProgress.value,
      [0, 0.5, 1],
      [-MINIMIZED, 0, 0],
    );

    return {
      width,
      transform: [{ translateX }],
    };
  }, []);

  return {
    animateToState,
    sidebarAnimatedStyle,
    textOpacity,
    sidebarProgress, // For debugging purposes
  };
};
