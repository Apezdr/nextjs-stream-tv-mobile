// src/components/Video/StandaloneVideoControls.tsx
import { useEvent } from "expo";
import { Image } from "expo-image";
import { VideoPlayer } from "expo-video";
import * as React from "react";
import { memo, useEffect, useRef, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Dimensions,
  Animated,
  TVFocusGuideView,
} from "react-native";

import CaptionControls, {
  SubtitleStyle,
  SUBTITLE_STYLES,
  SubtitleBackgroundOption,
  SUBTITLE_BACKGROUND_OPTIONS,
} from "./CaptionControls";
import SeekBar from "./SeekBar";
import SubtitlePlayer from "./SubtitlePlayer";

import { useRemoteActivity } from "@/src/context/RemoteActivityContext";

interface StandaloneVideoControlsProps {
  player: VideoPlayer; // expo-video player instance
  videoInfo?: {
    type?: "tv" | "movie" | null;
    showTitle?: string;
    title: string;
    description?: string;
    logo?: string;
    metadata?: any;
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
    backdropBlurhash?: string;
  };
  customButtons?: React.ReactNode;
  overlayMode?: boolean;
  onExitWatchMode?: () => void;
  onPlayPrev?: () => void;
  onPlayNext?: () => void;
  showPrevNext?: boolean;
  showCaptionControls?: boolean;
  onToggleCaptions?: () => void;
  captionsEnabled?: boolean;
  showAudioControls?: boolean;
  onAudioTrackSelect?: (trackId: string) => void;
  audioTracks?: Array<{ id: string; label: string }>;
  selectedAudioTrack?: string;
}

