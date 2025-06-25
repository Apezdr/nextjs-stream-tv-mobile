import { Image } from "expo-image";
import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  Animated as RNAnimated,
  StyleSheet,
  View,
  Text,
  Dimensions,
} from "react-native";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

import { Colors } from "@/src/constants/Colors";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { ScreensaverResponse } from "@/src/data/types/content.types";

const { width, height } = Dimensions.get("window");
// cycle length for each screensaver display (ms)
const VISIBLE_DURATION = 15_000; // 15 seconds
const HORIZ_INSET = 800;
const VERTICAL_INSET = 200;
const TOP_INSET = height * 0.18;
const BOTTOM_INSET = height * 0.18;
const SAFE_INSET = 50;
const NETWORK_WIDTH = Math.min(width * 0.15, 120);
const INITIAL_DELAY = 500;
const FADE_DURATION = 2800;
const ZOOM_AMOUNT = 0.12;
const BURN_IN_DELAY = 120_000; // 2 minutes before dimming starts
const DIM_FADE_DURATION = 120_000; // 2 minutes to fade to dim
const MAX_DIM_OPACITY = 0.9; // Maximum dimming (0.9 = 90% black overlay)
const MAX_OVERLAY_OPACITY = 0.2; // Brightness adjustment
const TRANSLATE_SPEED_FACTOR = 0.3895; // Controls logo/title animation speed (0.1 = slow, 1.0 = fast)

