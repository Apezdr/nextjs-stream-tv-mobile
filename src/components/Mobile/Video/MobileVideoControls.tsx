import { Ionicons } from "@expo/vector-icons";
import { useEvent } from "expo";
import { VideoPlayer } from "expo-video";
import { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import SubtitlePlayer from "../../Video/SubtitlePlayer";

import MobileCaptionControls, {
  DEFAULT_SUBTITLE_STYLE,
  DEFAULT_SUBTITLE_BACKGROUND,
  SubtitleStyle,
  SubtitleBackgroundOption,
} from "./MobileCaptionControls";

import { TVDeviceEpisode } from "@/src/data/types/content.types";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useSubtitlePreferencesStore } from "@/src/stores/subtitlePreferencesStore";

interface MobileVideoControlsProps {
  player: VideoPlayer;
  videoInfo?: {
    type?: "tv" | "movie" | null;
    showTitle?: string;
    title: string;
    description?: string;
    logo?: string;
    captionURLs?: Record<
      string,
      {
        srcLang: string;
        url: string;
        lastModified: string;
        sourceServerId: string;
      }
    >;
    backdrop?: string;
  };
  onExitWatchMode?: () => void;
  onInfoPress?: () => void;
  episodes?: TVDeviceEpisode[];
  currentEpisodeNumber?: number;
  onEpisodeSelect?: (episode: TVDeviceEpisode) => void;
  isLoadingEpisodes?: boolean;
  isEpisodeSwitching?: boolean;
  episodeSwitchError?: string | null;
  showCaptionControls?: boolean; // New prop to control caption visibility
}

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

