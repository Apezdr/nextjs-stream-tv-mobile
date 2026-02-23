// src/components/Video/SeekBar.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useState, useRef, useEffect, useImperativeHandle } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  useTVEventHandler,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
} from "react-native-reanimated";

import { useRemoteActivity } from "@/src/context/RemoteActivityContext";

export type PlayerState =
  | "normal" // Normal playback
  | "buffering" // Video buffering/loading
  | "watch-history-loading" // Loading watch history from server
  | "watch-history-applying" // Applying watch history to player
  | "seeking" // User actively seeking (handled internally)
  | "stalled" // Network/playback stalled
  | "error" // Error state
  | "codec-loading"; // Audio/video codec switching

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSeekBy: (seconds: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: () => void;
  onTogglePlay?: () => void;
  isPlaying?: boolean;
  onStartSeeking?: () => void;
  onStopSeeking?: () => void;
  hasTVPreferredFocus?: boolean;
  playerState?: PlayerState;
  stateMessage?: string;
  stateProgress?: number; // 0-1 for states that have progress
}

export interface SeekBarRef {
  focus: () => void;
}

// Skip amount in seconds for quick navigation
const SKIP_SECONDS = 10;

const formatTime = (seconds: number): string => {
  if (isNaN(seconds)) return "00:00";

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const SeekBar = React.forwardRef<SeekBarRef, SeekBarProps>(
  (
    {
      currentTime,
      duration,
      onSeek,
      onSeekBy,
      onSeekStart,
      onSeekEnd,
      onTogglePlay,
      isPlaying,
      onStartSeeking,
      onStopSeeking,
      hasTVPreferredFocus = true,
      playerState = "normal",
      stateMessage,
      stateProgress,
    },
    ref: React.ForwardedRef<SeekBarRef>,
  ) => {
    const {
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
    } = useRemoteActivity();
    const [isFocused, setIsFocused] = useState(false);
    const pressableRef = useRef<View>(null);

    // Expose focus method to parent components
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          if (pressableRef.current) {
            pressableRef.current.focus();
          }
        },
      }),
      [],
    );
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekTime, setSeekTime] = useState(currentTime);
    const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const scrubIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [isHolding, setIsHolding] = useState(false);
    const seekTimeRef = useRef(currentTime);

    const [scrubRate, setScrubRate] = useState(1);
    const [scrubDirection, setScrubDirection] = useState<
      "left" | "right" | null
    >(null);
    const [skipDirection, setSkipDirection] = useState<"left" | "right" | null>(
      null,
    );
    // track when scrub began
    const scrubStartTimeRef = useRef<number | null>(null);
    const skipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // acceleration settings:
    const INTERVAL_MS = 100; // tick every 100ms
    const BASE_RATE = 2; // start at 2× real-time (sec/sec)
    const ACCELERATION_RATE = 38; // +38 sec/sec²
    const MAX_RATE = 620; // cap at 620× real-time

    // Animation values for loading states
    const shimmerTranslateX = useSharedValue(-100);
    const loadingProgress = useSharedValue(0);

    // Setup animations based on player state
    useEffect(() => {
      const isLoadingState =
        playerState === "buffering" ||
        playerState === "watch-history-loading" ||
        playerState === "watch-history-applying" ||
        playerState === "stalled" ||
        playerState === "codec-loading";

      if (isLoadingState) {
        // Simple sweeping shimmer from left to right using percentage
        shimmerTranslateX.value = withRepeat(
          withSequence(
            withTiming(-100, { duration: 0 }), // Start off-screen left
            withTiming(100, { duration: 1500 }), // Sweep to off-screen right
          ),
          -1,
          false,
        );

        // Loading progress for states that have progress
        if (
          playerState === "watch-history-applying" &&
          stateProgress !== undefined
        ) {
          loadingProgress.value = withTiming(stateProgress, { duration: 300 });
        } else {
          // Indeterminate: gentle breathing animation
          loadingProgress.value = withRepeat(
            withSequence(
              withTiming(0.6, { duration: 1000 }),
              withTiming(0.3, { duration: 1000 }),
            ),
            -1,
            true,
          );
        }
      } else {
        shimmerTranslateX.value = -100;
        loadingProgress.value = 0;
      }
    }, [playerState, stateProgress, shimmerTranslateX, loadingProgress]);

    // Update seek time when currentTime changes (but not when actively seeking)
    useEffect(() => {
      if (!isSeeking) {
        setSeekTime(currentTime);
        seekTimeRef.current = currentTime;
      }
    }, [currentTime, isSeeking]);

    // Start scrub mode
    const startScrub = (direction: "left" | "right") => {
      if (isPlaying) onTogglePlay?.();
      scrubStartTimeRef.current = Date.now();
      setIsHolding(true);
      setIsSeeking(true);
      setScrubDirection(direction);
      onSeekStart?.();
      onStartSeeking?.();
      startContinuousActivity();

      // Start continuous seeking using ref values
      scrubIntervalRef.current = setInterval(() => {
        if (scrubStartTimeRef.current == null) return;
        const elapsedSec = (Date.now() - scrubStartTimeRef.current) / 1000;
        const rate = Math.min(
          BASE_RATE + ACCELERATION_RATE * elapsedSec,
          MAX_RATE,
        );

        setScrubRate(rate);

        const jump = rate * (INTERVAL_MS / 1000);
        seekTimeRef.current =
          direction === "left"
            ? Math.max(0, seekTimeRef.current - jump)
            : Math.min(duration, seekTimeRef.current + jump);
        setSeekTime(seekTimeRef.current);
      }, INTERVAL_MS);
    };

    // Stop scrub mode
    const stopScrub = () => {
      scrubStartTimeRef.current = null;
      setIsHolding(false);
      setScrubRate(1);
      setScrubDirection(null);

      if (scrubIntervalRef.current) {
        clearInterval(scrubIntervalRef.current);
        scrubIntervalRef.current = null;
      }

      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current);
        holdTimeoutRef.current = null;
      }

      if (isSeeking) {
        // Apply the final seek position
        onSeek(seekTimeRef.current);
        setIsSeeking(false);
        onSeekEnd?.();
        onStopSeeking?.();
        stopContinuousActivity();
      }
    };

    // Handle quick skip using dedicated seekBy function
    const performSkip = (direction: "left" | "right") => {
      const skipAmount = direction === "left" ? -SKIP_SECONDS : SKIP_SECONDS;

      // Show skip direction briefly
      setSkipDirection(direction);

      // Clear skip direction after a short delay
      if (skipTimeoutRef.current) {
        clearTimeout(skipTimeoutRef.current);
      }
      skipTimeoutRef.current = setTimeout(() => {
        setSkipDirection(null);
      }, 500); // Show for 500ms

      onSeekBy(skipAmount);
    };

    // Handle TV remote events when focused
    useTVEventHandler((evt) => {
      if (!isFocused) return;
      resetActivityTimer();

      const { eventType, eventKeyAction } = evt;

      // ---- SCRUB on long-press ----
      if (eventType === "longLeft" || eventType === "longRight") {
        const dir = eventType === "longLeft" ? "left" : "right";

        if (eventKeyAction === 0) {
          // hold start
          startScrub(dir);
        } else {
          // hold end
          stopScrub();
        }
        return;
      }

      // ---- QUICK skip on tap ----
      if (
        (eventType === "left" || eventType === "right") &&
        eventKeyAction === 1
      ) {
        performSkip(eventType);
      }
    });

    // Clean up timers on unmount
    useEffect(() => {
      return () => {
        if (holdTimeoutRef.current) {
          clearTimeout(holdTimeoutRef.current);
        }
        if (scrubIntervalRef.current) {
          clearInterval(scrubIntervalRef.current);
        }
        if (skipTimeoutRef.current) {
          clearTimeout(skipTimeoutRef.current);
        }
      };
    }, []);

    const progressPercentage =
      duration > 0 ? (currentTime / duration) * 100 : 0;
    const seekProgressPercentage =
      duration > 0 ? (seekTime / duration) * 100 : 0;

    // Shimmer highlight style - moves independently using percentage
    const animatedShimmerStyle = useAnimatedStyle(() => {
      return {
        transform: [{ translateX: `${shimmerTranslateX.value}%` }],
      };
    }, [shimmerTranslateX]);

    const animatedLoadingProgressStyle = useAnimatedStyle(() => {
      return {
        width: `${loadingProgress.value * 100}%`,
      };
    }, [loadingProgress]);

    // Get state-specific icon and message
    const getStateIcon = () => {
      if (isSeeking) {
        return (
          <Ionicons
            name={scrubDirection === "left" ? "play-back" : "play-forward"}
            size={20}
            color={"#FFFFFF"}
          />
        );
      }

      if (skipDirection) {
        return (
          <Ionicons
            name="reload-outline"
            size={20}
            color={"#FFFFFF"}
            style={
              skipDirection === "left"
                ? { transform: [{ scaleX: -1 }] }
                : undefined
            }
          />
        );
      }

      switch (playerState) {
        case "buffering":
        case "stalled":
          return (
            <Ionicons name="hourglass-outline" size={20} color={"#FFFFFF"} />
          );
        case "watch-history-loading":
          return (
            <Ionicons name="download-outline" size={20} color={"#FFFFFF"} />
          );
        case "watch-history-applying":
          return (
            <Ionicons name="refresh-outline" size={20} color={"#FFFFFF"} />
          );
        case "codec-loading":
          return (
            <Ionicons name="settings-outline" size={20} color={"#FFFFFF"} />
          );
        case "error":
          return (
            <Ionicons name="warning-outline" size={20} color={"#FF6B6B"} />
          );
        default:
          return (
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={20}
              color={"#FFFFFF"}
            />
          );
      }
    };

    const getDisplayMessage = () => {
      if (stateMessage) return stateMessage;

      switch (playerState) {
        case "buffering":
          return "Buffering...";
        case "watch-history-loading":
          return "Loading playback position...";
        case "watch-history-applying":
          return "Restoring your position...";
        case "stalled":
          return "Connection stalled...";
        case "codec-loading":
          return "Loading codec...";
        case "error":
          return "Playback error";
        default:
          return null;
      }
    };

    const isLoadingState =
      playerState === "buffering" ||
      playerState === "watch-history-loading" ||
      playerState === "watch-history-applying" ||
      playerState === "stalled" ||
      playerState === "codec-loading";

    return (
      <Pressable
        ref={pressableRef}
        style={styles.container}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          stopScrub(); // Stop any ongoing scrub when losing focus
        }}
        onPress={() => {
          if (onTogglePlay) {
            onTogglePlay();
          }
        }}
        isTVSelectable={true}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        {/* Instructions when focused - positioned above seek bar */}
        {isFocused && (
          <View style={styles.instructionsContainer}>
            <Text style={styles.instructionsText}>
              {isHolding
                ? "Scrubbing..."
                : `← → Skip ${SKIP_SECONDS}s • Hold to scrub`}
              {scrubRate !== 1 ? `${Math.round(scrubRate)}x` : null}
            </Text>
          </View>
        )}

        {/* Loading state message - positioned above seek bar when not focused */}
        {!isFocused && isLoadingState && getDisplayMessage() && (
          <View style={styles.messageContainer}>
            <Text style={styles.messageText}>{getDisplayMessage()}</Text>
          </View>
        )}

        {/* Main content container with icon and seek bar */}
        <View style={styles.mainContentContainer}>
          {/* State Icon - now uses dynamic state management */}
          <View style={styles.stateIconContainer} focusable={false}>
            {getStateIcon()}
            {/* Rate/skip text overlay */}
            {isSeeking && scrubRate !== 1 && (
              <Text
                style={[
                  styles.scrubRateText,
                  isFocused && styles.scrubRateTextFocused,
                ]}
              >
                {Math.round(scrubRate)}x
              </Text>
            )}
            {skipDirection && (
              <Text
                style={[
                  styles.scrubRateText,
                  isFocused && styles.scrubRateTextFocused,
                ]}
              >
                {SKIP_SECONDS}s
              </Text>
            )}
          </View>

          {/* Seek bar background */}
          <View style={styles.seekBarContainer}>
            <View style={styles.seekBarBackground} />

            {/* Current progress */}
            <View
              style={[
                styles.seekBarProgress,
                { width: `${progressPercentage}%` },
              ]}
            />

            {/* Seek preview (when seeking) */}
            {isSeeking && (
              <View
                style={[
                  styles.seekBarPreview,
                  { width: `${seekProgressPercentage}%` },
                ]}
              />
            )}

            {/* Loading overlay for loading states */}
            {isLoadingState && (
              <View style={styles.loadingOverlay}>
                {/* Base loading bar with breathing animation */}
                <Animated.View
                  style={[
                    styles.loadingProgressBar,
                    animatedLoadingProgressStyle,
                  ]}
                />

                {/* Shimmer highlight that sweeps across */}
                <Animated.View
                  style={[styles.shimmerHighlight, animatedShimmerStyle]}
                />
              </View>
            )}

            {/* Playback position dot - only show when not loading and has valid duration */}
            {!isLoadingState && duration > 0 && (
              <View
                style={[
                  styles.playbackDot,
                  { left: `${progressPercentage}%` },
                  isFocused && styles.playbackDotFocused,
                ]}
              />
            )}

            {/* Seek position dot (when seeking) - only show when not loading */}
            {!isLoadingState && isSeeking && duration > 0 && (
              <View
                style={[styles.seekDot, { left: `${seekProgressPercentage}%` }]}
              />
            )}
          </View>
        </View>

        {/* Time display - always reserve space, show placeholders only during initial loading */}
        <View style={styles.timeContainer}>
          <Text style={[styles.timeText, isFocused && styles.timeTextFocused]}>
            {duration <= 0 && !isSeeking
              ? "--:--"
              : formatTime(isSeeking ? seekTime : currentTime)}
          </Text>
          <Text style={[styles.timeText, isFocused && styles.timeTextFocused]}>
            {duration <= 0 ? "--:--" : formatTime(duration)}
          </Text>
        </View>
      </Pressable>
    );
  },
);

