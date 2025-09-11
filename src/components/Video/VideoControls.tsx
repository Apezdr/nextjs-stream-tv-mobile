import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { memo, useEffect, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Animated,
  TVFocusGuideView,
  Pressable,
} from "react-native";

import SeekBar from "@/src/components/Video/SeekBar";
import { Colors } from "@/src/constants/Colors";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useDimensions } from "@/src/hooks/useDimensions";

interface VideoControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onPlayPrev?: () => void;
  onPlayNext?: () => void;
  showPrevNext?: boolean;
  customButtons?: React.ReactNode;
  videoInfo?: {
    title: string;
    description?: string;
    logo?: string;
    metadata?: Record<string, string>;
  };
  overlayMode?: boolean;
  onSkipBackward?: () => void;
  onSkipForward?: () => void;
  currentTime?: number;
  duration?: number;
  onSeek?: (time: number) => void;
  onSeekBy?: (seconds: number) => void;
  showCaptionControls?: boolean;
  onToggleCaptions?: () => void;
  captionsEnabled?: boolean;
  showAudioControls?: boolean;
  onAudioTrackSelect?: (trackId: string) => void;
  audioTracks?: Array<{ id: string; label: string }>;
  selectedAudioTrack?: string;
}

// Memoized component for video playback controls
const VideoControls = memo(
  ({
    isPlaying,
    onTogglePlay,
    onPlayPrev,
    onPlayNext,
    showPrevNext = true,
    customButtons,
    videoInfo,
    overlayMode = false,
    onSkipBackward,
    onSkipForward,
    currentTime,
    duration,
    onSeek,
    onSeekBy,
    // showCaptionControls = false,
    // onToggleCaptions,
    // captionsEnabled = false,
    // showAudioControls = false,
    // onAudioTrackSelect,
    // audioTracks,
    // selectedAudioTrack,
  }: VideoControlsProps) => {
    // Get dynamic dimensions
    const { window } = useDimensions();

    // Get enhanced remote activity state from context
    const {
      isRemoteActive,
      // isUserInteracting,
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
    } = useRemoteActivity();

    // State for continuous seeking
    const [isSeeking, setIsSeeking] = useState(false);
    const seekIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const seekDirectionRef = useRef<"backward" | "forward" | null>(null);

    // Create animated value for opacity
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // Update animation based on remote activity
    useEffect(() => {
      const shouldShow = isRemoteActive || !isPlaying;
      Animated.timing(fadeAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, [isRemoteActive, isPlaying, fadeAnim]);

    // Wrapper function to reset activity timer when buttons are pressed
    const handleButtonPress = useCallback(
      (callback: () => void) => {
        return () => {
          resetActivityTimer();
          callback();
        };
      },
      [resetActivityTimer],
    );

    // Continuous seeking functionality
    const startContinuousSeeking = useCallback(
      (direction: "backward" | "forward") => {
        if (
          isSeeking ||
          !onSeek ||
          currentTime === undefined ||
          duration === undefined
        )
          return;

        console.log("[VideoControls] Starting continuous seeking:", direction);
        setIsSeeking(true);
        seekDirectionRef.current = direction;
        startContinuousActivity();

        // Seek immediately
        const seekAmount = direction === "backward" ? -2 : 2; // 2 seconds per tick
        const newTime = Math.max(
          0,
          Math.min(duration, currentTime + seekAmount),
        );
        onSeek(newTime);

        // Continue seeking while held
        seekIntervalRef.current = setInterval(() => {
          if (currentTime !== undefined && duration !== undefined) {
            const seekAmount = direction === "backward" ? -2 : 2;
            const newTime = Math.max(
              0,
              Math.min(duration, currentTime + seekAmount),
            );
            onSeek(newTime);
          }
        }, 200); // Seek every 200ms
      },
      [isSeeking, onSeek, currentTime, duration, startContinuousActivity],
    );

    const stopContinuousSeeking = useCallback(() => {
      if (!isSeeking) return;

      console.log("[VideoControls] Stopping continuous seeking");
      setIsSeeking(false);
      seekDirectionRef.current = null;
      stopContinuousActivity();

      if (seekIntervalRef.current) {
        clearInterval(seekIntervalRef.current);
        seekIntervalRef.current = null;
      }
    }, [isSeeking, stopContinuousActivity]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (seekIntervalRef.current) {
          clearInterval(seekIntervalRef.current);
        }
      };
    }, []);

    // Default skip functionality (single press)
    const handleSkipBackward = useCallback(() => {
      if (onSkipBackward) {
        onSkipBackward();
      } else if (onSeek && currentTime !== undefined) {
        const newTime = Math.max(0, currentTime - 15);
        onSeek(newTime);
      }
    }, [onSkipBackward, onSeek, currentTime]);

    const handleSkipForward = useCallback(() => {
      if (onSkipForward) {
        onSkipForward();
      } else if (
        onSeek &&
        currentTime !== undefined &&
        duration !== undefined
      ) {
        const newTime = Math.min(duration, currentTime + 15);
        onSeek(newTime);
      }
    }, [onSkipForward, onSeek, currentTime, duration]);

    // Handle seek by relative amount (for SeekBar quick skip)
    const handleSeekBy = useCallback(
      (seconds: number) => {
        if (onSeekBy) {
          onSeekBy(seconds);
        }
      },
      [onSeekBy],
    );

    const controlsContainerStyle = overlayMode
      ? [styles.controls, styles.overlayControls]
      : styles.controls;

    return (
      <Animated.View
        style={[
          controlsContainerStyle,
          {
            opacity: fadeAnim,
            maxWidth: window.width,
          },
        ]}
      >
        {/* 1. Top Section */}
        <View style={styles.topSection}>
          <View style={styles.topLeftSection}>{customButtons}</View>
          <View style={styles.topRightSection}>
            {/* Future: Content rating, quality indicators, etc. */}
          </View>
        </View>

        {/* 2. Middle Section - Primary Controls */}
        <View style={styles.middleSection}>
          <View style={styles.logoContainer}>
            {overlayMode && videoInfo?.logo && (
              <Image
                source={{ uri: videoInfo.logo }}
                style={styles.logo}
                contentFit="contain"
              />
            )}
          </View>

          <TVFocusGuideView autoFocus>
            <View style={styles.primaryControls}>
              {/* Skip Backward Button with Hold Detection */}
              <Pressable
                style={({ focused, pressed }) => [
                  styles.controlButton,
                  styles.skipButton,
                  focused && styles.controlButtonFocused,
                  pressed && styles.controlButtonPressed,
                  isSeeking &&
                    seekDirectionRef.current === "backward" &&
                    styles.controlButtonSeeking,
                ]}
                onPress={handleButtonPress(handleSkipBackward)}
                onLongPress={() => startContinuousSeeking("backward")}
                onPressOut={stopContinuousSeeking}
                delayLongPress={400} // Start seeking after 400ms hold
                isTVSelectable
              >
                <Ionicons
                  name="reload-outline"
                  size={30}
                  color={Colors.dark.videoControlSecondaryText}
                  style={{ transform: [{ scaleX: -1 }] }}
                />
                <Text style={styles.skipButtonLabel}>
                  {isSeeking && seekDirectionRef.current === "backward"
                    ? "<<"
                    : "15"}
                </Text>
              </Pressable>

              {/* Play/Pause Button */}
              <Pressable
                style={({ focused, pressed }) => [
                  styles.controlButton,
                  styles.playPauseButton,
                  focused && styles.controlButtonFocused,
                  pressed && styles.controlButtonPressed,
                ]}
                onPress={handleButtonPress(onTogglePlay)}
                isTVSelectable
                hasTVPreferredFocus={true}
              >
                {isPlaying ? (
                  <Ionicons
                    name="pause"
                    size={50}
                    color={Colors.dark.videoControlText}
                  />
                ) : (
                  <Ionicons
                    name="play"
                    size={50}
                    color={Colors.dark.videoControlText}
                  />
                )}
              </Pressable>

              {/* Skip Forward Button with Hold Detection */}
              <Pressable
                style={({ focused, pressed }) => [
                  styles.controlButton,
                  styles.skipButton,
                  focused && styles.controlButtonFocused,
                  pressed && styles.controlButtonPressed,
                  isSeeking &&
                    seekDirectionRef.current === "forward" &&
                    styles.controlButtonSeeking,
                ]}
                onPress={handleButtonPress(handleSkipForward)}
                onLongPress={() => startContinuousSeeking("forward")}
                onPressOut={stopContinuousSeeking}
                delayLongPress={400}
                isTVSelectable
              >
                <Ionicons
                  name="reload-outline"
                  size={30}
                  color={Colors.dark.videoControlSecondaryText}
                  style={{ transform: [{ translateX: 2 }] }}
                />
                <Text style={styles.skipButtonLabel}>
                  {isSeeking && seekDirectionRef.current === "forward"
                    ? ">>"
                    : "15"}
                </Text>
              </Pressable>
            </View>
          </TVFocusGuideView>
        </View>

        {/* 3. Bottom Info Section */}
        <View style={styles.bottomSection}>
          {overlayMode && videoInfo && (
            <View style={styles.videoInfoSection}>
              {videoInfo.description && (
                <Text style={styles.videoDescription}>
                  {videoInfo.description}
                </Text>
              )}
              <Text style={styles.videoTitle}>{videoInfo.title}</Text>
              {videoInfo?.metadata?.overview && (
                <Text style={styles.videoOverview}>
                  {videoInfo?.metadata?.overview}
                </Text>
              )}
            </View>
          )}

          <View style={styles.navigationSection}>
            {showPrevNext && (
              <>
                {onPlayPrev && (
                  <Pressable
                    style={({ focused, pressed }) => [
                      styles.controlButton,
                      focused && styles.controlButtonFocused,
                      pressed && styles.controlButtonPressed,
                    ]}
                    onPress={handleButtonPress(onPlayPrev)}
                    isTVSelectable
                  >
                    <Text style={styles.controlButtonText}>Previous</Text>
                  </Pressable>
                )}

                {onPlayNext && (
                  <Pressable
                    style={({ focused, pressed }) => [
                      styles.controlButton,
                      focused && styles.controlButtonFocused,
                      pressed && styles.controlButtonPressed,
                    ]}
                    onPress={handleButtonPress(onPlayNext)}
                    isTVSelectable
                  >
                    <Text style={styles.controlButtonText}>Next</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>

        {/* 4. Seek Bar Section */}
        <View style={styles.seekBarSection}>
          {currentTime !== undefined && duration !== undefined && onSeek && (
            <SeekBar
              currentTime={currentTime}
              duration={duration}
              onSeek={onSeek}
              onSeekBy={handleSeekBy}
              onTogglePlay={onTogglePlay}
              isPlaying={isPlaying}
              onStartSeeking={startContinuousActivity}
              onStopSeeking={stopContinuousActivity}
            />
          )}
        </View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  bottomSection: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 40,
    paddingHorizontal: 40,
    width: "100%",
  },
  controlButton: {
    alignItems: "center",
    backgroundColor: Colors.dark.videoControlBackground,
    borderColor: Colors.dark.videoControlBorderTransparent,
    borderRadius: 50,
    borderWidth: 2,
    minWidth: 60,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  controlButtonFocused: {
    backgroundColor: Colors.dark.videoControlBackgroundFocused,
  },

  controlButtonPressed: {
    backgroundColor: Colors.dark.videoControlBackgroundPressed,
  },

  controlButtonSeeking: {
    backgroundColor: Colors.dark.videoControlBackgroundSeeking,
    borderColor: Colors.dark.videoControlBorderSeeking,
  },

  controlButtonText: {
    color: Colors.dark.videoControlSecondaryText,
  },

  controls: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: "28%",
    width: "100%",
  },

  logo: {
    flex: 1,
    height: undefined,
    marginBottom: 80,
    width: undefined,
  },

  logoContainer: {
    height: 200,
    left: "5%",
    overflow: "hidden",
    position: "absolute",
    top: "27%",
    width: 200,
  },

  middleSection: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
  },

  navigationSection: {
    alignItems: "center",
    flexDirection: "row",
    gap: 20,
  },

  overlayControls: {
    backgroundColor: Colors.dark.videoOverlayBackground,
    bottom: 0,
    flexDirection: "column",
    left: 0,
    marginTop: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },

  playPauseButton: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },

  primaryControls: {
    alignItems: "center",
    flexDirection: "row",
    gap: 40,
    justifyContent: "center",
  },

  seekBarSection: {
    marginBottom: 20,
    paddingHorizontal: 40,
    width: "100%",
  },

  skipButton: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  skipButtonLabel: {
    bottom: 25,
    color: Colors.dark.videoControlText,
    fontSize: 8,
    fontWeight: "600",
    left: "90%",
    position: "absolute",
  },

  topLeftSection: {
    alignItems: "center",
    flexDirection: "row",
  },

  topRightSection: {
    alignItems: "center",
    flexDirection: "row",
  },

  topSection: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 40,
    paddingTop: 40,
    width: "100%",
  },

  videoDescription: {
    color: Colors.dark.videoDescriptionText,
    fontSize: 18,
    textShadowColor: Colors.dark.videoTextShadow,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  videoInfoSection: {
    alignSelf: "flex-start",
    maxWidth: "70%",
  },

  videoOverview: {
    color: Colors.dark.videoOverviewText,
    fontSize: 11,
    textShadowColor: Colors.dark.videoTextShadow,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  videoTitle: {
    color: Colors.dark.videoTitleText,
    fontSize: 32,
    fontWeight: "bold",
    textShadowColor: Colors.dark.videoTextShadow,
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});

export default VideoControls;