export const Screensaver: React.FC = () => {
  const {
    isScreensaverActive,
    screensaverContent,
    opacity,
    error,
    clearError,
  } = useScreensaver();

  // Use TVAppStateContext to get video playback state
  const { playerState, currentMode } = useTVAppState();
  const isPlaying = playerState.isPlaying;

  const [displayedContent, setDisplayedContent] =
    useState<ScreensaverResponse | null>(null);
  const lastSwap = useRef(Date.now());
  const fadeInTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeOutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const backdropScale = useSharedValue(1);
  const dimOpacity = useSharedValue(0);
  const dimTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debug logging to track state changes
  useEffect(() => {
    console.log("[Screensaver Component] State:", {
      isScreensaverActive,
      isPlaying,
      currentMode,
      playerStateFromContext: playerState,
      shouldRender: isScreensaverActive && !isPlaying,
      hasError: !!error,
    });
  }, [isScreensaverActive, isPlaying, currentMode, playerState, error]);

  // Handle error state - auto-clear errors after display
  useEffect(() => {
    if (error) {
      console.warn("[Screensaver] Error detected:", error);
      // Auto-clear error after a delay to prevent permanent error states
      const errorClearTimer = setTimeout(() => {
        clearError();
      }, 5000);

      return () => clearTimeout(errorClearTimer);
    }
  }, [error, clearError]);

  // Function to start zoom animation from current value
  const startZoomAnimation = React.useCallback(
    (fromValue: number = 1) => {
      "worklet";
      // Calculate remaining zoom needed
      const toValue = fromValue <= 1 + ZOOM_AMOUNT / 2 ? 1 + ZOOM_AMOUNT : 1;
      const remainingZoom = Math.abs(toValue - fromValue);
      const duration = (remainingZoom / ZOOM_AMOUNT) * VISIBLE_DURATION;

      backdropScale.value = withSequence(
        // First, complete the current direction
        withTiming(toValue, {
          duration: duration,
          easing: Easing.inOut(Easing.ease),
        }),
        // Then continue with full cycles
        withRepeat(
          withSequence(
            withTiming(toValue === 1 ? 1 + ZOOM_AMOUNT : 1, {
              duration: VISIBLE_DURATION,
              easing: Easing.inOut(Easing.ease),
            }),
            withTiming(toValue === 1 ? 1 : 1 + ZOOM_AMOUNT, {
              duration: VISIBLE_DURATION,
              easing: Easing.inOut(Easing.ease),
            }),
          ),
          -1,
          false,
        ),
      );
    },
    [backdropScale],
  );

  // Burn-in protection timer management
  useEffect(() => {
    if (isScreensaverActive && !isPlaying) {
      // Clear any existing timer
      if (dimTimerRef.current) {
        clearTimeout(dimTimerRef.current);
      }

      // Reset dim opacity when screensaver becomes active
      dimOpacity.value = 0;

      // Start timer for burn-in protection
      dimTimerRef.current = setTimeout(() => {
        dimOpacity.value = withTiming(MAX_DIM_OPACITY, {
          duration: DIM_FADE_DURATION,
          easing: Easing.inOut(Easing.ease),
        });
      }, BURN_IN_DELAY);
    } else {
      // Clear timer and reset dimming when screensaver is inactive or video is playing
      if (dimTimerRef.current) {
        clearTimeout(dimTimerRef.current);
        dimTimerRef.current = null;
      }
      dimOpacity.value = withTiming(0, { duration: FADE_DURATION });
    }

    return () => {
      if (dimTimerRef.current) {
        clearTimeout(dimTimerRef.current);
      }
    };
  }, [isScreensaverActive, isPlaying, dimOpacity]);

  // Initial mount - start zoom from 1
  useEffect(() => {
    if (isScreensaverActive && !isPlaying) {
      startZoomAnimation(1);
      // Reset first load flag when screensaver becomes active
      isFirstLoadRef.current = true;
    }
    return () => {
      cancelAnimation(backdropScale);

      // Clear fade timers
      if (fadeInTimerRef.current) {
        clearTimeout(fadeInTimerRef.current);
        fadeInTimerRef.current = null;
      }
      if (fadeOutTimerRef.current) {
        clearTimeout(fadeOutTimerRef.current);
        fadeOutTimerRef.current = null;
      }
    };
  }, [isScreensaverActive, isPlaying, backdropScale, startZoomAnimation]);

  // Handle content swaps in sync with animation cycles
  useEffect(() => {
    if (!screensaverContent || isPlaying) return;

    // If no content is currently displayed, show immediately
    if (!displayedContent) {
      console.log("[Screensaver] Initial content load");
      setDisplayedContent(screensaverContent);
      lastSwap.current = Date.now();
      isFirstLoadRef.current = false;
      return;
    }

    // Skip content swaps during first cycle to avoid immediate replacement
    // of the first loaded content
    if (isFirstLoadRef.current) {
      console.log(
        "[Screensaver] Skipping early content swap during first cycle",
      );
      isFirstLoadRef.current = false;
      return;
    }

    // IMPORTANT: Only check timing and swap if we have new content
    // This fixes cases where the same content is received multiple times
    if (screensaverContent !== displayedContent) {
      const now = Date.now();
      const timeInCurrentCycle = now - lastSwap.current;

      // Force transition if enough time has passed
      const shouldTransition = timeInCurrentCycle >= VISIBLE_DURATION * 0.98;

      console.log("[Screensaver] Content swap check:", {
        timeElapsed: timeInCurrentCycle,
        cycleDuration: VISIBLE_DURATION,
        shouldTransition,
        currentId: displayedContent.backdrop,
        newId: screensaverContent.backdrop,
      });

      if (shouldTransition) {
        // It's been long enough, switch to the new content
        console.log(
          "[Screensaver] Swapping content at",
          timeInCurrentCycle,
          "ms of cycle",
        );
        lastSwap.current = now;
        setDisplayedContent(screensaverContent);
      }
    }
  }, [screensaverContent, displayedContent, isPlaying]);

  // Get animation config based on animationPlacement
  interface AnimationPlacement {
    startSide: "left" | "right" | "top" | "bottom";
    animationPath: "linear" | "curved" | "wave" | "diagonal";
    verticalPosition?: "top" | "center" | "bottom";
    horizontalPosition?: "left" | "center" | "right";
  }

  interface AnimationConfig {
    startSide: "left" | "right" | "top" | "bottom";
    animationPath: "linear" | "curved" | "wave" | "diagonal";
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }

  const getAnimationConfig = React.useCallback(
    (animationPlacement?: AnimationPlacement): AnimationConfig => {
      // Determine random startSide if not provided
      const randomStartSide = Math.random() < 0.5 ? "left" : "right";

      // Get startSide from placement data or use random
      const startSide = animationPlacement?.startSide || randomStartSide;

      // Get animation path or use default
      const animationPath = animationPlacement?.animationPath || "linear";

      // Calculate starting position based on startSide
      let startX = 0;
      let startY = 0;

      if (startSide === "left") {
        startX = -(width / 2 - HORIZ_INSET);
      } else if (startSide === "right") {
        startX = width / 2 - HORIZ_INSET;
      } else if (startSide === "top") {
        startY = -(height / 2 - VERTICAL_INSET);
      } else if (startSide === "bottom") {
        startY = height / 2 - VERTICAL_INSET;
      }

      return {
        startSide,
        animationPath,
        startX,
        startY,
        endX: 0, // Always animate to center
        endY: 0, // Always animate to center
      };
    },
    [],
  );

  // Get content positioning styles based on animationPlacement
  const getPositionStyles = useMemo(() => {
    // Define exact string literals for flex properties to satisfy TypeScript
    type FlexAlign =
      | "flex-start"
      | "flex-end"
      | "center"
      | "stretch"
      | "baseline";
    type FlexJustify =
      | "flex-start"
      | "flex-end"
      | "center"
      | "space-between"
      | "space-around"
      | "space-evenly";

    if (!displayedContent?.animationPlacement) {
      // Default positioning (bottom center)
      return {
        justifyContent: "flex-end" as FlexJustify,
        alignItems: "center" as FlexAlign,
        marginBottom: BOTTOM_INSET,
      };
    }

    const { verticalPosition, horizontalPosition } =
      displayedContent.animationPlacement;

    // Map position values to valid flex values
    const justifyValue: FlexJustify =
      verticalPosition === "top"
        ? "flex-start"
        : verticalPosition === "center"
          ? "center"
          : "flex-end";

    const alignValue: FlexAlign =
      horizontalPosition === "left"
        ? "flex-start"
        : horizontalPosition === "right"
          ? "flex-end"
          : "center";

    return {
      justifyContent: justifyValue,
      alignItems: alignValue,
      marginTop: verticalPosition === "top" ? TOP_INSET * 2 : 0,
      marginBottom: verticalPosition === "bottom" ? BOTTOM_INSET : 0,
      marginLeft: horizontalPosition === "left" ? SAFE_INSET * 2 : 0,
      marginRight: horizontalPosition === "right" ? SAFE_INSET * 2 : 0,
    };
  }, [displayedContent]);

  // Get contrast overlay style based on contrastAnalysis
  const getContrastOverlayStyle = useMemo(() => {
    if (!displayedContent?.contrastAnalysis?.needsAdjustment) {
      return null; // No overlay needed
    }

    const { recommendedOverlay } = displayedContent.contrastAnalysis;
    if (!recommendedOverlay) {
      return null; // No recommended overlay
    }

    console.log("[Screensaver] Using recommended overlay:", recommendedOverlay);

    // Extract RGB components from hex color
    const hexColor = recommendedOverlay.color.replace("#", "");
    const r = parseInt(hexColor.substring(0, 2), 16);
    const g = parseInt(hexColor.substring(2, 4), 16);
    const b = parseInt(hexColor.substring(4, 6), 16);

    const rawOpacity = recommendedOverlay.opacity;
    const overlayOpacity = Math.min(rawOpacity, MAX_OVERLAY_OPACITY);

    return {
      backgroundColor: `rgba(${r}, ${g}, ${b}, ${overlayOpacity})`,
      position: "absolute" as const, // Use 'as const' to satisfy TypeScript
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1, // Above backdrop but below content
    };
  }, [displayedContent]);

  // animate slide + fade when displayedContent changes
  useEffect(() => {
    if (!isScreensaverActive || !displayedContent || isPlaying) {
      // Cancel all animations if we shouldn't be showing
      cancelAnimation(translateX);
      cancelAnimation(translateY);
      cancelAnimation(contentOpacity);
      contentOpacity.value = 0;
      return;
    }

    // Cancel current zoom animation and restart from current value
    cancelAnimation(backdropScale);
    const currentScale = backdropScale.value;

    // Restart zoom animation from current position
    startZoomAnimation(currentScale);

    // First, cancel all ongoing animations
    cancelAnimation(translateX);
    cancelAnimation(translateY);
    cancelAnimation(contentOpacity);

    // Immediately set opacity to 0
    contentOpacity.value = 0;

    // Get animation configuration
    const config = getAnimationConfig(displayedContent.animationPlacement);

    // Set initial positions
    translateX.value = config.startX;
    translateY.value = config.startY;

    // Apply appropriate animation based on path type
    if (config.animationPath === "curved") {
      // Curved path animation
      const controlY = -height * 0.15; // Arc upward

      // X animation - straight to center
      translateX.value = withDelay(
        INITIAL_DELAY,
        withTiming(config.endX, {
          duration: (VISIBLE_DURATION - INITIAL_DELAY) / TRANSLATE_SPEED_FACTOR,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
        }),
      );

      // Y animation with arc effect
      translateY.value = withDelay(
        INITIAL_DELAY,
        withSequence(
          withTiming(controlY, {
            duration:
              (VISIBLE_DURATION - INITIAL_DELAY) / (2 * TRANSLATE_SPEED_FACTOR),
            easing: Easing.out(Easing.quad),
          }),
          withTiming(config.endY, {
            duration:
              (VISIBLE_DURATION - INITIAL_DELAY) / (2 * TRANSLATE_SPEED_FACTOR),
            easing: Easing.in(Easing.quad),
          }),
        ),
      );
    } else if (config.animationPath === "wave") {
      // Wave animation
      translateX.value = withDelay(
        INITIAL_DELAY,
        withTiming(config.endX, {
          duration: (VISIBLE_DURATION - INITIAL_DELAY) / TRANSLATE_SPEED_FACTOR,
          easing: Easing.linear,
        }),
      );

      // Create wave effect with multiple timing sequences
      const waveSegments = 4;
      const segmentDuration =
        (VISIBLE_DURATION - INITIAL_DELAY) /
        (waveSegments * TRANSLATE_SPEED_FACTOR);

      let waveSequence = [];
      const amplitude = height * 0.05;

      for (let i = 0; i < waveSegments; i++) {
        const yValue = i % 2 === 0 ? amplitude : -amplitude;
        waveSequence.push(
          withTiming(yValue, {
            duration: segmentDuration / 2,
            easing: Easing.inOut(Easing.sin),
          }),
        );
      }

      translateY.value = withDelay(
        INITIAL_DELAY,
        withSequence(...waveSequence),
      );
    } else if (config.animationPath === "diagonal") {
      // Diagonal animation
      translateX.value = withDelay(
        INITIAL_DELAY,
        withTiming(config.endX, {
          duration: (VISIBLE_DURATION - INITIAL_DELAY) / TRANSLATE_SPEED_FACTOR,
          easing: Easing.linear,
        }),
      );

      // Create diagonal effect by animating both X and Y
      translateY.value = withDelay(
        INITIAL_DELAY,
        withTiming(config.endY, {
          duration: (VISIBLE_DURATION - INITIAL_DELAY) / TRANSLATE_SPEED_FACTOR,
          easing: Easing.linear,
        }),
      );
    } else {
      // Default linear animation - this ensures simple horizontal movement
      // This is the most important case - it should always work
      console.log(
        "[Screensaver] Using linear animation, startX:",
        config.startX,
      );

      translateX.value = withDelay(
        INITIAL_DELAY,
        withTiming(config.endX, {
          duration: (VISIBLE_DURATION - INITIAL_DELAY) / TRANSLATE_SPEED_FACTOR,
          easing: Easing.linear,
        }),
      );

      translateY.value = withDelay(
        INITIAL_DELAY,
        withTiming(config.endY, {
          duration: (VISIBLE_DURATION - INITIAL_DELAY) / TRANSLATE_SPEED_FACTOR,
          easing: Easing.linear,
        }),
      );
    }

    // Clear any existing fade timers first
    if (fadeInTimerRef.current) {
      clearTimeout(fadeInTimerRef.current);
      fadeInTimerRef.current = null;
    }
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
    }

    // Handle fade-in and fade-out separately with clear steps

    // Step 1: Fade in after initial delay
    fadeInTimerRef.current = setTimeout(() => {
      contentOpacity.value = withTiming(1, {
        duration: FADE_DURATION,
        easing: Easing.inOut(Easing.ease),
      });
      fadeInTimerRef.current = null;
    }, INITIAL_DELAY);

    // Step 2: Fade out near the end of the visible duration
    fadeOutTimerRef.current = setTimeout(() => {
      contentOpacity.value = withTiming(0, {
        duration: FADE_DURATION,
        easing: Easing.inOut(Easing.ease),
      });
      fadeOutTimerRef.current = null;
    }, VISIBLE_DURATION - FADE_DURATION);
  }, [
    isScreensaverActive,
    displayedContent,
    isPlaying,
    backdropScale,
    contentOpacity,
    getAnimationConfig,
    startZoomAnimation,
    translateX,
    translateY,
  ]);

  // animated styles
  const slideFadeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
    opacity: contentOpacity.value,
  }));
  const badgeFadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    transform: [{ scale: backdropScale.value }],
  }));
  const dimStyle = useAnimatedStyle(() => ({ opacity: dimOpacity.value }));

  // Don't render if video is playing, regardless of other conditions
  if (!isScreensaverActive || isPlaying) {
    return null;
  }

  // Show error state if there's an error and no content
  if (error && !displayedContent) {
    return (
      <RNAnimated.View
        style={[styles.container, { opacity }]}
        pointerEvents={isScreensaverActive ? "auto" : "none"}
      >
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Screensaver content unavailable</Text>
          <Text style={styles.errorSubtext}>Retrying automatically...</Text>
        </View>
      </RNAnimated.View>
    );
  }

  // Don't render if no content available (but no error either)
  if (!displayedContent) {
    return null;
  }

  const { title, logo, backdrop, network, backdropBlurhash } = displayedContent;

  return (
    <RNAnimated.View
      style={[styles.container, { opacity }]}
      pointerEvents={isScreensaverActive ? "auto" : "none"}
    >
      <View style={styles.overlay}>
        <Reanimated.View style={[styles.backdrop, backdropStyle]}>
          <Image
            source={{ uri: backdrop }}
            placeholder={{ uri: backdropBlurhash }}
            contentFit="cover"
            transition={500}
            style={StyleSheet.absoluteFillObject}
          />
        </Reanimated.View>

        {/* Contrast overlay layer - applied directly on top of backdrop but below content */}
        {getContrastOverlayStyle && <View style={getContrastOverlayStyle} />}

        <Reanimated.View
          style={[styles.contentContainer, slideFadeStyle, getPositionStyles]}
        >
          {logo ? (
            <Image
              source={{ uri: logo }}
              contentFit="contain"
              style={styles.logo}
            />
          ) : (
            <Text style={styles.title}>{title}</Text>
          )}
        </Reanimated.View>

        {network && (
          <Reanimated.View style={[styles.networkContainer, badgeFadeStyle]}>
            {network.logo_url ? (
              <Image
                source={{ uri: network.logo_url }}
                contentFit="contain"
                style={styles.networkLogo}
              />
            ) : (
              <Text style={styles.networkName}>{network.name}</Text>
            )}
          </Reanimated.View>
        )}

        {/* Burn-in protection dimming overlay */}
        <Reanimated.View
          style={[styles.dimOverlay, dimStyle]}
          pointerEvents="none"
        />
      </View>
    </RNAnimated.View>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },

  container: {
    height,
    left: 0,
    position: "absolute",
    top: 0,
    width,
    zIndex: 9999,
  },

  contentContainer: { alignItems: "center", flex: 1, padding: 20, zIndex: 2 },

  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "black",
    zIndex: 9999,
  },

  errorContainer: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    flex: 1,
    justifyContent: "center",
    padding: 40,
  },

  errorSubtext: {
    color: "#ccc",
    fontSize: 24,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  errorText: {
    color: Colors.dark.whiteText,
    fontSize: 36,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },

  logo: {
    height: height * 0.2,
    marginBottom: 20,
    maxHeight: 120,
    width: width * 0.4,
  },

  networkContainer: {
    alignItems: "center",
    bottom: 17,
    position: "absolute",
    right: SAFE_INSET,
    width: NETWORK_WIDTH,
  },

  networkLogo: { aspectRatio: 1, height: undefined, width: "100%" },

  networkName: {
    color: Colors.dark.whiteText,
    fontSize: 32,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  overlay: { backgroundColor: "black", flex: 1 }, // Lighter default overlay

  title: {
    color: Colors.dark.whiteText,
    fontSize: 48,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.75)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 5,
  },
});