SeekBar.displayName = "SeekBar";

const styles = StyleSheet.create({
  container: {
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 25,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },

  instructionsContainer: {
    alignItems: "center",
    marginBottom: 8,
    position: "absolute",
    top: 16, // Position below the seek bar
    left: "42%",
  },

  instructionsText: {
    color: "#CCCCCC",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  loadingOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 3,
    bottom: 0,
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    top: 0,
  },

  loadingProgressBar: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 3,
    height: "100%",
  },

  mainContentContainer: {
    alignItems: "center",
    flexDirection: "row",
    marginBottom: 7,
  },

  messageContainer: {
    alignItems: "center",
    marginBottom: 8,
    position: "absolute",
    top: 16, // Position above the seek bar
    left: "50%",
    transform: [{ translateX: -50 }], // Center horizontally
  },

  messageText: {
    color: "#CCCCCC",
    fontSize: 12,
    fontWeight: "500",
    textAlign: "center",
  },

  playbackDot: {
    position: "absolute",
    top: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
    marginLeft: -5, // Center the dot
    zIndex: 2,
  },

  playbackDotFocused: {
    backgroundColor: "#FFFFFF",
    borderColor: "#007AFF",
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    marginLeft: -7,
    top: -4,
    width: 14, // Blue focus color
  },

  scrubRateText: {
    color: "#CCCCCC",
    fontSize: 8,
    fontWeight: "600",
    marginTop: 2,
    position: "absolute",
    top: 16,
  },

  scrubRateTextFocused: {
    color: "#FFFFFF",
  },

  seekBarBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 8,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },

  seekBarContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 3,
    flex: 1,
    height: 6,
    position: "relative",
  },

  seekBarPreview: {
    height: "100%",
    backgroundColor: "#FFD700", // Gold color for seek preview
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0.8,
  },

  seekBarProgress: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    height: "100%",
    left: 0,
    position: "absolute",
    top: 0,
  },

  seekDot: {
    position: "absolute",
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#FFD700", // Gold color for seek dot
    marginLeft: -7, // Center the dot
    zIndex: 3,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },

  shimmerHighlight: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: "30%", // Width of the shimmer highlight
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 3,
  },

  stateIconContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    width: 32,
  },

  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },

  timeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },

  timeTextFocused: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
});

export default SeekBar;
