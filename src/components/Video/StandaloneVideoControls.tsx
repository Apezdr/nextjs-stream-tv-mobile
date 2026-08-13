// src/components/Video/StandaloneVideoControls.tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEvent } from "expo";
import { Image } from "expo-image";
import { VideoPlayer } from "expo-video";
import * as React from "react";
import { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
  Modal,
  TVFocusGuideView,
} from "react-native";
import Reanimated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import AudioControls from "./AudioControls";
import CaptionControls, {
  SubtitleStyle,
  SUBTITLE_STYLES,
  SubtitleBackgroundOption,
  SUBTITLE_BACKGROUND_OPTIONS,
} from "./CaptionControls";
import EpisodeCarousel from "./EpisodeCarousel";
import SeekBar, { type PlayerState, type SeekBarRef } from "./SeekBar";
import SubtitlePlayer from "./SubtitlePlayer";

import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { TVDeviceEpisode } from "@/src/data/types/content.types";
import {
  useAudioFormats,
  useStickyForSource,
} from "@/src/hooks/useAudioFormats";
import {
  groupAudioTracksByLanguage,
  useAudioTracks,
} from "@/src/hooks/useAudioTracks";
import { useDimensions } from "@/src/hooks/useDimensions";
import { useSubtitlePreferencesStore } from "@/src/stores/subtitlePreferencesStore";

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
  // HLS/DASH gate computed by the watch page from the source URL. The other
  // half of the visibility rule (>= 2 languages or formats) is player-derived
  // and lives here.
  showAudioControls?: boolean;
  // The active source URL; fetched and parsed for audio format metadata
  // (CHANNELS/codec per rendition group) that the player API doesn't expose.
  videoURL?: string | null;
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
    showAudioControls = false,
    videoURL = null,
    episodes,
    currentEpisodeNumber,
    onEpisodeSelect,
    isLoadingEpisodes = false,
    isEpisodeSwitching = false,
    episodeSwitchError = null,
  }: StandaloneVideoControlsProps) => {
    // Get dynamic dimensions
    const { window } = useDimensions();
    // Get enhanced remote activity state from context
    const {
      isRemoteActive,
      // isUserInteracting,
      resetActivityTimer,
      startContinuousActivity,
      stopContinuousActivity,
      registerPlayPauseHandler,
      unregisterPlayPauseHandler,
      registerSeekHandler,
      unregisterSeekHandler,
    } = useRemoteActivity();

    // Ref to the SeekBar's imperative handle. The outer TVFocusGuideView's
    // `destinations` array points at the SeekBar's underlying focusable node
    // for deterministic initial focus, and we call `seekBarRef.current.focus()`
    // imperatively after an episode select. Replaces a prior dynamic
    // `hasTVPreferredFocus={!seekBarShouldFocus}` toggle that flipped on a
    // 200ms timer and raced with user DOWN-presses, intermittently re-stealing
    // focus from the captions/episode carousel.
    const seekBarRef = useRef<SeekBarRef>(null);
    const [seekBarNode, setSeekBarNode] = useState<View | null>(null);
    const seekBarRefCallback = useCallback((node: SeekBarRef | null) => {
      seekBarRef.current = node;
      setSeekBarNode(node ? node.getNode() : null);
    }, []);
    const focusDestinations = useMemo(
      () => (seekBarNode ? [seekBarNode] : undefined),
      [seekBarNode],
    );

    // Subtitle preferences (persisted)
    const subtitlesEnabled = useSubtitlePreferencesStore(
      (s) => s.subtitlesEnabled,
    );
    const preferredLanguage = useSubtitlePreferencesStore(
      (s) => s.preferredLanguage,
    );
    const setSubtitlesEnabled = useSubtitlePreferencesStore(
      (s) => s.setSubtitlesEnabled,
    );
    const setPreferredLanguage = useSubtitlePreferencesStore(
      (s) => s.setPreferredLanguage,
    );

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
      useState<SubtitleStyle>(SUBTITLE_STYLES[1]);

    // Subtitle background state
    const [selectedSubtitleBackground, setSelectedSubtitleBackground] =
      useState<SubtitleBackgroundOption>(SUBTITLE_BACKGROUND_OPTIONS[0]);

    // Use expo-video's useEvent hook for efficient, stateful player data.
    // Initial values are read from the player so we don't start with stale zeros
    // when the controls mount after a watch-history seek has already happened.
    const { isPlaying: isPlayingEvent } = useEvent(player, "playingChange", {
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

    // playingChange can be missed (useEvent attaches listeners in a passive
    // effect, and episode switches via replaceAsync + play() can deliver a
    // late `false`), which would pin the overlay via `!isPlaying`. Hold the
    // value as state and reconcile against the player's actual `playing` flag
    // on every timeUpdate/statusChange tick (timeUpdate fires ~1 Hz while
    // playing, so a missed event heals within a second).
    const [isPlaying, setIsPlaying] = useState(isPlayingEvent);
    useEffect(() => {
      setIsPlaying(isPlayingEvent);
    }, [isPlayingEvent]);
    useEffect(() => {
      const actual = !!player?.playing;
      setIsPlaying((prev) => (prev === actual ? prev : actual));
    }, [player, currentTime, status]);

    // Initialize duration from the player so the very first render doesn't fall
    // into the `duration <= 0 → buffering` branch when expo-video has already
    // resolved the source.
    const [duration, setDuration] = useState(() => player?.duration || 0);

    // Audio track state comes straight from the player, no prop plumbing.
    const {
      availableAudioTracks,
      selectedAudioTrack,
      selectAudioTrack,
      isAutomaticSelection,
      supportsAutomaticSelection,
      selectAutomatic,
    } = useAudioTracks(player);
    // Sound-format axis (Android-only in practice — needs AudioTrack.id).
    const { formatOptions, selectedFormatGroupId } = useAudioFormats(
      videoURL,
      availableAudioTracks,
      selectedAudioTrack,
    );
    // Gate on distinct LANGUAGES, not raw tracks — a single-language master
    // often exposes several codec/channel renditions as separate tracks.
    const audioLanguageCount = useMemo(
      () => groupAudioTracksByLanguage(availableAudioTracks).length,
      [availableAudioTracks],
    );
    // No duration gate here: duration is an unrelated readiness proxy that
    // only delays the button. The latch keeps it on screen across the empty
    // windows that follow a load or an episode switch.
    const audioButtonVisible = useStickyForSource(
      !!showAudioControls &&
        (audioLanguageCount >= 2 || formatOptions.length >= 2),
      videoURL,
    );

    // Trap DOWN in the caption/audio row only when there's no episode
    // carousel below to navigate to.
    const trapCaptionAudioFocusDown = !(
      videoInfo?.type === "tv" &&
      !!episodes &&
      episodes.length > 0
    );

    // Player state detection for unified state management
    const [playerState, setPlayerState] = useState<PlayerState>("normal");

    // Restart-from-beginning confirmation modal visibility
    const [showRestartConfirm, setShowRestartConfirm] = useState(false);

    // Determine current player state based on various conditions
    useEffect(() => {
      // Episode switching state
      if (isEpisodeSwitching) {
        setPlayerState("buffering");
        return;
      }

      // Player status-based states. We intentionally do NOT gate on
      // `currentTime === 0 && !isPlaying` here: that branch mis-fires after a
      // watch-history seek because expo-video's `timeUpdate` event hasn't
      // delivered the resumed position yet, locking the seek bar into a
      // permanent "buffering" shimmer until a remount.
      switch (status) {
        case "loading":
          // Only treat "loading" as buffering if we don't already have a
          // resolved duration. Once duration is known, the player has loaded
          // the source and any subsequent "loading" emit is a transient seek.
          if (duration <= 0) {
            setPlayerState("buffering");
          } else {
            setPlayerState("normal");
          }
          break;
        case "readyToPlay":
          setPlayerState("normal");
          break;
        case "error":
          setPlayerState("error");
          break;
        case "idle":
        default:
          if (duration > 0) {
            setPlayerState("normal");
          } else {
            setPlayerState("buffering");
          }
      }
    }, [status, isEpisodeSwitching, duration]);

    // Create animated value for opacity
    const fadeAnim = useRef(new Animated.Value(1)).current;

    // 0 = collapsed (logo at default position), 1 = carousel expanded
    // (logo moved to top center, out of the way of the episode title/desc
    // that gets pushed up by the growing carousel). Reanimated shared value
    // so this runs on the same UI-thread runtime as the carousel's own
    // animations — mixing react-native's legacy Animated with Reanimated for
    // simultaneous animations was the source of the visible jitter.
    const carouselExpandedAnim = useSharedValue(0);
    // Tracks the last target we actually committed to `withTiming`. Used to
    // dedup repeated calls with the same target.
    const logoAnimTargetRef = useRef(0);
    // Debounce handle so rapid expand/contract toggles don't bounce the logo:
    // we only commit a withTiming once the carousel has held a state for the
    // settle window below.
    const logoAnimDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const handleCarouselExpandedChange = useCallback(
      (expanded: boolean) => {
        const nextTarget = expanded ? 1 : 0;
        if (logoAnimTargetRef.current === nextTarget) {
          // Target hasn't changed from the last committed value — drop any
          // pending debounce (it would have committed the same target anyway)
          // and bail.
          if (logoAnimDebounceRef.current) {
            clearTimeout(logoAnimDebounceRef.current);
            logoAnimDebounceRef.current = null;
          }
          return;
        }
        if (logoAnimDebounceRef.current) {
          clearTimeout(logoAnimDebounceRef.current);
        }
        logoAnimDebounceRef.current = setTimeout(() => {
          logoAnimDebounceRef.current = null;
          logoAnimTargetRef.current = nextTarget;
          carouselExpandedAnim.value = withTiming(nextTarget, {
            duration: 300,
          });
        }, 150);
      },
      [carouselExpandedAnim],
    );
    useEffect(() => {
      return () => {
        if (logoAnimDebounceRef.current) {
          clearTimeout(logoAnimDebounceRef.current);
          logoAnimDebounceRef.current = null;
        }
      };
    }, []);
    const animatedLogoStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateX: interpolate(
              carouselExpandedAnim.value,
              [0, 1],
              // From left: 5% to centered: 50% - half-of-logo-width.
              // 100 = half of the logoContainer's 200px width.
              [0, window.width * 0.45 - 100],
            ),
          },
          {
            translateY: interpolate(
              carouselExpandedAnim.value,
              [0, 1],
              // From top: 27% to top: 5%, in pixels.
              [0, -window.height * 0.22],
            ),
          },
        ],
      };
    });

    // Create animated values for loading dots
    const dotAnim1 = useRef(new Animated.Value(0.4)).current;
    const dotAnim2 = useRef(new Animated.Value(0.4)).current;
    const dotAnim3 = useRef(new Animated.Value(0.4)).current;

    // Update animation based on remote activity, and keep TV focus parked on
    // the SeekBar whenever the overlay is not visible.
    //
    // The overlay fades to opacity 0 but stays MOUNTED and FOCUSABLE — there is
    // no pointerEvents gating — so without this, focus is left wherever the
    // user last moved it (captions, the episode carousel, Back) sitting on an
    // invisible control. The next keypress then acts on that hidden target
    // instead of revealing a predictable overlay.
    const prevShouldShowRef = useRef(true);
    useEffect(() => {
      const shouldShow = isRemoteActive || !isPlaying;
      Animated.timing(fadeAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Falling edge only: reset focus as the overlay hides.
      //
      // This is what makes "SELECT always pauses while the video is playing
      // with no UI" an invariant rather than luck. Focus can only move on a
      // remote press, and every remote press runs resetActivityTimer, which
      // re-shows the overlay — so you can never navigate off the SeekBar
      // without the UI becoming visible first. Hidden therefore implies the
      // SeekBar is focused, and its onPress is wired to handleTogglePlay.
      //
      // Deferred a frame, like the other imperative focus calls here: the
      // SeekBar's ref can be momentarily null while it re-renders (playerState
      // changes during episode switching remount its subtree), and a
      // synchronous call would silently no-op and break the invariant.
      if (prevShouldShowRef.current && !shouldShow) {
        const raf = requestAnimationFrame(() => {
          seekBarRef.current?.focus();
        });
        prevShouldShowRef.current = shouldShow;
        return () => cancelAnimationFrame(raf);
      }
      prevShouldShowRef.current = shouldShow;
    }, [isRemoteActive, isPlaying, fadeAnim]);

    // Deterministic INITIAL focus.
    //
    // The outer TVFocusGuideView has `autoFocus` + `destinations`, but that
    // only redirects focus that ENTERS the guide view — it never grants focus
    // on mount. Nothing else claims it either, so the watch page loaded with
    // no focused element at all and the first d-pad press went nowhere useful.
    // Fire once, as soon as the SeekBar's node exists, deferred a frame so the
    // native focus engine has it registered.
    const hasSetInitialFocusRef = useRef(false);
    useEffect(() => {
      if (hasSetInitialFocusRef.current || !seekBarNode) return;
      hasSetInitialFocusRef.current = true;
      const raf = requestAnimationFrame(() => {
        seekBarRef.current?.focus();
      });
      return () => cancelAnimationFrame(raf);
    }, [seekBarNode]);

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

    // Set up duration tracking. We re-read player.duration on every
    // statusChange AND timeUpdate so the value is captured as soon as the
    // player resolves it. Listening only to statusChange used to work because
    // the page remounted several times during load (re-running the effect each
    // time); with the load now stabilized, statusChange may fire only once
    // before duration is populated, which would leave `duration` at 0 and
    // hide CaptionControls + EpisodeCarousel (both gated on duration > 0)
    // and break down-navigation from the seek bar.
    useEffect(() => {
      if (player && player.duration && player.duration !== duration) {
        setDuration(player.duration);
      }
    }, [player, status, currentTime, duration]);

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

    // Register play/pause handler for TV remote
    useEffect(() => {
      registerPlayPauseHandler(handleTogglePlay);
      return () => unregisterPlayPauseHandler();
    }, [
      handleTogglePlay,
      registerPlayPauseHandler,
      unregisterPlayPauseHandler,
    ]);

    // Register seek handler for TV remote rewind/fast-forward
    useEffect(() => {
      registerSeekHandler(handleSeekBy);
      return () => unregisterSeekHandler();
    }, [handleSeekBy, registerSeekHandler, unregisterSeekHandler]);

    // Restart the current media from the beginning and resume playback. Invoked
    // after the user confirms in the restart confirmation modal.
    const handleRestart = useCallback(() => {
      if (!player) return;
      try {
        player.currentTime = 0;
        player.play();
      } catch (error) {
        console.warn("🎬 StandaloneVideoControls: Error restarting:", error);
      }
      setShowRestartConfirm(false);
      // Return focus to the SeekBar once the modal has dismissed. Deferring past
      // the dismiss avoids the native TV focus engine restoring focus to the
      // (now-unmounted) confirm button after the modal's slide-out animation.
      requestAnimationFrame(() => {
        seekBarRef.current?.focus();
      });
    }, [player]);

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
        if (
          preferredLanguage &&
          availableLanguages.includes(preferredLanguage)
        ) {
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
    }, [
      videoInfo?.captionURLs,
      selectedCaptionLanguage,
      subtitlesEnabled,
      preferredLanguage,
    ]);

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
        <Animated.View
          style={[
            controlsContainerStyle,
            {
              opacity: fadeAnim,
              maxWidth: window.width,
            },
          ]}
        >
          {/* Logo slides from its default position (top: 27%, left: 5%) to
              top-center when the episode carousel expands.

              Lifted OUT of the flex flow (specifically out of `middleSection`
              which has `flex: 1` and shrinks ~170px when the carousel
              expands). Anchored here, the logo's positioning ancestor is the
              full-screen overlay container, so `top: 27%` is a stable 27% of
              the screen and doesn't move when the carousel's height swap
              fires.

              `renderToHardwareTextureAndroid` and `shouldRasterizeIOS` tell
              the OS to rasterize the moving subtree (image + container clip)
              into one GPU texture, then translate that texture instead of
              re-running the clip + image sampler every frame. */}
          <Reanimated.View
            style={[styles.logoContainer, animatedLogoStyle]}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
          >
            {overlayMode && videoInfo?.logo ? (
              <Image
                source={{ uri: videoInfo.logo }}
                style={styles.logo}
                priority={"high"}
              />
            ) : videoInfo?.showTitle ? (
              <Text style={styles.videoTitle}>{videoInfo.showTitle}</Text>
            ) : null}
          </Reanimated.View>

          {/* Main Focus Guide for all controls. `destinations` directs initial
              focus to the SeekBar without the dynamic `hasTVPreferredFocus`
              toggle anti-pattern. */}
          <TVFocusGuideView
            autoFocus
            destinations={focusDestinations}
            style={styles.mainControlsContainer}
          >
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
                <Pressable
                  style={({ focused, pressed }) => [
                    styles.controlButton,
                    styles.infoButton,
                    focused && styles.controlButtonFocused,
                    pressed && styles.controlButtonPressed,
                  ]}
                  onPress={handleButtonPress(() => setShowRestartConfirm(true))}
                  focusable={true}
                >
                  <Ionicons
                    name="play-skip-back"
                    size={24}
                    color="rgba(255, 255, 255, 0.69)"
                  />
                </Pressable>
              </View>
              <View style={styles.topRightSection}>
                {/* Future: Content rating, quality indicators, etc. */}
              </View>
            </View>

            {/* 2. Middle Section - Primary Controls */}
            <View style={styles.middleSection}>
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

            {/* 4. Seek Bar Section - Always show, even during loading */}
            <View style={styles.seekBarSection}>
              <SeekBar
                ref={seekBarRefCallback}
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                onSeekBy={handleSeekBy}
                onTogglePlay={handleTogglePlay}
                // Native initial focus, so it does not depend on the timing of
                // the imperative requestTVFocus() effect below. Safe as a
                // STATIC true: the SeekBar is rendered unconditionally and
                // never remounts, so this applies once at mount. The
                // anti-pattern the comment near seekBarRef warns about was a
                // DYNAMIC toggle that flipped on a timer and re-stole focus.
                hasTVPreferredFocus={true}
                isPlaying={isPlaying}
                onStartSeeking={startContinuousActivity}
                onStopSeeking={stopContinuousActivity}
                playerState={playerState}
                stateMessage={
                  episodeSwitchError
                    ? `Error: ${episodeSwitchError}`
                    : undefined
                }
              />

              {/* Caption + audio controls row - only show when duration is
                  available. The outer View is a zero-height in-flow anchor
                  (its only child is absolutely positioned), so the row keeps
                  floating at the same spot between the seek bar and the
                  episode carousel that the caption row occupied before. */}
              {duration > 0 && (showCaptionControls || audioButtonVisible) && (
                <View>
                  <View style={styles.bottomControlsRow}>
                    {showCaptionControls && (
                      <CaptionControls
                        captionURLs={videoInfo?.captionURLs}
                        selectedCaptionLanguage={selectedCaptionLanguage}
                        onCaptionLanguageChange={setSelectedCaptionLanguage}
                        selectedSubtitleStyle={selectedSubtitleStyle}
                        onSubtitleStyleChange={setSelectedSubtitleStyle}
                        selectedSubtitleBackground={selectedSubtitleBackground}
                        onSubtitleBackgroundChange={
                          setSelectedSubtitleBackground
                        }
                        onActivityReset={resetActivityTimer}
                        // Trap DOWN only when there's no carousel below to
                        // navigate to.
                        trapFocusDown={trapCaptionAudioFocusDown}
                        // Let focus flow right into the audio button when
                        // it's present.
                        trapFocusRight={!audioButtonVisible}
                      />
                    )}
                    {audioButtonVisible && (
                      <AudioControls
                        audioTracks={availableAudioTracks}
                        selectedAudioTrack={selectedAudioTrack}
                        onAudioTrackChange={selectAudioTrack}
                        formatOptions={formatOptions}
                        selectedFormatGroupId={selectedFormatGroupId}
                        isAutoFormat={isAutomaticSelection}
                        canSelectAuto={supportsAutomaticSelection}
                        onSelectAuto={selectAutomatic}
                        onActivityReset={resetActivityTimer}
                        trapFocusDown={trapCaptionAudioFocusDown}
                        trapFocusLeft={!showCaptionControls}
                      />
                    )}
                  </View>
                </View>
              )}

              {/* 5. Episode Carousel Section - only show when duration is available */}
              {duration > 0 &&
                videoInfo?.type === "tv" &&
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
                          // Transfer focus back to the SeekBar imperatively.
                          // This replaces the prior 200ms `seekBarShouldFocus`
                          // toggle, which raced with user navigation.
                          seekBarRef.current?.focus();
                        }
                      }}
                      onExpandedChange={handleCarouselExpandedChange}
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
            </View>
          </TVFocusGuideView>
        </Animated.View>

        {/* Restart-from-beginning confirmation modal */}
        <Modal
          visible={showRestartConfirm}
          transparent
          animationType="slide"
          onRequestClose={() => setShowRestartConfirm(false)}
        >
          <TVFocusGuideView
            autoFocus
            trapFocusUp
            trapFocusDown
            trapFocusLeft
            trapFocusRight
            style={styles.restartModalOverlay}
          >
            <View style={styles.restartModalCard}>
              <Text style={styles.restartModalTitle}>
                Restart from beginning?
              </Text>
              <Text style={styles.restartModalMessage}>
                This will start the video over from the beginning.
              </Text>
              <View style={styles.restartModalButtons}>
                <Pressable
                  style={({ focused, pressed }) => [
                    styles.restartConfirmButton,
                    focused && styles.restartButtonFocused,
                    pressed && styles.controlButtonPressed,
                  ]}
                  onPress={handleRestart}
                  focusable
                  hasTVPreferredFocus
                  isTVSelectable
                >
                  <Text style={styles.restartButtonText}>Restart</Text>
                </Pressable>
                <Pressable
                  style={({ focused, pressed }) => [
                    styles.restartCancelButton,
                    focused && styles.restartButtonFocused,
                    pressed && styles.controlButtonPressed,
                  ]}
                  onPress={() => setShowRestartConfirm(false)}
                  focusable
                >
                  <Text style={styles.restartButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </TVFocusGuideView>
        </Modal>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  bottomControlsRow: {
    alignItems: "center",
    bottom: 20,
    flexDirection: "row",
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },

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

  restartButtonFocused: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderColor: "#FFFFFF",
  },

  restartButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  restartCancelButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 130,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },

  restartConfirmButton: {
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderColor: "transparent",
    borderRadius: 8,
    borderWidth: 2,
    minWidth: 130,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },

  restartModalButtons: {
    flexDirection: "row",
    gap: 16,
    justifyContent: "center",
  },

  restartModalCard: {
    backgroundColor: "rgba(20, 20, 20, 0.98)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 520,
    paddingHorizontal: 32,
    paddingVertical: 28,
    width: "80%",
  },

  restartModalMessage: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 16,
    marginBottom: 24,
    textAlign: "center",
  },

  restartModalOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    flex: 1,
    justifyContent: "center",
  },

  restartModalTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
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
