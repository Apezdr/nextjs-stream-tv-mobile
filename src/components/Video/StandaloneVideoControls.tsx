// src/components/Video/StandaloneVideoControls.tsx
import Ionicons from "@expo/vector-icons/Ionicons";
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
import EpisodeCarousel from "./EpisodeCarousel";
import SeekBar from "./SeekBar";
import SubtitlePlayer from "./SubtitlePlayer";

import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { TVDeviceEpisode } from "@/src/data/types/content.types";

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
  onInfoPress?: () => void;
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
  // New props for episode carousel
  episodes?: TVDeviceEpisode[];
  currentEpisodeNumber?: number;
  onEpisodeSelect?: (episode: TVDeviceEpisode) => void;
  isLoadingEpisodes?: boolean;
  // Enhanced episode switching props
  isEpisodeSwitching?: boolean;
  episodeSwitchError?: string | null;
}

// Self-contained video controls that get time data directly from player
const StandaloneVideoControls = memo(
  ({
    player,
    videoInfo,
    customButtons,
    overlayMode = false,
    onExitWatchMode,
    onInfoPress,
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
    episodes,
    currentEpisodeNumber,
    onEpisodeSelect,
    isLoadingEpisodes = false,
    isEpisodeSwitching = false,
    episodeSwitchError = null,
  }: StandaloneVideoControlsProps) => {
    // Get enhanced remote activity state from context
    const {
      isRemoteActive,
      // isUserInteracting,
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
    } = useRemoteActivity();

    // State for SeekBar preferred focus management
    const [seekBarShouldFocus, setSeekBarShouldFocus] = useState(true); // Initially true for first load

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

    // Create animated values for loading dots
    const dotAnim1 = useRef(new Animated.Value(0.4)).current;
    const dotAnim2 = useRef(new Animated.Value(0.4)).current;
    const dotAnim3 = useRef(new Animated.Value(0.4)).current;

    // Update animation based on remote activity
    useEffect(() => {
      const shouldShow = isRemoteActive || !isPlaying;
      Animated.timing(fadeAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, [isRemoteActive, isPlaying, fadeAnim]);

    // Animate loading dots when episode switching
    useEffect(() => {
      if (isEpisodeSwitching) {
        const createDotAnimation = (
          animValue: Animated.Value,
          delay: number,
        ) => {
          return Animated.loop(
            Animated.sequence([
              Animated.timing(animValue, {
                toValue: 1,
                duration: 600,
                delay,
                useNativeDriver: true,
              }),
              Animated.timing(animValue, {
                toValue: 0.4,
                duration: 600,
                useNativeDriver: true,
              }),
            ]),
          );
        };

        const animations = [
          createDotAnimation(dotAnim1, 0),
          createDotAnimation(dotAnim2, 200),
          createDotAnimation(dotAnim3, 400),
        ];

        Animated.parallel(animations).start();

        return () => {
          animations.forEach((anim) => anim.stop());
        };
      } else {
        // Reset dots to initial state
        dotAnim1.setValue(0.4);
        dotAnim2.setValue(0.4);
        dotAnim3.setValue(0.4);
      }
    }, [isEpisodeSwitching, dotAnim1, dotAnim2, dotAnim3]);

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
          // Check if we're at the end of the media (within 2 seconds of duration)
          const isAtEnd = duration > 0 && currentTime >= duration - 2;

          if (isAtEnd) {
            // Restart from the beginning
            player.currentTime = 0;
          }

          player.play();
        }
      } catch (error) {
        console.warn("🎬 StandaloneVideoControls: Error toggling play:", error);
      }
    }, [player, currentTime, duration]);

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

    // Reset SeekBar focus state after it's been applied (for initial load and episode changes)
    useEffect(() => {
      if (seekBarShouldFocus) {
        console.log("🎯 SeekBar focus state set to true, will reset in 200ms");
        // Reset after a brief delay to allow focus transfer, then disable for normal navigation
        const timer = setTimeout(() => {
          console.log("🎯 Resetting SeekBar focus state to false");
          setSeekBarShouldFocus(false);
        }, 200);
        return () => clearTimeout(timer);
      }
    }, [seekBarShouldFocus]);

    useEffect(() => {
      setSeekBarShouldFocus(true); // Reset focus state
    }, []);

    const controlsContainerStyle = overlayMode
      ? [styles.controls, styles.overlayControls]
      : styles.controls;

    return (
      <View style={styles.flex1}>
        <SubtitlePlayer
          currentTime={currentTime}
          captionURLs={videoInfo?.captionURLs}
          selectedCaptionLanguage={selectedCaptionLanguage}
          selectedSubtitleStyle={selectedSubtitleStyle}
          selectedSubtitleBackground={selectedSubtitleBackground}
        />
        <Animated.View style={[controlsContainerStyle, { opacity: fadeAnim }]}>
          {/* Main Focus Guide for all controls */}
          <TVFocusGuideView autoFocus style={styles.mainControlsContainer}>
            {/* 1. Top Section */}
            <View style={styles.topSection}>
              <View style={styles.topLeftSection}>
                {customButtons}
                {onExitWatchMode && (
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
                )}
                {onInfoPress && (
                  <Pressable
                    style={({ focused, pressed }) => [
                      styles.controlButton,
                      styles.infoButton,
                      focused && styles.controlButtonFocused,
                      pressed && styles.controlButtonPressed,
                    ]}
                    onPress={handleButtonPress(onInfoPress)}
                    focusable={true}
                  >
                    <Ionicons
                      name="information-circle-outline"
                      size={24}
                      color="rgba(255, 255, 255, 0.69)"
                    />
                  </Pressable>
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
                        focusable={true}
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
                        focusable={true}
                      >
                        <Text style={styles.controlButtonText}>Next</Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            </View>

            {/* Episode Switching Indicator */}
            {isEpisodeSwitching && (
              <View style={styles.episodeSwitchingIndicator}>
                <View style={styles.episodeSwitchingContent}>
                  <Text style={styles.episodeSwitchingText}>
                    Switching episode...
                  </Text>
                  <View style={styles.loadingDots}>
                    <Animated.View
                      style={[styles.dot, { opacity: dotAnim1 }]}
                    />
                    <Animated.View
                      style={[styles.dot, { opacity: dotAnim2 }]}
                    />
                    <Animated.View
                      style={[styles.dot, { opacity: dotAnim3 }]}
                    />
                  </View>
                </View>
              </View>
            )}

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
                    hasTVPreferredFocus={!seekBarShouldFocus}
                  />

                  {/* Caption Controls */}
                  {showCaptionControls && (
                    <CaptionControls
                      captionURLs={videoInfo?.captionURLs}
                      selectedCaptionLanguage={selectedCaptionLanguage}
                      onCaptionLanguageChange={setSelectedCaptionLanguage}
                      selectedSubtitleStyle={selectedSubtitleStyle}
                      onSubtitleStyleChange={setSelectedSubtitleStyle}
                      selectedSubtitleBackground={selectedSubtitleBackground}
                      onSubtitleBackgroundChange={setSelectedSubtitleBackground}
                      onActivityReset={resetActivityTimer}
                      shouldAllowFocusDown={
                        videoInfo?.type !== "tv" &&
                        (!episodes || episodes.length === 0)
                      } // Allow focus to move down to the next control
                    />
                  )}

                  {/* 5. Episode Carousel Section - Part of main focus flow */}
                  {videoInfo?.type === "tv" &&
                    episodes &&
                    episodes.length > 0 && (
                      <View style={styles.episodeCarouselInFlow}>
                        <EpisodeCarousel
                          episodes={episodes}
                          currentEpisodeNumber={currentEpisodeNumber || 1}
                          onEpisodeSelect={(episode) => {
                            resetActivityTimer();
                            if (onEpisodeSelect) {
                              onEpisodeSelect(episode);
                              // Transfer focus to SeekBar using hasTVPreferredFocus toggle
                              setSeekBarShouldFocus(true);
                            }
                          }}
                          isLoading={isLoadingEpisodes}
                          disabled={isEpisodeSwitching}
                        />
                      </View>
                    )}

                  {/* Episode switching error display */}
                  {episodeSwitchError && (
                    <View style={styles.errorContainer}>
                      <Text style={styles.errorText}>
                        Episode switch failed: {episodeSwitchError}
                      </Text>
                      <Pressable
                        style={({ focused }) => [
                          styles.retryButton,
                          focused && styles.retryButtonFocused,
                        ]}
                        onPress={() => {
                          resetActivityTimer();
                          // Could implement retry logic here if needed
                        }}
                        focusable={true}
                      >
                        <Text style={styles.retryButtonText}>Dismiss</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
            </View>
          </TVFocusGuideView>
        </Animated.View>
      </View>
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

  dot: {
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    height: 6,
    width: 6,
  },

  episodeCarouselInFlow: {
    width: "100%",
  },

  episodeCarouselSection: {
    bottom: -115,
    left: 0,
    position: "absolute",
    width: "100%",
  },

  episodeSwitchingContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },

  episodeSwitchingIndicator: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 8,
    marginHorizontal: 40,
    marginVertical: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },

  episodeSwitchingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },

  errorContainer: {
    alignItems: "center",
    backgroundColor: "rgba(255, 0, 0, 0.1)",
    borderColor: "rgba(255, 0, 0, 0.3)",
    borderRadius: 8,
    borderWidth: 1,
    marginHorizontal: 40,
    marginTop: 10,
    padding: 15,
  },

  errorText: {
    color: "#FF6B6B",
    fontSize: 14,
    marginBottom: 10,
    textAlign: "center",
  },

  flex1: {
    flex: 1,
  },

  infoButton: {
    minWidth: 50,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  loadingDots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
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

  mainControlsContainer: {
    flex: 1,
    width: "100%",
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

  retryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 8,
  },

  retryButtonFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },

  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
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
    gap: 10,
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