// Self-contained video controls that get time data directly from player
const StandaloneVideoControls = memo(
  ({
    player,
    videoInfo,
    customButtons,
    overlayMode = false,
    onExitWatchMode,
    onPlayPrev,
    onPlayNext,
    showPrevNext = true,
    showCaptionControls = false,
    // onToggleCaptions,
    // captionsEnabled = false,
    // showAudioControls = false,
    // onAudioTrackSelect,
    // audioTracks,
    // selectedAudioTrack,
  }: StandaloneVideoControlsProps) => {
    // Get enhanced remote activity state from context
    const {
      isRemoteActive,
      // isUserInteracting,
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
    } = useRemoteActivity();

    // Caption selection state - use undefined to distinguish from user selecting "Off" (null)
    const [selectedCaptionLanguage, setSelectedCaptionLanguage] = useState<
      string | null | undefined
    >(undefined);

    // Subtitle style state
    const [selectedSubtitleStyle, setSelectedSubtitleStyle] =
      useState<SubtitleStyle>(SUBTITLE_STYLES[1]);

    // Subtitle background state
    const [selectedSubtitleBackground, setSelectedSubtitleBackground] =
      useState<SubtitleBackgroundOption>(SUBTITLE_BACKGROUND_OPTIONS[0]);

    // Use expo-video's useEvent hook for efficient, stateful player data
    const { isPlaying } = useEvent(player, "playingChange", {
      isPlaying: player?.playing || false,
    });
    const { currentTime } = useEvent(player, "timeUpdate", {
      currentTime: player?.currentTime || 0,
      currentLiveTimestamp: 0,
      currentOffsetFromLive: 0,
      bufferedPosition: 0,
    });
    const { status } = useEvent(player, "statusChange", {
      status: player?.status || "idle",
    });

    // Local state for duration (doesn't change frequently)
    const [duration, setDuration] = useState(0);

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

    // Set up duration tracking when player status changes
    useEffect(() => {
      if (player && player.duration) {
        setDuration(player.duration);
      }
    }, [player, status]);

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

    // Player control functions
    const handleTogglePlay = useCallback(() => {
      if (!player) return;
      try {
        if (player.playing) {
          player.pause();
        } else {
          player.play();
        }
      } catch (error) {
        console.warn("🎬 StandaloneVideoControls: Error toggling play:", error);
      }
    }, [player]);

    const handleSeek = useCallback(
      (time: number) => {
        if (!player) return;
        try {
          player.currentTime = time;
        } catch (error) {
          console.warn("🎬 StandaloneVideoControls: Error seeking:", error);
        }
      },
      [player],
    );

    const handleSeekBy = useCallback(
      (seconds: number) => {
        if (!player) return;
        try {
          player.seekBy(seconds);
        } catch (error) {
          console.warn("🎬 StandaloneVideoControls: Error seeking by:", error);
        }
      },
      [player],
    );

    // Initialize default caption language (only once when captionURLs first become available)
    useEffect(() => {
      if (videoInfo?.captionURLs && selectedCaptionLanguage === undefined) {
        const availableLanguages = Object.keys(videoInfo.captionURLs);

        // First try to find English by name
        if (availableLanguages.includes("English")) {
          setSelectedCaptionLanguage("English");
        } else {
          // Then try to find English by srcLang code
          const englishLang = availableLanguages.find(
            (lang) =>
              videoInfo.captionURLs &&
              (videoInfo.captionURLs[lang].srcLang === "eng" ||
                videoInfo.captionURLs[lang].srcLang === "en"),
          );

          if (englishLang) {
            setSelectedCaptionLanguage(englishLang);
          } else if (availableLanguages.length > 0) {
            // Fallback to first available language
            setSelectedCaptionLanguage(availableLanguages[0]);
          }
        }
      }
    }, [videoInfo?.captionURLs, selectedCaptionLanguage]);

    const controlsContainerStyle = overlayMode
      ? [styles.controls, styles.overlayControls]
      : styles.controls;

    return (
      <TVFocusGuideView autoFocus style={styles.flex1}>
        <SubtitlePlayer
          currentTime={currentTime}
          captionURLs={videoInfo?.captionURLs}
          selectedCaptionLanguage={selectedCaptionLanguage}
          selectedSubtitleStyle={selectedSubtitleStyle}
          selectedSubtitleBackground={selectedSubtitleBackground}
        />
        <Animated.View style={[controlsContainerStyle, { opacity: fadeAnim }]}>
          {/* 1. Top Section */}
          <View style={styles.topSection}>
            <View style={styles.topLeftSection}>
              {customButtons}
              {onExitWatchMode && (
                <TVFocusGuideView trapFocusLeft>
                  <Pressable
                    style={({ focused, pressed }) => [
                      styles.controlButton,
                      focused && styles.controlButtonFocused,
                      pressed && styles.controlButtonPressed,
                    ]}
                    onPress={onExitWatchMode}
                    focusable={true}
                  >
                    <Text style={styles.controlButtonText}>← Back</Text>
                  </Pressable>
                </TVFocusGuideView>
              )}
            </View>
            <View style={styles.topRightSection}>
              {/* Future: Content rating, quality indicators, etc. */}
            </View>
          </View>

          {/* 2. Middle Section - Primary Controls */}
          <View style={styles.middleSection}>
            <View style={styles.logoContainer}>
              {overlayMode && videoInfo?.logo ? (
                <Image
                  source={{ uri: videoInfo.logo }}
                  style={styles.logo}
                  priority={"high"}
                />
              ) : videoInfo?.showTitle ? (
                <Text style={styles.videoTitle}>{videoInfo.showTitle}</Text>
              ) : null}
            </View>

            {/* <TVFocusGuideView autoFocus>
            <View style={styles.primaryControls}>
              <Pressable 
                style={({ focused, pressed }) => [
                  styles.controlButton,
                  styles.skipButton,
                  focused && styles.controlButtonFocused,
                  pressed && styles.controlButtonPressed,
                ]}
                onPress={handleButtonPress(handleSkipBackward)}
                isTVSelectable
              >
                <Ionicons
                  name="reload-outline"
                  size={30}
                  style={[styles.controlButtonText, { transform: [{ scaleX: -1 }] }]}
                />
                <Text style={styles.skipButtonLabel}>15</Text>
              </Pressable>
              
              <Pressable 
                style={({ focused, pressed }) => [
                  styles.controlButton,
                  styles.playPauseButton,
                  focused && styles.controlButtonFocused,
                  pressed && styles.controlButtonPressed,
                ]}
                onPress={handleButtonPress(handleTogglePlay)} 
                isTVSelectable
                hasTVPreferredFocus={true}
              >
                {isPlaying ? 
                  <Ionicons name="pause" size={50} color="#fff" /> : 
                  <Ionicons name="play" size={50} color="#fff" />
                }
              </Pressable>
              
              <Pressable 
                style={({ focused, pressed }) => [
                  styles.controlButton,
                  styles.skipButton,
                  focused && styles.controlButtonFocused,
                  pressed && styles.controlButtonPressed,
                ]}
                onPress={handleButtonPress(handleSkipForward)}
                isTVSelectable
              >
                <Ionicons
                  name="reload-outline"
                  size={30}
                  style={[styles.controlButtonText, { transform: [{ translateX: 2 }] }]}
                />
                <Text style={styles.skipButtonLabel}>15</Text>
              </Pressable>
            </View>
          </TVFocusGuideView> */}
          </View>

          {/* 3. Bottom Info Section */}
          <View style={styles.bottomSection}>
            {overlayMode && videoInfo && (
              <View style={styles.videoInfoSection}>
                {videoInfo.type === "tv" ||
                (videoInfo.type === "movie" && !videoInfo.logo) ? (
                  <Text style={styles.videoTitle}>{videoInfo.title}</Text>
                ) : null}
                {videoInfo.description && (
                  <Text style={styles.videoDescription}>
                    {videoInfo.description}
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
            {duration > 0 && (
              <>
                <SeekBar
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={handleSeek}
                  onSeekBy={handleSeekBy}
                  onTogglePlay={handleTogglePlay}
                  isPlaying={isPlaying}
                  onStartSeeking={startContinuousActivity}
                  onStopSeeking={stopContinuousActivity}
                />
                {/* Caption Controls */}
                {showCaptionControls && (
                  <TVFocusGuideView
                    autoFocus
                    trapFocusLeft
                    trapFocusRight
                    trapFocusDown
                    focusable={true}
                  >
                    <CaptionControls
                      captionURLs={videoInfo?.captionURLs}
                      selectedCaptionLanguage={selectedCaptionLanguage}
                      onCaptionLanguageChange={setSelectedCaptionLanguage}
                      selectedSubtitleStyle={selectedSubtitleStyle}
                      onSubtitleStyleChange={setSelectedSubtitleStyle}
                      selectedSubtitleBackground={selectedSubtitleBackground}
                      onSubtitleBackgroundChange={setSelectedSubtitleBackground}
                      onActivityReset={resetActivityTimer}
                    />
                  </TVFocusGuideView>
                )}
              </>
            )}
          </View>
        </Animated.View>
      </TVFocusGuideView>
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
    backgroundColor: "rgba(255, 255, 255, 0.01)",
    borderColor: "transparent",
    borderRadius: 50,
    borderWidth: 2,
    minWidth: 60,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  controlButtonFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },

  controlButtonPressed: {
    backgroundColor: "rgba(255,255,255,0.6)",
  },

  controlButtonText: {
    color: "rgba(255, 255, 255, 0.69)",
  },

  controls: {
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: "28%",
    maxWidth: Dimensions.get("window").width,
    width: "100%",
  },

  flex1: {
    flex: 1,
  },

  logo: {
    flex: 1,
    height: undefined,
    marginBottom: 80,
    resizeMode: "contain",
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
    backgroundColor: "rgba(0, 0, 0, 0.3)",
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
    color: "#fff",
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
    color: "#CCCCCC",
    fontSize: 12,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  videoInfoSection: {
    alignSelf: "flex-start",
    maxWidth: "70%",
  },

  videoOverview: {
    color: "#bfbfbf",
    fontSize: 11,
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },

  videoTitle: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
});

export default StandaloneVideoControls;
