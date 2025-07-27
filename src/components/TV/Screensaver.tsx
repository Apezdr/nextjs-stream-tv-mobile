import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Href, useRouter } from "expo-router";
import React, { useEffect, useState, useRef, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Dimensions,
  Pressable,
  ViewStyle,
  useTVEventHandler,
  TVFocusGuideView,
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
const BURN_IN_DELAY = 30_000; // 30 seconds before dimming starts
const DIM_FADE_DURATION = 120_000; // 2 minutes to fade to dim
const MAX_DIM_OPACITY = 0.9; // Maximum dimming (0.9 = 90% black overlay)
const MAX_OVERLAY_OPACITY = 0.2; // Brightness adjustment
const TRANSLATE_SPEED_FACTOR = 0.3895; // Controls logo/title animation speed (0.1 = slow, 1.0 = fast)

// Progressive disclosure timing
const INTERACTION_TIMEOUT = 8000; // Hide buttons after 8 seconds of no interaction
const MINIMAL_INSTRUCTION_DELAY = 2000; // Show minimal instructions after 2 seconds

// Button timing - progressive disclosure pattern
const BUTTONS_SHOW_DELAY = 300; // Quick show after interaction

// Instruction text positions for burn-in prevention
const INSTRUCTION_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "bottom-center",
] as const;
type InstructionPosition = (typeof INSTRUCTION_POSITIONS)[number];

const SCREENSAVER_BUTTONS = [
  { action: "watch", label: "Watch Now", icon: "▶️" },
  { action: "info", label: "More Info", icon: "ℹ️" },
  { action: "list", label: "My List", icon: "➕" },
  { action: "browse", label: "Browse", icon: "🔍" },
];

