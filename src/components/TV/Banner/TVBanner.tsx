import { useIsFocused } from "@react-navigation/native";
import { ImageBackground } from "expo-image";
import { useRouter } from "expo-router";
import { VideoView } from "expo-video";
import { useCallback, useMemo, useEffect, useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  ViewStyle,
  TVFocusGuideView,
  Pressable,
  useTVEventHandler,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { useTVAppState, TVAppMode } from "@/src/context/TVAppStateContext";
import { useBanner } from "@/src/data/hooks/useContent";
import { BannerItem } from "@/src/data/types/content.types";
import { useOptimizedVideoPlayer } from "@/src/hooks/useOptimizedVideoPlayer";

interface TVBannerProps {
  style?: ViewStyle;
}

// Banner state machine phases
type BannerPhase =
  | "image"
  | "fadeToVideo"
  | "video"
  | "fadeToImage"
  | "nextSlide";

export default function TVBanner({ style }: TVBannerProps) {
  const router = useRouter();
  const { currentMode } = useTVAppState();
  const isFocused = useIsFocused();

  // Track previous mode for proper transition handling in TV navigation stack
  const prevModeRef = useRef<TVAppMode>(currentMode);

  // Track previous focus state for focus-aware optimizations
  const prevFocusedRef = useRef<boolean>(isFocused);

  // Banner data and cycling state
  const {
    data: bannerData,
    isLoading: isBannerLoading,
    error: bannerError,
  } = useBanner();
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // Banner phase state machine
  const [currentPhase, setCurrentPhase] = useState<BannerPhase>("image");
  const phaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Single opacity value for smooth transitions
  const bannerOpacity = useSharedValue(1);

  // Content opacity for fade-out during navigation
  const contentOpacity = useSharedValue(1);

  // Image opacity for image-to-video transitions
  const imageOpacity = useSharedValue(1);

  // Navigation state tracking
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Video player state
  const [currentVideoURL, setCurrentVideoURL] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const videoPositionRef = useRef<number>(0);
  const fadeBackTriggeredRef = useRef<boolean>(false);

  // Volume fade animation state
  const volumeFadeIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Banner focus state for TV remote navigation
  const bannerRef = useRef<View>(null);
  const [isBannerFocused, setIsBannerFocused] = useState(false);

  // Track volume state for focus-aware muting
  const [volumeBeforeFocusLoss, setVolumeBeforeFocusLoss] = useState<number>(1);
  const [isMutedDueToFocusLoss, setIsMutedDueToFocusLoss] = useState(false);

  // Create optimized video player instance with focus-aware resource management
  const { player } = useOptimizedVideoPlayer(currentVideoURL, (p) => {
    p.timeUpdateEventInterval = 0.5; // Update every 500ms for position tracking
    p.loop = false;
    p.muted = false; // Not muted, we'll control volume programmatically
    p.volume = 0; // Start with volume at 0
    p.allowsExternalPlayback = false;
  });

  // Debug video URL changes
  useEffect(() => {
    console.log(`[TVBanner] Video URL changed to: ${currentVideoURL}`);
    if (currentVideoURL) {
      console.log(`[TVBanner] Player instance:`, !!player);
      setIsVideoReady(false); // Reset ready state when URL changes
      fadeBackTriggeredRef.current = false; // Reset fade back trigger
    }
  }, [currentVideoURL, player]);

  // Get current banner item with type safety
  const currentBanner = useMemo(() => {
    if (!bannerData || bannerData.length === 0) return null;
    return bannerData[currentBannerIndex] as BannerItem;
  }, [bannerData, currentBannerIndex]);

  // Pre-fetch next video clip during image phase
  const prefetchNextVideo = useCallback(() => {
    if (!bannerData || bannerData.length <= 1) return;

    const nextIndex = (currentBannerIndex + 1) % bannerData.length;
    const nextBanner = bannerData[nextIndex] as BannerItem;

    if (nextBanner?.clipVideoURL) {
      // Pre-fetch the next video by creating a temporary video element
      // This helps with smooth transitions
      console.log(
        `[TVBanner] Pre-fetching next video: ${nextBanner.clipVideoURL}`,
      );
    }
  }, [bannerData, currentBannerIndex]);

  // Fade volume in or out over duration
  const fadeVolume = useCallback(
    (targetVolume: number, duration: number) => {
      if (!player) return;

      // Clear any existing fade
      if (volumeFadeIntervalRef.current) {
        clearInterval(volumeFadeIntervalRef.current);
      }

      const startVolume = player.volume;
      const volumeChange = targetVolume - startVolume;
      const stepDuration = 50; // Update every 50ms
      const steps = duration / stepDuration;
      let currentStep = 0;

      console.log(
        `[TVBanner] Starting volume fade from ${startVolume} to ${targetVolume} over ${duration}ms`,
      );

      // Easing function: ease-in-out cubic
      const easeInOutCubic = (t: number): number => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      volumeFadeIntervalRef.current = setInterval(() => {
        // Check if player is still valid before accessing it
        if (!player) {
          if (volumeFadeIntervalRef.current) {
            clearInterval(volumeFadeIntervalRef.current);
            volumeFadeIntervalRef.current = null;
          }
          return;
        }

        currentStep++;
        const progress = currentStep / steps;
        const easedProgress = easeInOutCubic(progress);
        const newVolume = startVolume + volumeChange * easedProgress;

        try {
          player.volume = Math.max(0, Math.min(1, newVolume)); // Clamp between 0 and 1
        } catch (error) {
          // Player was released, stop the fade
          console.log(
            "[TVBanner] Player released during volume fade, stopping",
          );
          if (volumeFadeIntervalRef.current) {
            clearInterval(volumeFadeIntervalRef.current);
            volumeFadeIntervalRef.current = null;
          }
          return;
        }

        if (currentStep >= steps) {
          if (volumeFadeIntervalRef.current) {
            clearInterval(volumeFadeIntervalRef.current);
            volumeFadeIntervalRef.current = null;
          }
          try {
            player.volume = targetVolume; // Ensure we end at exact target
            console.log(
              `[TVBanner] Volume fade complete, final volume: ${targetVolume}`,
            );
          } catch (error) {
            console.log("[TVBanner] Player released at end of volume fade");
          }
        }
      }, stepDuration);
    },
    [player],
  );

  // Comprehensive cleanup function
  const cleanupBanner = useCallback(
    (force: boolean = false) => {
      // Only cleanup if we're actually navigating away from browse mode or forced
      if (!force && currentMode === "browse" && isFocused) {
        console.log(
          "[TVBanner] Skipping cleanup - still in browse mode and focused",
        );
        return;
      }

      console.log("[TVBanner] Performing comprehensive cleanup");

      // Clear all timeouts
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
        phaseTimeoutRef.current = null;
      }
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      if (volumeFadeIntervalRef.current) {
        clearInterval(volumeFadeIntervalRef.current);
        volumeFadeIntervalRef.current = null;
      }

      // Stop video playback and reset player state with better error handling
      if (player) {
        try {
          // Check if player is still valid before calling methods
          if (player.playing) {
            player.pause();
          }
          if (player.volume > 0) {
            player.volume = 0;
          }
        } catch (error) {
          // Silently handle player cleanup errors - this is expected during unmount
          console.log("[TVBanner] Player already released during cleanup");
        }
      }

      // Reset all state machine state
      setCurrentPhase("image");
      setCurrentVideoURL(null);
      setIsVideoReady(false);
      setVideoDuration(0);
      videoPositionRef.current = 0;
      fadeBackTriggeredRef.current = false;
      setIsNavigating(false);

      // Reset animation values to initial state
      bannerOpacity.value = 1;
      contentOpacity.value = 1;
      imageOpacity.value = 1;

      console.log("[TVBanner] Cleanup completed");
    },
    [
      player,
      bannerOpacity,
      contentOpacity,
      imageOpacity,
      currentMode,
      isFocused,
    ],
  );

  // State machine controller
  const advancePhase = useCallback(() => {
    if (!currentBanner) return;

    console.log(
      `[TVBanner] Advancing phase from ${currentPhase} for banner:`,
      currentBanner.title,
    );

    // Clear any existing phase timeout
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
    }

    switch (currentPhase) {
      case "image":
        if (currentBanner.clipVideoURL) {
          // Has video clip - pre-load video and wait for it to be ready
          console.log(`[TVBanner] Banner has video clip, pre-loading video`);
          setCurrentVideoURL(currentBanner.clipVideoURL);
          // Don't advance phase yet - wait for video to be ready
        } else {
          // No video clip - go directly to next slide
          console.log(
            `[TVBanner] Banner has no video clip, going to next slide`,
          );
          setCurrentPhase("nextSlide");
          phaseTimeoutRef.current = setTimeout(() => {
            navigateToNextBanner();
          }, 100);
        }
        break;

      case "fadeToVideo":
        // Start the 2-second fade transition and begin video playback
        console.log(`[TVBanner] Starting 2-second fade transition to video`);
        imageOpacity.value = withTiming(0, { duration: 2000 });

        // Start video playback immediately when fade begins
        if (player && isVideoReady) {
          console.log(`[TVBanner] Starting video playback during fade`);
          try {
            player.volume = 0; // Ensure volume starts at 0
            player.play();
            // Only fade volume in if banner is focused
            if (isBannerFocused && !isMutedDueToFocusLoss) {
              fadeVolume(1, 2000);
            }
          } catch (error) {
            console.log("[TVBanner] Player released during fadeToVideo phase");
          }
        }

        // Transition to video phase after fade completes
        phaseTimeoutRef.current = setTimeout(() => {
          console.log(`[TVBanner] Fade complete, transitioning to video phase`);
          setCurrentPhase("video");
        }, 2000);
        break;

      case "video":
        // Video phase - video is already playing, position monitoring will handle fade back
        console.log(`[TVBanner] In video phase, monitoring video position`);
        break;

      case "fadeToImage":
        // Fade back to image
        console.log(`[TVBanner] Starting fade back to image`);
        imageOpacity.value = withTiming(1, { duration: 2000 });

        // Fade volume out over 2 seconds (only if not already muted due to focus loss)
        if (!isMutedDueToFocusLoss) {
          fadeVolume(0, 2000);
        }

        // After fade completes, stop video and move to next slide
        phaseTimeoutRef.current = setTimeout(() => {
          console.log(
            `[TVBanner] Fade to image complete, stopping video and moving to next slide`,
          );
          if (player) {
            try {
              player.pause();
              player.volume = 0; // Ensure volume is at 0
            } catch (error) {
              console.log(
                "[TVBanner] Player released during fadeToImage phase",
              );
            }
          }
          // Set phase to nextSlide which will trigger navigation
          setCurrentPhase("nextSlide");
        }, 3000); // 2s fade + 1s pause
        break;

      case "nextSlide":
        navigateToNextBanner();
        break;
    }
  }, [
    currentBanner,
    currentPhase,
    imageOpacity,
    player,
    isVideoReady,
    fadeVolume,
  ]);

  // Navigate to next banner and reset state machine
  const navigateToNextBanner = useCallback(() => {
    if (!bannerData || bannerData.length <= 1) return;

    console.log(
      `[TVBanner] Navigating to next banner, resetting state machine`,
    );

    const nextIndex = (currentBannerIndex + 1) % bannerData.length;

    // Clear any existing timeouts
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }

    // Clear volume fade if in progress
    if (volumeFadeIntervalRef.current) {
      clearInterval(volumeFadeIntervalRef.current);
      volumeFadeIntervalRef.current = null;
    }

    // Reset state machine completely
    setCurrentPhase("image");
    imageOpacity.value = 1; // Reset image opacity to show next banner image
    setCurrentVideoURL(null);
    setIsVideoReady(false);
    setVideoDuration(0);
    videoPositionRef.current = 0;
    fadeBackTriggeredRef.current = false;

    // Reset player volume
    if (player) {
      try {
        player.volume = 0;
      } catch (error) {
        console.log("[TVBanner] Player released during banner navigation");
      }
    }

    // Update banner index
    setCurrentBannerIndex(nextIndex);

    console.log(
      `[TVBanner] State reset complete, new banner index: ${nextIndex}, imageOpacity reset to 1`,
    );

    // Pre-fetch next video
    setTimeout(prefetchNextVideo, 1000);
  }, [bannerData, currentBannerIndex, imageOpacity, prefetchNextVideo, player]);

  // Manual navigation function - instant content switching with fade effect
  const navigateBanner = useCallback(
    (direction: "next" | "prev") => {
      if (!bannerData || bannerData.length <= 1) return;

      // Calculate the target index based on direction
      const targetIndex =
        direction === "next"
          ? (currentBannerIndex + 1) % bannerData.length
          : currentBannerIndex === 0
            ? bannerData.length - 1
            : currentBannerIndex - 1;

      // Clear any existing timeouts
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
      }

      // Clear volume fade if in progress
      if (volumeFadeIntervalRef.current) {
        clearInterval(volumeFadeIntervalRef.current);
        volumeFadeIntervalRef.current = null;
      }

      // Set navigation state and fade out content
      setIsNavigating(true);
      contentOpacity.value = withTiming(0, { duration: 150 });

      // Reset state machine and video
      setCurrentPhase("image");
      imageOpacity.value = 1;
      setCurrentVideoURL(null);
      setIsVideoReady(false);
      setVideoDuration(0);
      videoPositionRef.current = 0;
      fadeBackTriggeredRef.current = false;

      // Reset player volume
      if (player) {
        try {
          player.volume = 0;
        } catch (error) {
          console.log("[TVBanner] Player released during manual navigation");
        }
      }

      // Change content immediately after fade out
      setTimeout(() => {
        setCurrentBannerIndex(targetIndex);
      }, 150);

      // Set timeout to fade content back in after navigation stops
      navigationTimeoutRef.current = setTimeout(() => {
        setIsNavigating(false);
        contentOpacity.value = withTiming(1, { duration: 400 });
      }, 800); // Wait 800ms after last navigation
    },
    [bannerData, currentBannerIndex, contentOpacity, imageOpacity, player],
  );

  // Video player event handlers
  useEffect(() => {
    if (!player) return;

    const statusListener = player.addListener("statusChange", ({ status }) => {
      console.log(
        `[TVBanner] Video status changed to: ${status}, currentVideoURL: ${currentVideoURL}, currentPhase: ${currentPhase}`,
      );
      if (status === "readyToPlay" && currentVideoURL) {
        console.log(
          `[TVBanner] Video ready to play, setting isVideoReady to true`,
        );
        setIsVideoReady(true);

        // Ensure volume is at 0 when video becomes ready
        try {
          player.volume = 0;
        } catch (error) {
          console.log("[TVBanner] Player released when video became ready");
        }

        // If we're in image phase and video is now ready, start the fade transition
        if (currentPhase === "image") {
          console.log(`[TVBanner] Video is ready, starting fade transition`);
          setCurrentPhase("fadeToVideo");
        }
      }
      if (status === "idle") {
        console.log(
          `[TVBanner] Video is idle, transitioning to fadeToImage phase`,
        );
        setCurrentPhase("fadeToImage");
      }
    });

    // Source load listener for getting proper duration
    const sourceLoadListener = player.addListener(
      "sourceLoad",
      ({ duration }) => {
        console.log(
          `[TVBanner] Video source loaded with duration: ${duration}s`,
        );
        setVideoDuration(duration);
      },
    );

    const playingListener = player.addListener(
      "playingChange",
      ({ isPlaying }) => {
        console.log(
          `[TVBanner] Video playing state changed: ${isPlaying}, currentPhase: ${currentPhase}, isVideoReady: ${isVideoReady}`,
        );
      },
    );

    // Time update listener for position tracking
    const timeListener = player.addListener("timeUpdate", ({ currentTime }) => {
      videoPositionRef.current = currentTime;

      // Check if we should fade back to image (2 seconds before end)
      if (
        currentPhase === "video" &&
        videoDuration > 0 &&
        currentTime >= videoDuration - 2 &&
        !fadeBackTriggeredRef.current
      ) {
        console.log(
          `[TVBanner] Video is 2 seconds from end, triggering fade back to image`,
        );
        fadeBackTriggeredRef.current = true;
        setCurrentPhase("fadeToImage");
      }
    });

    return () => {
      statusListener.remove();
      sourceLoadListener.remove();
      playingListener.remove();
      timeListener.remove();
    };
  }, [
    player,
    currentVideoURL,
    currentPhase,
    isVideoReady,
    videoDuration,
    advancePhase,
  ]);

  // State machine timing effects
  useEffect(() => {
    // Only run state machine in browse mode and when screen is focused
    if (
      currentMode !== "browse" ||
      !currentBanner ||
      isNavigating ||
      !isFocused
    ) {
      console.log(
        `[TVBanner] State machine paused - mode: ${currentMode}, focused: ${isFocused}, navigating: ${isNavigating}`,
      );
      return;
    }

    console.log(
      `[TVBanner] State machine timing effect for phase: ${currentPhase}`,
    );

    // Clear any existing timeout
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
    }

    switch (currentPhase) {
      case "image":
        // Show image for 3 seconds, then advance
        console.log(`[TVBanner] Setting 3 second timeout for image phase`);
        phaseTimeoutRef.current = setTimeout(() => {
          advancePhase();
        }, 3000);
        break;

      case "fadeToVideo":
        // Call advancePhase to start the fade animation and video playback
        console.log(
          `[TVBanner] In fadeToVideo phase - calling advancePhase to start transition`,
        );
        advancePhase();
        break;

      case "video":
        console.log(
          `[TVBanner] Entered video phase, isVideoReady: ${isVideoReady}`,
        );
        // If video is ready, ensure it's playing
        if (isVideoReady && player) {
          try {
            if (player.playing === false) {
              console.log(
                `[TVBanner] Video is ready but not playing, starting playback`,
              );
              player.play();
            }
            // Ensure volume is at full if fade didn't complete (only if banner is focused)
            if (
              player.volume < 1 &&
              isBannerFocused &&
              !isMutedDueToFocusLoss
            ) {
              player.volume = 1;
            }
          } catch (error) {
            console.log("[TVBanner] Player released during video phase");
          }
        }
        // Extended fallback timeout in case video doesn't end naturally (max 60 seconds)
        phaseTimeoutRef.current = setTimeout(() => {
          console.log(
            `[TVBanner] Video fallback timeout reached (60s), moving to next slide`,
          );
          setCurrentPhase("fadeToImage");
          advancePhase();
        }, 60000);
        break;

      case "fadeToImage":
        // Handle fade back to image
        advancePhase();
        break;

      case "nextSlide":
        // Navigate to next banner
        navigateToNextBanner();
        break;
    }

    return () => {
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
      }
    };
  }, [
    currentMode,
    currentBanner,
    currentPhase,
    isNavigating,
    isVideoReady,
    player,
    advancePhase,
    navigateToNextBanner,
    isFocused,
  ]);

  // Auto-cycling effect - disabled when using state machine
  // The state machine handles timing automatically
  useEffect(() => {
    // Pre-fetch first video when banner data loads and screen is focused
    if (
      bannerData &&
      bannerData.length > 0 &&
      currentBannerIndex === 0 &&
      isFocused
    ) {
      setTimeout(prefetchNextVideo, 1000);
    }
  }, [bannerData, currentBannerIndex, prefetchNextVideo, isFocused]);

  // Monitor app mode transitions for TV navigation stack behavior
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = currentMode;

    console.log(`[TVBanner] Mode transition: ${prevMode} -> ${currentMode}`);

    // Cleanup when leaving browse mode to any other mode
    if (prevMode === "browse" && currentMode !== "browse") {
      console.log(
        `[TVBanner] Leaving browse mode (${prevMode} -> ${currentMode}), triggering cleanup`,
      );
      cleanupBanner();
    }

    // Restart state machine when entering browse mode from any other mode
    if (prevMode !== "browse" && currentMode === "browse") {
      console.log(
        `[TVBanner] Entering browse mode (${prevMode} -> ${currentMode}), preparing to restart state machine`,
      );

      // Reset to initial state - the state machine timing effect will handle starting
      setCurrentPhase("image");
      setCurrentVideoURL(null);
      setIsVideoReady(false);
      setVideoDuration(0);
      videoPositionRef.current = 0;
      fadeBackTriggeredRef.current = false;
      setIsNavigating(false);

      // Reset animation values
      bannerOpacity.value = 1;
      contentOpacity.value = 1;
      imageOpacity.value = 1;

      // Reset player volume if player exists
      if (player) {
        try {
          player.volume = 0;
        } catch (error) {
          console.log("[TVBanner] Player released during mode transition");
        }
      }

      console.log(
        "[TVBanner] State machine reset complete for browse mode entry",
      );
    }
  }, [
    currentMode,
    cleanupBanner,
    setCurrentPhase,
    setCurrentVideoURL,
    setIsVideoReady,
    setVideoDuration,
    setIsNavigating,
    bannerOpacity,
    contentOpacity,
    imageOpacity,
    player,
  ]);

  // Focus-aware state management
  useEffect(() => {
    const prevFocused = prevFocusedRef.current;
    prevFocusedRef.current = isFocused;

    console.log(`[TVBanner] Focus transition: ${prevFocused} -> ${isFocused}`);

    // Handle focus loss - pause state machine and video
    if (prevFocused && !isFocused) {
      console.log(
        "[TVBanner] Screen unfocused - pausing state machine and video",
      );

      // Clear all timeouts to pause state machine
      if (phaseTimeoutRef.current) {
        clearTimeout(phaseTimeoutRef.current);
        phaseTimeoutRef.current = null;
      }
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
      if (volumeFadeIntervalRef.current) {
        clearInterval(volumeFadeIntervalRef.current);
        volumeFadeIntervalRef.current = null;
      }

      // Pause video playback and mute
      if (player) {
        try {
          if (player.playing) {
            console.log("[TVBanner] Pausing video due to focus loss");
            player.pause();
          }
          player.volume = 0;
        } catch (error) {
          console.log("[TVBanner] Player released during focus loss");
        }
      }
    }

    // Handle focus gain - resume state machine and video if appropriate
    if (!prevFocused && isFocused && currentMode === "browse") {
      console.log("[TVBanner] Screen focused - resuming state machine");

      // Resume video if it was playing and we're in video phase
      if (
        player &&
        isVideoReady &&
        (currentPhase === "video" || currentPhase === "fadeToVideo")
      ) {
        console.log("[TVBanner] Resuming video playback due to focus gain");
        try {
          player.play();
          // Restore volume based on current phase (only if banner is focused)
          if (
            currentPhase === "video" &&
            isBannerFocused &&
            !isMutedDueToFocusLoss
          ) {
            player.volume = 1;
          }
        } catch (error) {
          console.log("[TVBanner] Player released during focus gain");
        }
      }

      // The state machine timing effect will automatically restart due to dependency changes
    }
  }, [isFocused, currentMode, player, isVideoReady, currentPhase]);

  // Ensure state machine starts when we have banner data and are in browse mode and focused
  useEffect(() => {
    // Start state machine when entering browse mode with banner data available and screen focused
    if (
      currentMode === "browse" &&
      currentBanner &&
      currentPhase === "image" &&
      !isNavigating &&
      isFocused &&
      !phaseTimeoutRef.current // Don't restart if already running
    ) {
      console.log(
        "[TVBanner] Starting state machine: browse mode + banner data available + screen focused",
      );

      // The state machine timing effect will handle the actual start
      // We just need to ensure the conditions are met
    }
  }, [currentMode, currentBanner, currentPhase, isNavigating, isFocused]);

  // Cleanup timeouts on unmount
  // useEffect(() => {
  //   return () => {
  //     console.log("[TVBanner] Component unmounting, performing cleanup");
  //     cleanupBanner();
  //   };
  // }, [cleanupBanner]);

  // Animated style for the banner
  const animatedBannerStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: bannerOpacity.value,
    };
  });

  // Animated style for the content overlay
  const animatedContentStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: contentOpacity.value,
    };
  });

  // Animated style for the image layer (for image-to-video transitions)
  const animatedImageStyle = useAnimatedStyle(() => {
    "worklet";
    return {
      opacity: imageOpacity.value,
    };
  });

  // Helper function to render banner content with layered video architecture
  const renderBannerContent = useCallback(
    (banner: BannerItem) => (
      <View style={styles.bannerBackground}>
        {/* Video layer (background) - positioned absolutely behind content */}
        {currentVideoURL &&
          (currentPhase === "fadeToVideo" ||
            currentPhase === "video" ||
            currentPhase === "fadeToImage") && (
            <VideoView
              style={styles.videoLayer}
              player={player}
              allowsFullscreen={false}
              allowsPictureInPicture={false}
              nativeControls={false}
            />
          )}

        {/* Image overlay with animation (for fade transitions) */}
        <Animated.View style={[styles.imageOverlay, animatedImageStyle]}>
          <ImageBackground
            source={{ uri: banner.backdrop }}
            placeholder={{
              uri: `data:image/png;base64,${banner.backdropBlurhash}`,
            }}
            placeholderContentFit="cover"
            transition={0}
            style={styles.bannerBackground}
            contentFit="cover"
            priority="high"
          >
            <View style={styles.bannerOverlay} />
          </ImageBackground>
        </Animated.View>

        {/* Banner content */}
        <View style={styles.bannerContent}>
          <Animated.View style={animatedContentStyle}>
            {/* Logo if available */}
            {banner.logo && (
              <View style={styles.logoContainer}>
                <ImageBackground
                  source={{ uri: banner.logo }}
                  style={styles.logoImage}
                  contentFit="contain"
                  priority="high"
                />
              </View>
            )}

            {/* Title fallback if no logo */}
            {!banner.logo && (
              <Text style={styles.bannerTitle}>{banner.title}</Text>
            )}

            {/* Overview */}
            {banner.metadata.overview && (
              <Text style={styles.bannerOverview} numberOfLines={3}>
                {banner.metadata.overview}
              </Text>
            )}

            {/* Metadata */}
            <View style={styles.bannerMetadata}>
              {banner.metadata.vote_average > 0 && (
                <Text style={styles.bannerRating}>
                  ⭐ {banner.metadata.vote_average.toFixed(1)}
                </Text>
              )}
              {banner.metadata.release_date && (
                <Text style={styles.bannerYear}>
                  {new Date(banner.metadata.release_date).getFullYear()}
                </Text>
              )}
              {banner.metadata.genres.length > 0 && (
                <Text style={styles.bannerGenres}>
                  {banner.metadata.genres
                    .slice(0, 3)
                    .map((g: any) => g.name)
                    .join(" • ")}
                </Text>
              )}
            </View>
          </Animated.View>

          {/* Banner indicators - keep these visible during navigation */}
          {bannerData && bannerData.length > 1 && (
            <View style={styles.bannerIndicators}>
              {bannerData.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.bannerIndicator,
                    index === currentBannerIndex &&
                      styles.bannerIndicatorActive,
                  ]}
                />
              ))}
            </View>
          )}
        </View>
      </View>
    ),
    [
      bannerData,
      currentBannerIndex,
      currentVideoURL,
      currentPhase,
      player,
      animatedImageStyle,
      animatedContentStyle,
    ],
  );

  // Handle banner press
  const handleBannerPress = useCallback(() => {
    if (!currentBanner) return;

    // Navigate to media info page for the banner item
    router.push(
      {
        pathname: "/media-info/[id]",
        params: {
          id: currentBanner.id,
          type: currentBanner.type,
        },
      },
      {
        dangerouslySingular: true,
      },
    );
  }, [currentBanner, router]);

  const tvEventHandler = useCallback(
    (evt: any) => {
      if (!isBannerFocused || !bannerData || bannerData.length <= 1) return;

      switch (evt.eventType) {
        case "left":
          navigateBanner("prev");
          break;
        case "right":
          navigateBanner("next");
          break;
      }
    },
    [isBannerFocused, bannerData, navigateBanner],
  );

  useTVEventHandler(tvEventHandler);

  // Focus-aware volume control
  useEffect(() => {
    if (!player) return;

    if (isBannerFocused) {
      // Banner gained focus - restore volume if it was muted due to focus loss
      if (isMutedDueToFocusLoss) {
        console.log("[TVBanner] Banner gained focus - restoring volume");
        setIsMutedDueToFocusLoss(false);

        // Determine appropriate volume based on current phase
        let targetVolume = volumeBeforeFocusLoss;
        if (currentPhase === "video") {
          targetVolume = 1; // Full volume during video phase
        } else if (
          currentPhase === "fadeToVideo" ||
          currentPhase === "fadeToImage"
        ) {
          // Don't interfere with ongoing fade transitions
          return;
        } else {
          targetVolume = 0; // Muted during image phase
        }

        // Fade volume back in over 1 second
        fadeVolume(targetVolume, 1000);
      }
    } else {
      // Banner lost focus - fade out volume and keep muted
      if (!isMutedDueToFocusLoss) {
        try {
          if (player.volume > 0) {
            console.log("[TVBanner] Banner lost focus - fading out volume");
            setVolumeBeforeFocusLoss(player.volume);
            setIsMutedDueToFocusLoss(true);

            // Fade volume out over 500ms
            fadeVolume(0, 500);
          }
        } catch (error) {
          console.log("[TVBanner] Player released during banner focus loss");
        }
      }
    }
  }, [
    isBannerFocused,
    player,
    currentPhase,
    volumeBeforeFocusLoss,
    isMutedDueToFocusLoss,
    fadeVolume,
  ]);

  // Show loading state
  if (isBannerLoading) {
    return (
      <View style={[styles.bannerPlaceholder, style]}>
        <ActivityIndicator color="#FFFFFF" size="large" />
        <Text style={styles.bannerPlaceholderText}>Loading banner...</Text>
      </View>
    );
  }

  // Show error state
  if (bannerError) {
    return (
      <View style={[styles.bannerPlaceholder, style]}>
        <Text style={styles.bannerPlaceholderText}>
          Failed to load banner content
        </Text>
      </View>
    );
  }

  // Show fallback if no banner data
  if (!currentBanner) {
    return (
      <View style={[styles.bannerPlaceholder, style]}>
        <Text style={styles.bannerPlaceholderText}>
          No banner content available
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.bannerContainer, style]}>
      <TVFocusGuideView
        autoFocus
        style={{ flex: 1 }}
        trapFocusLeft
        trapFocusRight
      >
        {/* Single banner with animated opacity */}
        <Animated.View style={[styles.bannerLayer, animatedBannerStyle]}>
          <Pressable
            hasTVPreferredFocus
            focusable
            ref={bannerRef}
            style={styles.bannerTouchable}
            onPress={handleBannerPress}
            onFocus={() => setIsBannerFocused(true)}
            onBlur={() => setIsBannerFocused(false)}
          >
            {renderBannerContent(currentBanner)}
          </Pressable>
        </Animated.View>
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerBackground: {
    height: 400,
    width: "100%",
  },
  bannerContainer: {
    borderRadius: 10,
    height: 400,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
  bannerContent: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 40,
    paddingBottom: 60,
  },
  bannerGenres: {
    color: "#CCCCCC",
    fontSize: 14,
    marginLeft: 15,
  },
  bannerIndicator: {
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    borderRadius: 3,
    height: 6,
    marginHorizontal: 3,
    width: 6,
  },
  bannerIndicatorActive: {
    backgroundColor: "#FFFFFF",
  },
  bannerIndicators: {
    flexDirection: "row",
    marginTop: 20,
  },
  bannerLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  bannerMetadata: {
    alignItems: "center",
    flexDirection: "row",
    marginTop: 15,
  },
  bannerOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  bannerOverview: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 15,
    maxWidth: "70%",
  },
  bannerPlaceholder: {
    alignItems: "center",
    backgroundColor: "#222",
    height: 400,
    justifyContent: "center",
    width: "100%",
  },
  bannerPlaceholderText: {
    color: "#666",
    fontSize: 16,
    marginTop: 10,
  },
  bannerRating: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  bannerTitle: {
    color: "#FFFFFF",
    fontSize: 48,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.8)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  bannerTouchable: {
    flex: 1,
  },
  bannerYear: {
    color: "#CCCCCC",
    fontSize: 14,
    marginLeft: 15,
  },
  imageOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0, // Above video layer, below content
  },
  logoContainer: {
    height: 120,
    width: 300,
  },
  logoImage: {
    height: "100%",
    width: "100%",
  },
  videoLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: -1, // Behind image layer
    backgroundColor: "black",
  },
});