const MobileVideoControls = memo(
  ({
    player,
    videoInfo,
    onExitWatchMode,
    onInfoPress,
    episodes: _episodes,
    currentEpisodeNumber: _currentEpisodeNumber,
    onEpisodeSelect: _onEpisodeSelect,
    isLoadingEpisodes: _isLoadingEpisodes = false,
    isEpisodeSwitching = false,
    episodeSwitchError = null,
    showCaptionControls = false,
  }: MobileVideoControlsProps) => {
    // Get dynamic window dimensions that will update with orientation changes
    const { window } = useDimensions();
    const windowWidth = window.width;
    const insets = useSafeAreaInsets();

    // Use expo-video's useEvent hook for player state
    const { isPlaying } = useEvent(player, "playingChange", {
      isPlaying: player?.playing || false,
    });
    const { currentTime } = useEvent(player, "timeUpdate", {
      currentTime: player?.currentTime || 0,
      currentLiveTimestamp: 0,
      currentOffsetFromLive: 0,
      bufferedPosition: 0,
    });
    // Status tracking (unused but kept for potential future use)
    useEvent(player, "statusChange", {
      status: player?.status || "idle",
    });

    // Local state
    const [duration, setDuration] = useState(0);
    const [isControlsVisible, setIsControlsVisible] = useState(true);
    const [isSeeking, setIsSeeking] = useState(false);
    const [seekTime, setSeekTime] = useState(currentTime);
    const [isDoubleTapSeeking, setIsDoubleTapSeeking] = useState(false);
    const [skipFeedback, setSkipFeedback] = useState<{
      seconds: number;
      visible: boolean;
    }>({ seconds: 0, visible: false });
    const [totalSkipAmount, setTotalSkipAmount] = useState(0);

    // Subtitle preferences (persisted)
    const subtitlesEnabled = useSubtitlePreferencesStore((s) => s.subtitlesEnabled);
    const preferredLanguage = useSubtitlePreferencesStore((s) => s.preferredLanguage);
    const setSubtitlesEnabled = useSubtitlePreferencesStore((s) => s.setSubtitlesEnabled);
    const setPreferredLanguage = useSubtitlePreferencesStore((s) => s.setPreferredLanguage);

    // Caption selection state - use undefined to distinguish from user selecting "Off" (null)
    const [selectedCaptionLanguage, setSelectedCaptionLanguageRaw] = useState<
      string | null | undefined
    >(undefined);

    // Wrap setter to persist preference changes
    const setSelectedCaptionLanguage = useCallback(
      (language: string | null | undefined) => {
        setSelectedCaptionLanguageRaw(language);
        if (language === null) {
          // User explicitly turned subtitles off
          setSubtitlesEnabled(false);
        } else if (typeof language === "string") {
          // User selected a language
          setSubtitlesEnabled(true);
          setPreferredLanguage(language);
        }
      },
      [setSubtitlesEnabled, setPreferredLanguage],
    );

    // Subtitle style state
    const [selectedSubtitleStyle, setSelectedSubtitleStyle] =
      useState<SubtitleStyle>(DEFAULT_SUBTITLE_STYLE);

    // Subtitle background state
    const [selectedSubtitleBackground, setSelectedSubtitleBackground] =
      useState<SubtitleBackgroundOption>(DEFAULT_SUBTITLE_BACKGROUND);

    // Animation refs
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const topControlsOpacity = useRef(new Animated.Value(1)).current;
    const centerControlsOpacity = useRef(new Animated.Value(1)).current;
    const titleOpacity = useRef(new Animated.Value(1)).current;
    const skipFeedbackOpacity = useRef(new Animated.Value(0)).current;
    const hideControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const hideSeekOverlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const skipFeedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Seek bar layout measurement - including Y position for tap protection
    const seekBarLayoutRef = useRef<{
      x: number;
      y: number;
      width: number;
      height: number;
    }>({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });

    // Handle seek bar layout measurement
    const handleSeekBarLayout = useCallback(
      (event: {
        nativeEvent: {
          layout: { x: number; y: number; width: number; height: number };
        };
      }) => {
        const { x, y, width, height } = event.nativeEvent.layout;
        seekBarLayoutRef.current = { x, y, width, height };
      },
      [],
    );

    // Check if tap is in seek bar area
    const isInSeekBar = useCallback((e: { absoluteY: number }) => {
      const { y, height } = seekBarLayoutRef.current;
      return e.absoluteY >= y && e.absoluteY <= y + height + 20; // Add padding for touch area
    }, []);

    // Update duration when player status changes
    useEffect(() => {
      if (player) {
        try {
          const playerDuration = player.duration;
          if (playerDuration && playerDuration > 0) {
            setDuration(playerDuration);
            cachedDurationRef.current = playerDuration;
          }
        } catch {
          // Silently handle duration access errors
        }
      }

      // Duration is available directly from player, not from status event
    }, [player, currentTime]);

    // Update seek time when currentTime changes (but not when actively seeking)
    useEffect(() => {
      if (!isSeeking) {
        setSeekTime(currentTime);
      }
    }, [currentTime, isSeeking]);

    // Auto-hide controls after 5 seconds of inactivity (when playing)
    const resetHideTimer = useCallback(() => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current);
      }

      if (isPlaying && isControlsVisible) {
        hideControlsTimeoutRef.current = setTimeout(() => {
          setIsControlsVisible(false);
        }, 5000);
      }
    }, [isPlaying, isControlsVisible]);

    // Show controls and reset hide timer
    const showControls = useCallback(() => {
      setIsControlsVisible(true);
      resetHideTimer();

      // Hide double-tap seek when showing full controls
      if (isDoubleTapSeeking) {
        if (hideSeekOverlayTimeoutRef.current) {
          clearTimeout(hideSeekOverlayTimeoutRef.current);
        }
        if (skipFeedbackTimeoutRef.current) {
          clearTimeout(skipFeedbackTimeoutRef.current);
        }
        setIsDoubleTapSeeking(false);
        setSkipFeedback({ seconds: 0, visible: false });
        setTotalSkipAmount(0);
      }
    }, [resetHideTimer, isDoubleTapSeeking]);

    // Controls visibility animation
    useEffect(() => {
      Animated.timing(fadeAnim, {
        toValue: isControlsVisible || isDoubleTapSeeking ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Animate individual control sections
      const shouldShowNonSeekControls =
        isControlsVisible && !isDoubleTapSeeking;

      Animated.parallel([
        Animated.timing(topControlsOpacity, {
          toValue: shouldShowNonSeekControls ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(centerControlsOpacity, {
          toValue: shouldShowNonSeekControls ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: shouldShowNonSeekControls ? 1 : 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, [
      isControlsVisible,
      isDoubleTapSeeking,
      fadeAnim,
      topControlsOpacity,
      centerControlsOpacity,
      titleOpacity,
    ]);

    // Reset hide timer when playing state changes
    useEffect(() => {
      if (isPlaying) {
        resetHideTimer();
      } else {
        // When paused, just clear the auto-hide timer but don't force show controls
        if (hideControlsTimeoutRef.current) {
          clearTimeout(hideControlsTimeoutRef.current);
        }
      }
    }, [isPlaying, resetHideTimer]);

    // Show controls when initially paused (only on first load)
    useEffect(() => {
      if (!isPlaying && duration === 0) {
        setIsControlsVisible(true);
      }
    }, [isPlaying, duration]);

    // Cleanup timeouts on unmount
    useEffect(() => {
      return () => {
        if (hideControlsTimeoutRef.current) {
          clearTimeout(hideControlsTimeoutRef.current);
        }
        if (hideSeekOverlayTimeoutRef.current) {
          clearTimeout(hideSeekOverlayTimeoutRef.current);
        }
        if (skipFeedbackTimeoutRef.current) {
          clearTimeout(skipFeedbackTimeoutRef.current);
        }
      };
    }, []);

    // Initialize caption language from persisted preferences
    useEffect(() => {
      if (videoInfo?.captionURLs && selectedCaptionLanguage === undefined) {
        // If user previously turned subtitles off, respect that
        if (!subtitlesEnabled) {
          setSelectedCaptionLanguageRaw(null);
          return;
        }

        const availableLanguages = Object.keys(videoInfo.captionURLs);

        // Try the user's preferred language first
        if (preferredLanguage && availableLanguages.includes(preferredLanguage)) {
          setSelectedCaptionLanguageRaw(preferredLanguage);
        } else {
          // Fallback: try to find English by name
          if (availableLanguages.includes("English")) {
            setSelectedCaptionLanguageRaw("English");
          } else {
            // Then try to find English by srcLang code
            const englishLang = availableLanguages.find(
              (lang) =>
                videoInfo.captionURLs &&
                (videoInfo.captionURLs[lang].srcLang === "eng" ||
                  videoInfo.captionURLs[lang].srcLang === "en"),
            );

            if (englishLang) {
              setSelectedCaptionLanguageRaw(englishLang);
            } else if (availableLanguages.length > 0) {
              // Fallback to first available language
              setSelectedCaptionLanguageRaw(availableLanguages[0]);
            }
          }
        }
      }
    }, [videoInfo?.captionURLs, selectedCaptionLanguage, subtitlesEnabled, preferredLanguage]);

    // Player control functions
    const handleTogglePlay = useCallback(() => {
      if (!player) return;
      try {
        if (player.playing) {
          player.pause();
        } else {
          // Check if we're at the end of the media
          const isAtEnd = duration > 0 && currentTime >= duration - 2;
          if (isAtEnd) {
            player.currentTime = 0;
          }
          player.play();
        }
        showControls(); // Show controls when user interacts
      } catch (error) {
        console.warn("MobileVideoControls: Error toggling play:", error);
      }
    }, [player, currentTime, duration, showControls]);

    const handleSeekBy = useCallback(
      (seconds: number, shouldShowControls: boolean = true) => {
        if (!player) return;
        try {
          if (!shouldShowControls) {
            // Calculate cumulative skip amount
            const newTotalSkip = isDoubleTapSeeking
              ? totalSkipAmount + seconds
              : seconds;
            setTotalSkipAmount(newTotalSkip);

            // Double tap seek - show only seek bar and skip feedback
            setIsDoubleTapSeeking(true);
            setSkipFeedback({ seconds: newTotalSkip, visible: true });

            // Clear existing timeouts
            if (skipFeedbackTimeoutRef.current) {
              clearTimeout(skipFeedbackTimeoutRef.current);
            }
            if (hideSeekOverlayTimeoutRef.current) {
              clearTimeout(hideSeekOverlayTimeoutRef.current);
            }

            // Show skip feedback animation
            skipFeedbackOpacity.setValue(1);

            // Reset the skip session after 2 seconds of inactivity
            hideSeekOverlayTimeoutRef.current = setTimeout(() => {
              // Hide skip feedback
              Animated.timing(skipFeedbackOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }).start();

              // Use setTimeout to safely update state after animation
              skipFeedbackTimeoutRef.current = setTimeout(() => {
                setIsDoubleTapSeeking(false);
                setSkipFeedback({ seconds: 0, visible: false });
                setTotalSkipAmount(0);
                // Let existing auto-hide logic handle control visibility
              }, 200);
            }, 2000);
          }

          player.seekBy(seconds);
          if (shouldShowControls) {
            showControls();
          }
        } catch (error) {
          console.warn("MobileVideoControls: Error seeking by:", error);
        }
      },
      [
        player,
        showControls,
        isDoubleTapSeeking,
        totalSkipAmount,
        skipFeedbackOpacity,
      ],
    );

    // Handle single tap - toggle controls visibility
    const handleSingleTap = useCallback(() => {
      if (isDoubleTapSeeking) return; // ignore while skip overlay session is active
      if (!isControlsVisible) {
        showControls();
      } else {
        setIsControlsVisible(false);
      }
    }, [isControlsVisible, showControls, isDoubleTapSeeking]);

    // Handle double tap skip
    const handleDoubleTapSkip = useCallback(
      (direction: "left" | "right") => {
        const seconds = direction === "left" ? -10 : 10;
        handleSeekBy(seconds, false);
      },
      [handleSeekBy],
    );

    // Helpers to keep tap recognition crisp
    const DOUBLE_MAX_DELAY = 300; // 250–350ms feels snappy
    const TAP_MAX_DISTANCE = 40; // avoid firing tap if finger drifts

    // Region-aware gesture handling
    const regionTap = Gesture.Exclusive(
      // double-tap first (priority)
      Gesture.Tap()
        .numberOfTaps(2)
        .maxDelay(DOUBLE_MAX_DELAY)
        .maxDistance(TAP_MAX_DISTANCE)
        .runOnJS(true)
        .onEnd((e) => {
          if (isInSeekBar(e)) return; // ignore taps on seek bar
          const third = windowWidth / 3;
          if (e.absoluteX < third) return handleDoubleTapSkip("left");
          if (e.absoluteX > 2 * third) return handleDoubleTapSkip("right");
          // center double-tap: no action (could add center skip if desired)
        }),
      // then single
      Gesture.Tap()
        .maxDistance(TAP_MAX_DISTANCE)
        .runOnJS(true)
        .onEnd((e) => {
          if (isInSeekBar(e)) return; // ignore taps on seek bar
          // Guard against accidental taps during skip overlay
          if (isDoubleTapSeeking) return;
          handleSingleTap();
        }),
    );

    // Track initial touch position for pan gesture
    const initialTouchX = useRef(0);
    const initialSeekTime = useRef(0);
    const cachedDurationRef = useRef(0);
    const latestSeekTimeRef = useRef(0);

    // Create pan gesture for seek bar - handles both tapping and dragging
    const seekGesture = useMemo(
      () =>
        Gesture.Pan()
          .runOnJS(true)
          .shouldCancelWhenOutside(false)
          .minDistance(0) // Allow immediate response to touch
          .onBegin((event) => {
            // Store initial touch position and current seek time
            initialTouchX.current = event.x;
            initialSeekTime.current = currentTime;
            setIsSeeking(true);
            showControls();

            // Calculate initial seek position
            const { width } = seekBarLayoutRef.current;
            if (width === 0) {
              return;
            }

            // Get current duration, fallback to player if needed
            let currentDuration = duration;
            if (currentDuration === 0 && player) {
              try {
                currentDuration = player.duration || 0;
                if (currentDuration > 0) {
                  setDuration(currentDuration);
                  cachedDurationRef.current = currentDuration;
                }
              } catch {
                // Silently handle duration access errors
              }
            }

            const progress = Math.max(0, Math.min(1, event.x / width));
            const newSeekTime = progress * currentDuration;
            setSeekTime(newSeekTime);
            latestSeekTimeRef.current = newSeekTime;
          })
          .onUpdate((event) => {
            const { width } = seekBarLayoutRef.current;
            if (width === 0) return;

            // Get duration with multiple fallbacks
            let currentDuration =
              cachedDurationRef.current || player.duration || duration || 0;

            // Calculate position from initial touch + translation
            const currentX = initialTouchX.current + event.translationX;
            const progress = Math.max(0, Math.min(1, currentX / width));
            const newSeekTime = progress * currentDuration;
            setSeekTime(newSeekTime);
            latestSeekTimeRef.current = newSeekTime;
          })
          .onEnd(() => {
            if (latestSeekTimeRef.current >= 0) {
              player.currentTime = latestSeekTimeRef.current;
            }
            setIsSeeking(false);
          }),
      [player, duration, currentTime, showControls, setIsSeeking, setSeekTime],
    );

    const progressPercentage =
      duration > 0 ? (currentTime / duration) * 100 : 0;
    const seekProgressPercentage =
      duration > 0 ? (seekTime / duration) * 100 : 0;

    return (
      <View style={styles.container}>
        {/* Subtitle Player - positioned above controls */}
        {showCaptionControls && (
          <SubtitlePlayer
            currentTime={currentTime}
            captionURLs={videoInfo?.captionURLs}
            selectedCaptionLanguage={selectedCaptionLanguage}
            selectedSubtitleStyle={selectedSubtitleStyle}
            selectedSubtitleBackground={selectedSubtitleBackground}
          />
        )}

        {/* Single region-aware gesture detector wraps entire container */}
        <GestureDetector gesture={regionTap}>
          <View style={styles.tapOverlay}></View>
        </GestureDetector>

        {/* Controls overlay */}
        <Animated.View
          style={[styles.controlsOverlay, { opacity: fadeAnim }]}
          pointerEvents={
            isControlsVisible || isDoubleTapSeeking ? "box-none" : "none"
          }
        >
          {/* Top controls */}
          <Animated.View
            style={[styles.topControls, { opacity: topControlsOpacity }]}
            pointerEvents="box-none"
          >
            <TouchableOpacity
              style={styles.topButton}
              onPress={() => {
                showControls();
                onExitWatchMode?.();
              }}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              <Text style={styles.topButtonText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.topButton}
              onPress={() => {
                showControls();
                onInfoPress?.();
              }}
            >
              <Ionicons
                name="information-circle-outline"
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </Animated.View>

          {/* Center controls with skip buttons */}
          <Animated.View
            style={[styles.centerControls, { opacity: centerControlsOpacity }]}
            pointerEvents="box-none"
          >
            {/* Skip back button */}
            <TouchableOpacity
              style={styles.centerSkipButton}
              onPress={() => handleSeekBy(-10)}
            >
              <Ionicons name="play-back" size={32} color="#FFFFFF" />
              <Text style={styles.centerSkipText}>10s</Text>
            </TouchableOpacity>

            {/* Play/pause button */}
            <TouchableOpacity
              style={styles.playPauseButton}
              onPress={handleTogglePlay}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={60}
                color="#FFFFFF"
              />
            </TouchableOpacity>

            {/* Skip forward button */}
            <TouchableOpacity
              style={styles.centerSkipButton}
              onPress={() => handleSeekBy(10)}
            >
              <Ionicons name="play-forward" size={32} color="#FFFFFF" />
              <Text style={styles.centerSkipText}>10s</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Bottom controls */}
          <View style={styles.bottomControls} pointerEvents="box-none">
            {/* Video title */}
            <Animated.View
              style={[
                styles.titleSection,
                { opacity: titleOpacity, marginLeft: insets.left },
              ]}
              pointerEvents="box-none"
            >
              <Text style={styles.videoTitle} numberOfLines={2}>
                {videoInfo?.title || ""}
              </Text>
              {videoInfo?.description && (
                <Text style={styles.videoDescription} numberOfLines={5}>
                  {videoInfo.description}
                </Text>
              )}
            </Animated.View>

            {/* Seek bar with touch support - always visible */}
            <View style={styles.seekSection}>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>
                  {formatTime(isSeeking ? seekTime : currentTime)}
                </Text>
                <Text style={styles.timeText}>{formatTime(duration)}</Text>
              </View>

              <GestureDetector gesture={seekGesture}>
                <View style={styles.seekBarTouchArea}>
                  <View
                    style={styles.seekBarContainer}
                    onLayout={handleSeekBarLayout}
                  >
                    {/* Background */}
                    <View style={styles.seekBarBackground} />

                    {/* Progress */}
                    <View
                      style={[
                        styles.seekBarProgress,
                        { width: `${progressPercentage}%` },
                      ]}
                    />

                    {/* Seek preview when dragging */}
                    {isSeeking && (
                      <View
                        style={[
                          styles.seekBarPreview,
                          { width: `${seekProgressPercentage}%` },
                        ]}
                      />
                    )}

                    {/* Playback dot */}
                    <View
                      style={[
                        styles.playbackDot,
                        { left: `${progressPercentage}%` },
                      ]}
                    />

                    {/* Seek dot when dragging */}
                    {isSeeking && (
                      <View
                        style={[
                          styles.seekDot,
                          { left: `${seekProgressPercentage}%` },
                        ]}
                      />
                    )}
                  </View>
                </View>
              </GestureDetector>
            </View>
            <View>
              {/* Caption Controls - positioned below seek bar */}
              {showCaptionControls && (
                <MobileCaptionControls
                  captionURLs={videoInfo?.captionURLs}
                  selectedCaptionLanguage={selectedCaptionLanguage}
                  onCaptionLanguageChange={setSelectedCaptionLanguage}
                  selectedSubtitleStyle={selectedSubtitleStyle}
                  onSubtitleStyleChange={setSelectedSubtitleStyle}
                  selectedSubtitleBackground={selectedSubtitleBackground}
                  onSubtitleBackgroundChange={setSelectedSubtitleBackground}
                  onShowControls={showControls}
                />
              )}
            </View>
          </View>

          {/* Episode switching indicator */}
          {isEpisodeSwitching && (
            <View style={styles.episodeSwitchingIndicator}>
              <Text style={styles.episodeSwitchingText}>
                Switching episode...
              </Text>
            </View>
          )}

          {/* Episode switch error */}
          {episodeSwitchError && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>
                Episode switch failed: {episodeSwitchError}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Skip feedback overlay */}
        {skipFeedback.visible && (
          <Animated.View
            style={[
              styles.skipFeedbackOverlay,
              { opacity: skipFeedbackOpacity },
            ]}
            pointerEvents="none"
          >
            <View style={styles.skipFeedbackContainer}>
              <Ionicons
                name={skipFeedback.seconds > 0 ? "play-forward" : "play-back"}
                size={48}
                color="#FFFFFF"
              />
              <Text style={styles.skipFeedbackText}>
                {skipFeedback.seconds > 0
                  ? `+${skipFeedback.seconds}s`
                  : `${skipFeedback.seconds}s`}
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    );
  },
);

MobileVideoControls.displayName = "MobileVideoControls";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  tapOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 1,
  },
  debugRegion: {
    bottom: 0,
    position: "absolute",
    top: 0,
    zIndex: 1,
  },
  controlsOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 2,
  },

  // Top controls
  topControls: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 50,
  },
  topButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 8,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 4,
  },
  topButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  // Center controls
  centerControls: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 40,
    justifyContent: "center",
  },
  playPauseButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 50,
    justifyContent: "center",
    padding: 20,
    zIndex: 4,
  },
  centerSkipButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 8,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 4,
  },
  centerSkipText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },

  // Bottom controls
  bottomControls: {
    paddingBottom: 40,
    paddingHorizontal: 20,
  },
  titleSection: {
    marginBottom: 20,
  },
  videoTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  videoDescription: {
    color: "#CCCCCC",
    fontSize: 14,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  // Seek controls
  seekSection: {
    marginBottom: 20,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  timeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  seekBarTouchArea: {
    paddingVertical: 10, // Larger touch area
    zIndex: 4, // Higher than tap areas to ensure seek works
  },
  seekBarContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    height: 4,
    position: "relative",
  },
  seekBarBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  seekBarProgress: {
    backgroundColor: "#FFFFFF",
    borderRadius: 2,
    bottom: 0,
    left: 0,
    position: "absolute",
    top: 0,
  },
  seekBarPreview: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: "#FFD700", // Gold for preview
    borderRadius: 2,
    opacity: 0.8,
  },
  playbackDot: {
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    height: 12,
    marginLeft: -6,
    position: "absolute",
    top: -4,
    width: 12,
    zIndex: 2,
  },
  seekDot: {
    backgroundColor: "#FFD700",
    borderColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    marginLeft: -8,
    position: "absolute",
    top: -6,
    width: 16,
    zIndex: 3,
  },

  // Skip feedback overlay
  skipFeedbackOverlay: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 6,
  },
  skipFeedbackContainer: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 12,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  skipFeedbackText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },

  // Status indicators
  episodeSwitchingIndicator: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 8,
    left: 20,
    paddingVertical: 16,
    position: "absolute",
    right: 20,
    top: "50%",
  },
  episodeSwitchingText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  errorContainer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    borderColor: "rgba(255, 0, 0, 0.3)",
    borderRadius: 8,
    borderWidth: 1,
    bottom: 100,
    left: 20,
    padding: 15,
    position: "absolute",
    right: 20,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
    textAlign: "center",
  },
});

export default MobileVideoControls;