export const Screensaver: React.FC = () => {
  const {
    isScreensaverActive,
    screensaverContent,
    opacity,
    error,
    clearError,
    hideScreensaver,
  } = useScreensaver();

  // Use TVAppStateContext to get video playback state
  const { playerState, currentMode, setMode } = useTVAppState();
  const router = useRouter();

  const isPlaying = playerState.isPlaying;

  // Progressive disclosure state management
  const [selectedButtonIndex, setSelectedButtonIndex] = useState(0);
  const [showButtons, setShowButtons] = useState(false);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const buttonHideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Instruction text positioning for burn-in prevention
  const [instructionPosition, setInstructionPosition] =
    useState<InstructionPosition>("bottom-center");
  const [showInstructions, setShowInstructions] = useState(false);

  const [displayedContent, setDisplayedContent] =
    useState<ScreensaverResponse | null>(null);
  const lastSwap = useRef(Date.now());
  const fadeInTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeOutTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoadRef = useRef<boolean>(true);

  // Transition pause state for user interaction
  const pauseStartTimeRef = useRef<number>(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const contentOpacity = useSharedValue(0);
  const backdropScale = useSharedValue(1);
  const dimOpacity = useSharedValue(0);
  const dimTimerRef = useRef<NodeJS.Timeout | null>(null);
  const buttonsOpacity = useSharedValue(0);

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
        dimTimerRef.current = null;
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

  // Handle user interaction to trigger progressive disclosure
  const handleUserInteraction = () => {
    console.log("[Screensaver] User interaction detected - showing buttons");

    setIsUserInteracting(true);
    setShowButtons(true);

    // Record pause start time for transition timing adjustment
    pauseStartTimeRef.current = Date.now();
    console.log("[Screensaver] Pausing transitions for user interaction");

    // Clear fade out timer to prevent logo from fading during interaction
    if (fadeOutTimerRef.current) {
      clearTimeout(fadeOutTimerRef.current);
      fadeOutTimerRef.current = null;
      console.log("[Screensaver] Cleared fade out timer to keep logo visible");
    }

    // Ensure logo is visible during interaction - fade it back in if needed
    if (contentOpacity.value < 1) {
      console.log("[Screensaver] Fading logo back in for user interaction");
      contentOpacity.value = withTiming(1, {
        duration: 300,
        easing: Easing.inOut(Easing.ease),
      });
    }

    buttonsOpacity.value = withTiming(1, {
      duration: BUTTONS_SHOW_DELAY,
      easing: Easing.inOut(Easing.ease),
    });

    // Clear any existing timeouts
    if (interactionTimeoutRef.current) {
      clearTimeout(interactionTimeoutRef.current);
      interactionTimeoutRef.current = null;
    }
    if (buttonHideTimeoutRef.current) {
      clearTimeout(buttonHideTimeoutRef.current);
      buttonHideTimeoutRef.current = null;
    }

    // Clear burn-in protection timer and quickly remove dimming on interaction
    if (dimTimerRef.current) {
      clearTimeout(dimTimerRef.current);
      dimTimerRef.current = null;
    }
    // Quickly fade out any existing dimming overlay
    dimOpacity.value = withTiming(0, { duration: 200 });

    // Set timeout to hide buttons after inactivity
    interactionTimeoutRef.current = setTimeout(() => {
      console.log("[Screensaver] Interaction timeout - hiding buttons");
      setIsUserInteracting(false);
      buttonsOpacity.value = withTiming(0, {
        duration: 500,
        easing: Easing.inOut(Easing.ease),
      });

      // Use separate ref for button hide timeout
      buttonHideTimeoutRef.current = setTimeout(() => {
        setShowButtons(false);

        // Resume transitions by extending the cycle time
        const pauseDuration = Date.now() - pauseStartTimeRef.current;
        lastSwap.current += pauseDuration;
        console.log(
          "[Screensaver] Resuming transitions - extended cycle by",
          pauseDuration,
          "ms",
        );

        buttonHideTimeoutRef.current = null;
      }, 500);

      interactionTimeoutRef.current = null;

      // Restart burn-in protection timer after user interaction ends
      dimTimerRef.current = setTimeout(() => {
        dimOpacity.value = withTiming(0.3, { duration: FADE_DURATION });
        dimTimerRef.current = null;
      }, BURN_IN_DELAY);
    }, INTERACTION_TIMEOUT);
  };

  // TV Event Handler for progressive disclosure
  useTVEventHandler((event) => {
    if (!event || !isScreensaverActive || isPlaying) return;

    const { eventType, eventKeyAction } = event;
    console.log("[Screensaver] TV Event:", eventType, eventKeyAction);

    // Handle navigation events
    if (eventType === "left" && eventKeyAction === 1) {
      handleUserInteraction();
      handleButtonNavigation("left");
    } else if (eventType === "right" && eventKeyAction === 1) {
      handleUserInteraction();
      handleButtonNavigation("right");
    } else if (eventType === "select" && eventKeyAction === 1 && showButtons) {
      // Handle button press
      const buttons = ["watch", "info", "list", "browse"];
      handleButtonPress(buttons[selectedButtonIndex]);
    } else if (
      (eventType === "up" || eventType === "down") &&
      eventKeyAction === 1
    ) {
      // Exit screensaver on up/down using context method
      hideScreensaver();
    } else if (eventKeyAction === 1) {
      // Any other button press triggers interaction
      handleUserInteraction();
    }
  });

  // Progressive disclosure: Hide buttons after timeout
  useEffect(() => {
    if (!isScreensaverActive || isPlaying) {
      // Reset state when screensaver is not active
      setIsUserInteracting(false);
      setShowButtons(false);
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
        interactionTimeoutRef.current = null;
      }
      if (buttonHideTimeoutRef.current) {
        clearTimeout(buttonHideTimeoutRef.current);
        buttonHideTimeoutRef.current = null;
      }
    }

    return () => {
      if (interactionTimeoutRef.current) {
        clearTimeout(interactionTimeoutRef.current);
        interactionTimeoutRef.current = null;
      }
      if (buttonHideTimeoutRef.current) {
        clearTimeout(buttonHideTimeoutRef.current);
        buttonHideTimeoutRef.current = null;
      }
    };
  }, [isScreensaverActive, isPlaying]);

  // Handle content swaps in sync with animation cycles
  useEffect(() => {
    if (!screensaverContent || isPlaying) return;

    // If no content is currently displayed, show immediately
    if (!displayedContent) {
      console.log("[Screensaver] Initial content load");
      setDisplayedContent(screensaverContent);
      lastSwap.current = Date.now();
      isFirstLoadRef.current = false;
      // Set initial instruction position
      setInstructionPosition(INSTRUCTION_POSITIONS[0]);
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

    // Skip content swaps when user is interacting (buttons are shown)
    if (showButtons) {
      console.log("[Screensaver] Skipping content swap - user is interacting");
      return;
    }

    // IMPORTANT: Only check timing and swap if we have new content
    // This fixes cases where the same content is received multiple times
    if (screensaverContent._id !== displayedContent._id) {
      const now = Date.now();
      const timeInCurrentCycle = now - lastSwap.current;

      // Force transition if enough time has passed
      const shouldTransition = timeInCurrentCycle >= VISIBLE_DURATION * 0.98;

      console.log("[Screensaver] Content swap check:", {
        timeElapsed: timeInCurrentCycle,
        cycleDuration: VISIBLE_DURATION,
        shouldTransition,
        showButtons,
        currentId: displayedContent._id,
        newId: screensaverContent._id,
        currentType: displayedContent.type,
        newType: screensaverContent.type,
      });

      if (shouldTransition) {
        // It's been long enough, switch to the new content
        console.log(
          "[Screensaver] Swapping content at",
          timeInCurrentCycle,
          "ms of cycle",
        );

        // Hide instructions immediately when content actually changes
        console.log("[Screensaver] Hiding instructions as content changes");
        setShowInstructions(false);

        lastSwap.current = now;
        setDisplayedContent(screensaverContent);

        // Rotate instruction position to prevent burn-in
        const currentIndex = INSTRUCTION_POSITIONS.indexOf(instructionPosition);
        const nextIndex = (currentIndex + 1) % INSTRUCTION_POSITIONS.length;
        setInstructionPosition(INSTRUCTION_POSITIONS[nextIndex]);
        console.log(
          "[Screensaver] Rotating instruction position to:",
          INSTRUCTION_POSITIONS[nextIndex],
        );
      }
    }
  }, [screensaverContent, displayedContent, isPlaying, showButtons]);

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

  // Get instruction text positioning with burn-in prevention and network logo avoidance
  const getInstructionPositionStyles = useMemo(() => {
    const hasNetworkLogo =
      !!displayedContent?.network?.logo_url ||
      !!displayedContent?.network?.name;

    // Define position configurations for instruction text
    const positions = {
      "top-left": {
        position: "absolute" as const,
        top: SAFE_INSET,
        left: SAFE_INSET,
        alignItems: "flex-start" as const,
      },
      "top-right": {
        position: "absolute" as const,
        top: SAFE_INSET,
        right: SAFE_INSET,
        alignItems: "flex-end" as const,
      },
      "bottom-left": {
        position: "absolute" as const,
        bottom: SAFE_INSET,
        left: SAFE_INSET,
        alignItems: "flex-start" as const,
      },
      "bottom-right": {
        position: "absolute" as const,
        bottom: SAFE_INSET,
        right: hasNetworkLogo ? SAFE_INSET * 3 + NETWORK_WIDTH : SAFE_INSET, // Avoid network logo
        alignItems: "flex-end" as const,
      },
      "bottom-center": {
        position: "absolute" as const,
        bottom: SAFE_INSET - 20,
        left: 0,
        right: 0,
        alignItems: "center" as const,
      },
    };

    return positions[instructionPosition];
  }, [instructionPosition, displayedContent]);

  // Get instruction text color based on backdrop contrast analysis
  const getInstructionTextStyles = useMemo(() => {
    const contrastAnalysis = displayedContent?.contrastAnalysis;

    // Default styles for when no contrast analysis is available
    const defaultStyles = {
      color: Colors.dark.whiteText,
      textShadowColor: "rgba(0, 0, 0, 0.8)",
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 2,
    };

    if (!contrastAnalysis) {
      return defaultStyles;
    }

    const { backdropDominantArea, backdropLuminance } = contrastAnalysis;

    // Determine text color based on backdrop analysis
    let textColor = Colors.dark.whiteText;
    let shadowColor = "rgba(0, 0, 0, 0.8)";

    if (
      backdropDominantArea === "light" ||
      (backdropLuminance && backdropLuminance > 0.6)
    ) {
      // Light backdrop - use dark text
      textColor = "#1a1a1a";
      shadowColor = "rgba(255, 255, 255, 0.8)";
    } else if (
      backdropDominantArea === "dark" ||
      (backdropLuminance && backdropLuminance < 0.3)
    ) {
      // Dark backdrop - use light text
      textColor = Colors.dark.whiteText;
      shadowColor = "rgba(0, 0, 0, 0.8)";
    } else {
      // Mixed or medium luminance - use high contrast with stronger background
      textColor = Colors.dark.whiteText;
      shadowColor = "rgba(0, 0, 0, 0.9)";
    }

    return {
      color: textColor,
      textShadowColor: shadowColor,
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 2,
    };
  }, [displayedContent]);

  // Get instruction container background based on backdrop contrast analysis
  const getInstructionContainerStyles = useMemo(() => {
    const contrastAnalysis = displayedContent?.contrastAnalysis;

    // Default background for when no contrast analysis is available
    if (!contrastAnalysis) {
      return { backgroundColor: "rgba(0, 0, 0, 0.6)" };
    }

    const { backdropDominantArea, backdropLuminance } = contrastAnalysis;

    if (
      backdropDominantArea === "light" ||
      (backdropLuminance && backdropLuminance > 0.6)
    ) {
      // Light backdrop - use light background
      return { backgroundColor: "rgba(255, 255, 255, 0.8)" };
    } else if (
      backdropDominantArea === "dark" ||
      (backdropLuminance && backdropLuminance < 0.3)
    ) {
      // Dark backdrop - use dark background
      return { backgroundColor: "rgba(0, 0, 0, 0.6)" };
    } else {
      // Mixed or medium luminance - use stronger dark background
      return { backgroundColor: "rgba(0, 0, 0, 0.8)" };
    }
  }, [displayedContent]);

  // Get button positioning based on animation direction (avoiding network logo)
  const getButtonPositionStyles = useMemo(() => {
    const hasNetworkLogo =
      !!displayedContent?.network?.logo_url ||
      !!displayedContent?.network?.name;
    if (!displayedContent?.animationPlacement) {
      // Default: buttons at bottom
      return {
        position: "absolute" as const,
        bottom: BOTTOM_INSET + 40,
        left: 0,
        right: 0,
        alignItems: "center" as const,
      };
    }

    const config = getAnimationConfig(displayedContent.animationPlacement);
    const { startSide } = config;

    // Position buttons in lower portion but avoid content animation area
    switch (startSide) {
      case "left":
        // Content comes from left, put buttons on right side but lower
        return {
          position: "absolute" as const,
          right: hasNetworkLogo
            ? SAFE_INSET * 4 + NETWORK_WIDTH
            : SAFE_INSET * 3,
          bottom: BOTTOM_INSET - 20,
          alignItems: "flex-end" as const,
        };
      case "right":
        // Content comes from right, put buttons on left side but lower
        return {
          position: "absolute" as const,
          left: SAFE_INSET * 2,
          bottom: BOTTOM_INSET - 20,
          alignItems: "flex-start" as const,
        };
      case "top":
        // Content comes from top, put buttons at bottom
        return {
          position: "absolute" as const,
          bottom: BOTTOM_INSET - 35,
          left: 0,
          right: 0,
          alignItems: "center" as const,
        };
      case "bottom":
        // Content comes from bottom, put buttons higher up but still in lower half
        return {
          position: "absolute" as const,
          bottom: height * 0.4,
          left: 0,
          right: 0,
          alignItems: "center" as const,
        };
      default:
        return {
          position: "absolute" as const,
          bottom: BOTTOM_INSET - 35,
          left: 0,
          right: 0,
          alignItems: "center" as const,
        };
    }
  }, [displayedContent, getAnimationConfig, height]);

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

    // Step 2: Fade out much later - only 1.5s before end of cycle
    // But don't set fade out timer if buttons are currently shown
    if (!showButtons) {
      fadeOutTimerRef.current = setTimeout(() => {
        // Double-check buttons aren't shown when timer fires
        if (!showButtons) {
          contentOpacity.value = withTiming(0, {
            duration: FADE_DURATION / 2, // Faster fade out (1.4s instead of 2.8s)
            easing: Easing.inOut(Easing.ease),
          });
        }
        fadeOutTimerRef.current = null;
      }, VISIBLE_DURATION - 1500); // Start fade out 1.5s before end (was 2.8s before)
    }

    // Show instructions after a delay (minimal initial state)
    const showInstructionsTimer = setTimeout(() => {
      console.log("[Screensaver] Showing instructions after delay");
      setShowInstructions(true);
    }, MINIMAL_INSTRUCTION_DELAY);

    return () => {
      clearTimeout(showInstructionsTimer);
    };
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
    buttonsOpacity,
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
  const buttonsStyle = useAnimatedStyle(() => ({
    opacity: buttonsOpacity.value,
  }));

  // Log mode changes for debugging but don't force mode changes
  useEffect(() => {
    console.log("[Screensaver] Mode state:", {
      isScreensaverActive,
      isPlaying,
      currentMode,
      shouldShow: isScreensaverActive && !isPlaying,
    });
  }, [currentMode, isScreensaverActive, isPlaying]);

  // Handle button actions
  const handleButtonPress = (action: string) => {
    console.log(`[Screensaver] Button pressed: ${action}`);

    if (!displayedContent) {
      console.warn("[Screensaver] No content available for button action");
      return;
    }

    const { _id, type } = displayedContent;
    console.log(`[Screensaver] Using content: ID=${_id}, type=${type}`);

    switch (action) {
      case "watch": {
        // Navigate to watch screen with actual content ID and type
        // Use replace if we can go back (meaning we came from another page)
        // This prevents multiple video player instances from being created
        const navigationMethod = router.canGoBack()
          ? router.replace
          : router.push;

        // For TV shows, route to first season first episode
        if (type === "tv") {
          navigationMethod(
            `/(tv)/(protected)/watch/${_id}?type=${type}&season=1&episode=1` as Href,
            {
              dangerouslySingular: true,
            },
          );
        } else {
          navigationMethod(
            `/(tv)/(protected)/watch/${_id}?type=${type}` as Href,
            {
              dangerouslySingular: true,
            },
          );
        }
        break;
      }
      case "info":
        // Navigate to media info screen with actual content ID and type
        router.replace(
          `/(tv)/(protected)/media-info/${_id}?type=${type}` as Href,
        );
        break;
      case "list":
        // Navigate to my list
        router.replace("/(tv)/(protected)/(browse)/my-list");
        break;
      case "browse": {
        // Navigate to browse with content type filter
        const browseUrl =
          type === "movie"
            ? "/(tv)/(protected)/(browse)/movies"
            : "/(tv)/(protected)/(browse)/tv-shows";
        router.replace(browseUrl as Href);
        break;
      }
      default:
        console.log(`[Screensaver] Unknown action: ${action}`);
    }
  };

  // Handle TV remote navigation for buttons
  const handleButtonNavigation = (direction: "left" | "right") => {
    if (!showButtons) return;

    const buttons = ["watch", "info", "list", "browse"];
    if (direction === "right") {
      setSelectedButtonIndex((prev) => (prev + 1) % buttons.length);
    } else {
      setSelectedButtonIndex(
        (prev) => (prev - 1 + buttons.length) % buttons.length,
      );
    }

    // Ensure buttons stay at full opacity during navigation
    buttonsOpacity.value = 1;
  };

  // Don't render if video is playing, regardless of other conditions
  if (!isScreensaverActive || isPlaying) {
    return null;
  }

  // Show error state if there's an error and no content
  if (error && !displayedContent) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Screensaver content unavailable</Text>
          <Text style={styles.errorSubtext}>Retrying automatically...</Text>
        </View>
      </View>
    );
  }

  // Don't render if no content available (but no error either)
  if (!displayedContent) {
    return null;
  }

  const { title, logo, backdrop, network, backdropBlurhash } = displayedContent;

  return (
    <View style={styles.container}>
      {/* Focusable container to capture TV remote events */}
      <Pressable
        style={styles.focusableContainer}
        focusable={true}
        onFocus={() => console.log("[Screensaver] Container focused")}
        onBlur={() => console.log("[Screensaver] Container blurred")}
      >
        <View style={styles.overlay}>
          <Reanimated.View style={[styles.backdrop, backdropStyle]}>
            <Image
              source={{ uri: backdrop }}
              placeholder={{
                uri: `data:image/png;base64,${backdropBlurhash}`,
              }}
              placeholderContentFit="cover"
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

          {/* Interactive Buttons - Positioned statically based on animation direction */}
          {showButtons && (
            <View style={getButtonPositionStyles as ViewStyle}>
              <Reanimated.View style={[styles.buttonsWrapper, buttonsStyle]}>
                {/* Row of icon+label buttons */}
                <TVFocusGuideView
                  style={styles.buttonRow}
                  trapFocusLeft
                  trapFocusRight
                >
                  {SCREENSAVER_BUTTONS.map((btn, i) => (
                    <Pressable
                      key={btn.action}
                      focusable
                      onPress={() => handleButtonPress(btn.action)}
                      onFocus={() => setSelectedButtonIndex(i)}
                      style={[
                        styles.actionButton,
                        selectedButtonIndex === i && styles.actionButtonFocused,
                      ]}
                    >
                      <Text style={styles.buttonIcon}>{btn.icon}</Text>
                      <Text
                        style={[
                          styles.buttonText,
                          selectedButtonIndex === i && styles.buttonTextFocused,
                        ]}
                      >
                        {btn.label}
                      </Text>
                    </Pressable>
                  ))}
                </TVFocusGuideView>
              </Reanimated.View>
            </View>
          )}

          {/* Rotating Instruction Text - Positioned to prevent burn-in */}
          {showInstructions && (
            <View style={getInstructionPositionStyles as ViewStyle}>
              <View
                style={[
                  styles.instructionContainer,
                  getInstructionContainerStyles,
                  {
                    alignItems: (getInstructionPositionStyles as any)
                      .alignItems,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  },
                ]}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="arrow-back-outline"
                    size={12}
                    color={getInstructionTextStyles.color}
                  />
                  <Ionicons
                    name="arrow-forward-outline"
                    size={12}
                    color={getInstructionTextStyles.color}
                    style={{ marginLeft: 2 }}
                  />
                  <Text
                    style={[
                      styles.exitText,
                      getInstructionTextStyles,
                      { marginLeft: 6 },
                    ]}
                  >
                    Left/Right to interact
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    marginTop: 2,
                  }}
                >
                  <Ionicons
                    name="arrow-up-outline"
                    size={12}
                    color={getInstructionTextStyles.color}
                  />
                  <Ionicons
                    name="arrow-down-outline"
                    size={12}
                    color={getInstructionTextStyles.color}
                    style={{ marginLeft: 2 }}
                  />
                  <Text
                    style={[
                      styles.exitText,
                      getInstructionTextStyles,
                      { marginLeft: 6 },
                    ]}
                  >
                    Up/Down to exit screensaver
                  </Text>
                </View>
              </View>
            </View>
          )}

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
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  actionButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  actionButtonFocused: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },

  backdrop: { ...StyleSheet.absoluteFillObject },

  buttonIcon: {
    fontSize: 16,
    marginBottom: 2,
    marginHorizontal: 4,
    opacity: 0.6,
  },

  buttonRow: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderRadius: 8,
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
    marginVertical: 8,
    width: "100%",
  },

  buttonText: {
    color: Colors.dark.whiteText,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },

  buttonTextFocused: {
    color: Colors.dark.whiteText,
    fontWeight: "bold",
  },

  buttonsWrapper: {
    alignItems: "center",
    flexDirection: "column",
  },

  container: {
    backgroundColor: "black",
    flex: 1,
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
    textShadowRadius: 2,
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

  exitText: {
    color: Colors.dark.whiteText,
    fontSize: 10,
    marginTop: 4,
    opacity: 0.8,
  },

  focusableContainer: {
    flex: 1,
  },

  instructionContainer: {
    justifyContent: "center",
    opacity: 0.3,
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

  overlay: { backgroundColor: "black", flex: 1 },

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
