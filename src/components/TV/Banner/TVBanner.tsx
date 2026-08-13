import { ImageBackground } from "expo-image";
import { useIsFocused } from "expo-router/react-navigation";
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
import { navigationHelper } from "@/src/utils/navigationHelper";

interface TVBannerProps {
  style?: ViewStyle;
}

// expo-video forwards ExoPlayer's duration unconditionally, and ExoPlayer uses
// C.TIME_UNSET (Long.MIN_VALUE) for "not known yet" — which arrives here as a
// huge negative number. Anything non-finite, non-positive or implausibly long
// means "no usable duration".
function isUsableDuration(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0 && duration < 24 * 60 * 60;
}

// How long the image phase will wait for a selected clip to become playable
// before giving up and rotating on. The image -> fadeToVideo edge is driven by
// player readiness, and readiness can legitimately never arrive: the source can
// fail to load, or the status event can be missed entirely because the player
// was already ready for that URL (expo-video's statusChange is edge-triggered
// and never replayed). This bound is what makes the machine structurally unable
// to park; it should never be reached on a healthy clip.
const VIDEO_READY_TIMEOUT_MS = 10000;

// ---- DIAGNOSTICS ---------------------------------------------------------
// Flip to `__DEV__` to trace the banner state machine. Off by default: these
// fire on every phase change, status change and heartbeat, and in a
// Metro-attached build each console call is serialised over the websocket on
// the JS thread.
//
// The heartbeat below is the reason this tooling exists. A stalled banner
// emits no events, so the event log goes silent exactly when it is needed;
// polling every gate that can stall the machine is what made the freeze
// diagnosable. Filter with:
//   adb logcat -s ReactNativeJS | grep -E "BannerDbg|PlayerDbg"
const DEBUG_BANNER = __DEV__ && false;

// URLs are long and near-identical; only the tail distinguishes them.
function shortURL(url: string | null | undefined): string | null {
  if (!url) return null;
  const noQuery = url.split("?")[0];
  return `…${noQuery.slice(-28)}`;
}

function dbg(event: string, data?: Record<string, unknown>) {
  if (!DEBUG_BANNER) return;
  console.log(`[BannerDbg] ${event}${data ? " " + JSON.stringify(data) : ""}`);
}

// Banner state machine phases
type BannerPhase =
  "image" | "fadeToVideo" | "video" | "fadeToImage" | "nextSlide";

export default function TVBanner({ style }: TVBannerProps) {
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
  const phaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // All phase timers MUST go through these two helpers.
  //
  // Two independent schedulers drive this machine — advancePhase() and the
  // state-machine effect — and both used to assign phaseTimeoutRef directly.
  // Whichever wrote second orphaned the other's handle: the orphan was never
  // cleared, still fired, and advanced the phase a second time, so clips could
  // start while the previous one was still running (audio layering) and the
  // orphans multiplied every cycle. The callbacks also never reset the ref, so
  // after the first fire it stayed non-null forever, which defeats any
  // "is a timer already pending?" check.
  const clearPhaseTimeout = useCallback(() => {
    if (phaseTimeoutRef.current) {
      clearTimeout(phaseTimeoutRef.current);
      phaseTimeoutRef.current = null;
    }
  }, []);

  const schedulePhase = useCallback(
    (fn: () => void, ms: number) => {
      clearPhaseTimeout();
      phaseTimeoutRef.current = setTimeout(() => {
        phaseTimeoutRef.current = null;
        fn();
      }, ms);
    },
    [clearPhaseTimeout],
  );

  // Single opacity value for smooth transitions
  const bannerOpacity = useSharedValue(1);

  // Content opacity for fade-out during navigation
  const contentOpacity = useSharedValue(1);

  // Image opacity for image-to-video transitions
  const imageOpacity = useSharedValue(1);

  // Navigation state tracking
  const [isNavigating, setIsNavigating] = useState(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Video player state
  const [currentVideoURL, setCurrentVideoURL] = useState<string | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const videoPositionRef = useRef<number>(0);
  const fadeBackTriggeredRef = useRef<boolean>(false);

  // Live mirrors for the player event callbacks.
  //
  // The listener effect closes over currentPhase/currentVideoURL, and those
  // closures are STALE in exactly the window that matters: when the hook strips
  // the source with replaceAsync(null), the resulting `idle` event is delivered
  // to a listener registered before cleanupBanner reset the phase. Guarding
  // that event with the closure's own values is no guard at all — it saw
  // phase "fadeToVideo" and a live URL, and knocked the freshly-reset phase to
  // "fadeToImage", where the paused machine then parked with no timer.
  const currentPhaseRef = useRef(currentPhase);
  currentPhaseRef.current = currentPhase;
  const currentVideoURLRef = useRef(currentVideoURL);
  currentVideoURLRef.current = currentVideoURL;

  // Volume fade animation state
  const volumeFadeIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Banner focus state for TV remote navigation
  const bannerRef = useRef<View>(null);
  const [isBannerFocused, setIsBannerFocused] = useState(false);

  // Track volume state for focus-aware muting
  const [volumeBeforeFocusLoss, setVolumeBeforeFocusLoss] = useState<number>(1);
  const [isMutedDueToFocusLoss, setIsMutedDueToFocusLoss] = useState(false);

  // Create optimized video player instance with focus-aware resource management
  const { player, loadedSource } = useOptimizedVideoPlayer(
    currentVideoURL,
    (p) => {
      p.timeUpdateEventInterval = 0.5; // Update every 500ms for position tracking
      p.loop = false;
      p.muted = false; // Not muted, we'll control volume programmatically
      p.volume = 0; // Start with volume at 0
      p.allowsExternalPlayback = false;
    },
  );

  // Debug video URL changes
  useEffect(() => {
    dbg("URL-CHANGED", { url: shortURL(currentVideoURL), hasPlayer: !!player });
    if (currentVideoURL) {
      setIsVideoReady(false); // Reset ready state when URL changes
      fadeBackTriggeredRef.current = false; // Reset fade back trigger
    }
  }, [currentVideoURL, player]);

  // Get current banner item with type safety
  const currentBanner = useMemo(() => {
    if (!bannerData || bannerData.length === 0) return null;
    return bannerData[currentBannerIndex] as BannerItem;
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
      // 100ms, not 50ms. Every write is a JSI call that posts a main-queue
      // message, and the fewer we have in flight at once the less pressure we
      // put on the looper during MediaCodec init — which is exactly when these
      // fades run. Still imperceptible as a fade.
      const stepDuration = 100;
      const steps = duration / stepDuration;
      let currentStep = 0;

      dbg(
        `Starting volume fade from ${startVolume} to ${targetVolume} over ${duration}ms`,
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
        } catch {
          // Player was released, stop the fade
          dbg("Player released during volume fade, stopping");
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
            dbg(`Volume fade complete, final volume: ${targetVolume}`);
          } catch {
            dbg("Player released at end of volume fade");
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
        dbg("Skipping cleanup - still in browse mode and focused");
        return;
      }

      dbg("Performing comprehensive cleanup");

      // Clear all timeouts
      clearPhaseTimeout();
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
        } catch {
          // Silently handle player cleanup errors - this is expected during unmount
          dbg("Player already released during cleanup");
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

      dbg("Cleanup completed");
    },
    [
      clearPhaseTimeout,
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

    dbg("ADVANCE", { phase: currentPhase, banner: currentBanner.title });

    // Clear any existing phase timeout
    clearPhaseTimeout();

    switch (currentPhase) {
      case "image":
        if (currentBanner.clipVideoURL) {
          // Has video clip - pre-load video and wait for it to be ready
          dbg(`Banner has video clip, pre-loading video`);
          dbg("IMAGE-SELECT-CLIP", {
            url: shortURL(currentBanner.clipVideoURL),
            watchdogMs: VIDEO_READY_TIMEOUT_MS,
          });
          setCurrentVideoURL(currentBanner.clipVideoURL);

          // WATCHDOG. This phase must NEVER wait with zero pending timers.
          // Two ways that used to happen and freeze the banner permanently:
          //  - readiness arrives as an edge-triggered statusChange, and a
          //    player that is ALREADY ready for this URL emits nothing;
          //  - the setCurrentVideoURL above is a React bailout when the URL is
          //    unchanged, so nothing re-renders and no effect re-arms anything.
          // In both cases this timer is the only thing left alive. When
          // readiness does arrive the phase changes, the state-machine effect
          // re-runs, and its clearPhaseTimeout() cancels this.
          schedulePhase(() => {
            console.warn(
              `[BannerDbg] WATCHDOG-FIRED after ${VIDEO_READY_TIMEOUT_MS}ms — clip never became playable`,
              JSON.stringify(diagRef.current),
            );
            setCurrentPhase("nextSlide");
          }, VIDEO_READY_TIMEOUT_MS);
        } else {
          // No video clip - go directly to next slide
          dbg(`Banner has no video clip, going to next slide`);
          setCurrentPhase("nextSlide");
          schedulePhase(() => {
            navigateToNextBanner();
          }, 100);
        }
        break;

      case "fadeToVideo":
        // Start the 2-second fade transition and begin video playback
        dbg(`Starting 2-second fade transition to video`);
        imageOpacity.value = withTiming(0, { duration: 2000 });

        // Start video playback immediately when fade begins
        if (player && isVideoReady) {
          dbg(`Starting video playback during fade`);
          try {
            // Always start from the top. The player may already hold this exact
            // source from an earlier pass (a re-selected item, or a pass the
            // screensaver interrupted), in which case the playhead is wherever
            // it was left — often at the very end, which fires playToEnd
            // immediately and silently skips the clip. No-op for a freshly
            // loaded source.
            player.currentTime = 0;
            // Reset here too: the URL-change effect does not re-run when
            // setCurrentVideoURL bails out on an identical URL, so this flag
            // could still be true from the clip's previous play and would
            // swallow the real playToEnd.
            fadeBackTriggeredRef.current = false;
            player.volume = 0; // Ensure volume starts at 0
            player.play();
            // Only fade volume in if banner is focused
            if (isBannerFocused && !isMutedDueToFocusLoss) {
              fadeVolume(1, 2000);
            }
          } catch {
            dbg("Player released during fadeToVideo phase");
          }
        }

        // Transition to video phase after fade completes
        schedulePhase(() => {
          dbg(`Fade complete, transitioning to video phase`);
          setCurrentPhase("video");
        }, 2000);
        break;

      case "video":
        // Video phase - video is already playing, position monitoring will handle fade back
        dbg(`In video phase, monitoring video position`);
        break;

      case "fadeToImage":
        // Fade back to image
        dbg(`Starting fade back to image`);
        imageOpacity.value = withTiming(1, { duration: 2000 });

        // Fade volume out over 2 seconds (only if not already muted due to focus loss)
        if (!isMutedDueToFocusLoss) {
          fadeVolume(0, 2000);
        }

        // After fade completes, stop video and move to next slide
        schedulePhase(() => {
          dbg(
            `Fade to image complete, stopping video and moving to next slide`,
          );
          if (player) {
            try {
              player.pause();
              player.volume = 0; // Ensure volume is at 0
            } catch {
              dbg("Player released during fadeToImage phase");
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
    clearPhaseTimeout,
    schedulePhase,
    currentBanner,
    currentPhase,
    imageOpacity,
    player,
    isVideoReady,
    fadeVolume,
  ]);

  // Navigate to next banner and reset state machine
  const navigateToNextBanner = useCallback(() => {
    if (!bannerData || bannerData.length === 0) return;

    // Single item: there is nowhere to rotate to, but returning here would
    // leave the machine parked in "nextSlide" with no timer and no state
    // change — permanent, restart-only. Restart the cycle in place instead so
    // "nextSlide" always has an exit. (The clip reloads as a no-op, the level
    // check catches the already-ready player, and currentTime = 0 in
    // fadeToVideo stops it ending instantly.)
    if (bannerData.length === 1) {
      dbg(`Single banner item, restarting cycle in place`);
      clearPhaseTimeout();
      fadeBackTriggeredRef.current = false;
      videoPositionRef.current = 0;
      setIsVideoReady(false);
      setVideoDuration(0);
      setCurrentVideoURL(null);
      imageOpacity.value = 1;
      setCurrentPhase("image");
      return;
    }

    dbg(`Navigating to next banner, resetting state machine`);

    const nextIndex = (currentBannerIndex + 1) % bannerData.length;

    // Clear any existing timeouts
    clearPhaseTimeout();

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
      } catch {
        dbg("Player released during banner navigation");
      }
    }

    // Update banner index
    setCurrentBannerIndex(nextIndex);

    dbg(
      `State reset complete, new banner index: ${nextIndex}, imageOpacity reset to 1`,
    );
  }, [clearPhaseTimeout, bannerData, currentBannerIndex, imageOpacity, player]);

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
      clearPhaseTimeout();

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
        } catch {
          dbg("Player released during manual navigation");
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
    [
      clearPhaseTimeout,
      bannerData,
      currentBannerIndex,
      contentOpacity,
      imageOpacity,
      player,
    ],
  );

  // Video player event handlers
  useEffect(() => {
    if (!player) return;

    const statusListener = player.addListener("statusChange", ({ status }) => {
      dbg(
        `Video status changed to: ${status}, currentVideoURL: ${currentVideoURL}, currentPhase: ${currentPhase}`,
      );
      if (status === "readyToPlay" && currentVideoURL) {
        dbg(`Video ready to play, setting isVideoReady to true`);
        setIsVideoReady(true);

        // Ensure volume is at 0 when video becomes ready
        try {
          player.volume = 0;
        } catch {
          dbg("Player released when video became ready");
        }

        // If we're in image phase and video is now ready, start the fade transition
        if (currentPhase === "image") {
          dbg(`Video is ready, starting fade transition`);
          setCurrentPhase("fadeToVideo");
        }
      }
      // Only treat `idle` as end-of-clip when a clip was actually on screen.
      // useOptimizedVideoPlayer's cleanup() strips the source with
      // replaceAsync(null), which makes ExoPlayer clearMediaItems + prepare
      // into STATE_IDLE — the unguarded branch turned that teardown into a
      // phase change to fadeToImage behind the screensaver, where it does not
      // belong. A genuine end-of-clip arrives as playToEnd, not idle.
      // Reads the REFS, not the closure. See currentPhaseRef above: this event
      // is delivered from a subscription created before the teardown, so the
      // closure still describes the clip that was playing.
      const livePhase = currentPhaseRef.current;
      const liveURL = currentVideoURLRef.current;
      if (
        status === "idle" &&
        liveURL &&
        (livePhase === "fadeToVideo" || livePhase === "video")
      ) {
        dbg(`Video is idle mid-clip, transitioning to fadeToImage phase`);
        setCurrentPhase("fadeToImage");
      } else if (status === "idle") {
        dbg("IDLE-IGNORED", {
          livePhase,
          liveURL: shortURL(liveURL),
          closurePhase: currentPhase,
        });
      }
    });

    // Source load listener for getting proper duration.
    // ExoPlayer returns C.TIME_UNSET (Long.MIN_VALUE) until the duration is
    // actually known, and expo-video forwards that verbatim as
    // `player.duration / 1000f` — i.e. about -9.2e15. Storing that made the
    // `videoDuration > 0` guard below permanently false, so the clip never
    // advanced on its own and every rotation waited out the 60s fallback.
    const sourceLoadListener = player.addListener(
      "sourceLoad",
      ({ duration }) => {
        dbg(`Video source loaded with duration: ${duration}s`);
        setVideoDuration(isUsableDuration(duration) ? duration : 0);
      },
    );

    // Authoritative end-of-clip signal. Independent of duration entirely, so
    // it works even when the duration is never reported.
    //
    // Gated on the video phase: the player also reports playToEnd for the
    // PREVIOUS clip (and for a source being torn down) while we are still on
    // the still image, and acting on that skipped the next clip entirely.
    const endedListener = player.addListener("playToEnd", () => {
      if (currentPhase !== "video" || fadeBackTriggeredRef.current) return;
      dbg("Clip reported playToEnd, fading back to image");
      fadeBackTriggeredRef.current = true;
      setCurrentPhase("fadeToImage");
    });

    const playingListener = player.addListener(
      "playingChange",
      ({ isPlaying }) => {
        dbg(
          `Video playing state changed: ${isPlaying}, currentPhase: ${currentPhase}, isVideoReady: ${isVideoReady}`,
        );
      },
    );

    // Time update listener for position tracking
    const timeListener = player.addListener("timeUpdate", ({ currentTime }) => {
      videoPositionRef.current = currentTime;

      // Duration is usually still unknown at sourceLoad; pick it up as soon as
      // the player resolves it. Guarded so this only ever fires once per clip.
      if (!isUsableDuration(videoDuration)) {
        try {
          const resolved = player.duration;
          if (isUsableDuration(resolved)) {
            dbg(`Duration resolved late: ${resolved}s`);
            setVideoDuration(resolved);
          }
        } catch {
          // Player released; nothing to recover.
        }
      }

      // Check if we should fade back to image (2 seconds before end)
      if (
        currentPhase === "video" &&
        videoDuration > 0 &&
        currentTime >= videoDuration - 2 &&
        !fadeBackTriggeredRef.current
      ) {
        dbg(`Video is 2 seconds from end, triggering fade back to image`);
        fadeBackTriggeredRef.current = true;
        setCurrentPhase("fadeToImage");
      }
    });

    return () => {
      statusListener.remove();
      sourceLoadListener.remove();
      endedListener.remove();
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

  // LEVEL-triggered readiness, alongside the edge-triggered listener above.
  //
  // expo-video's statusChange only fires when the status CHANGES and is never
  // replayed for a listener that attaches late (VideoPlayer.setStatus emits
  // only when status != oldStatus). A player that is already `readyToPlay` for
  // the URL we just selected therefore emits nothing at all — and that listener
  // is the only image -> fadeToVideo edge, so the machine would wait for an
  // event that can never arrive.
  //
  // `loadedSource` is the source the player actually holds, published by
  // useOptimizedVideoPlayer only once replaceAsync RESOLVES. Gating on it is
  // what stops a stale, still-ready PREVIOUS clip from reading as ready for the
  // URL we only just requested.
  useEffect(() => {
    // Respect the same pause conditions as the state machine itself, or this
    // would drive phases forward while the machine is deliberately halted
    // (e.g. with the screensaver modal on top).
    if (currentMode !== "browse" || !isFocused || isNavigating) {
      dbg("LEVEL-SKIP", { reason: "machine-paused" });
      return;
    }
    if (!player || !currentVideoURL) {
      dbg("LEVEL-SKIP", { reason: !player ? "no-player" : "no-url" });
      return;
    }
    if (loadedSource !== currentVideoURL) {
      // The single most important line for diagnosing the freeze: the player
      // is not holding the clip we asked for.
      dbg("LEVEL-SKIP", {
        reason: "source-mismatch",
        want: shortURL(currentVideoURL),
        have: shortURL(loadedSource),
      });
      return;
    }

    let status: string;
    try {
      status = player.status;
    } catch {
      // Player released; the watchdog rotates us on.
      dbg("LEVEL-SKIP", { reason: "player-released" });
      return;
    }
    if (status !== "readyToPlay") {
      dbg("LEVEL-SKIP", { reason: "not-ready", status });
      return;
    }

    if (!isVideoReady) {
      dbg(
        `Player already readyToPlay for current URL (level check), phase: ${currentPhase}`,
      );
      setIsVideoReady(true);
      try {
        player.volume = 0;
      } catch {
        // Ignore; volume is re-asserted when playback starts.
      }
    }
    if (currentPhase === "image") {
      setCurrentPhase("fadeToVideo");
    }
    // No loop: once this flips to fadeToVideo it re-runs with
    // currentPhase !== "image" and isVideoReady === true, so both branches are
    // inert.
  }, [
    player,
    currentVideoURL,
    loadedSource,
    currentPhase,
    isVideoReady,
    currentMode,
    isFocused,
    isNavigating,
  ]);

  // ---- DIAGNOSTIC HEARTBEAT ---------------------------------------------
  // A frozen banner emits no events, so the only way to see WHY it is stuck is
  // to poll every gate that can stall it. `timer` is the decisive field: if the
  // machine is parked in a phase with timer:false and nothing is arriving, the
  // phase has no exit. Compare `url` against `loaded` to see whether the player
  // is actually holding the clip we asked for.
  const diagRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    // Runs on every render, so it must cost nothing when diagnostics are off.
    if (!DEBUG_BANNER) return;
    diagRef.current = {
      phase: currentPhase,
      url: shortURL(currentVideoURL),
      loaded: shortURL(loadedSource),
      ready: isVideoReady,
      focused: isFocused,
      mode: currentMode,
      nav: isNavigating,
      bannerFocused: isBannerFocused,
      idx: currentBannerIndex,
      n: bannerData?.length ?? 0,
      dur: videoDuration,
    };
  });

  useEffect(() => {
    if (!DEBUG_BANNER) return;
    const id = setInterval(() => {
      let status = "no-player";
      let playing: boolean | string = "?";
      try {
        if (player) {
          status = player.status;
          playing = player.playing;
        }
      } catch {
        status = "released";
      }
      dbg("HEARTBEAT", {
        ...diagRef.current,
        status,
        playing,
        // Read live, not at render time: this is the whole question.
        timer: phaseTimeoutRef.current !== null,
      });
    }, 2000);
    return () => clearInterval(id);
  }, [player]);

  // State machine timing effects
  useEffect(() => {
    // Only run state machine in browse mode and when screen is focused
    if (
      currentMode !== "browse" ||
      !currentBanner ||
      isNavigating ||
      !isFocused
    ) {
      dbg("SM-PAUSED", {
        reason:
          currentMode !== "browse"
            ? "mode"
            : !currentBanner
              ? "no-banner"
              : isNavigating
                ? "navigating"
                : "not-focused",
        mode: currentMode,
        focused: isFocused,
        nav: isNavigating,
        hasBanner: !!currentBanner,
        phase: currentPhase,
      });
      return;
    }

    // Reads diagRef (a ref) rather than the state directly: naming
    // currentVideoURL/loadedSource here would drag them into this effect's dep
    // array and change when the state machine re-runs. Diagnostics must not
    // alter behaviour. diagRef is refreshed by an effect declared above, so it
    // is current by the time this runs.
    dbg("SM-RUN", { ...diagRef.current });

    // Clear any existing timeout
    clearPhaseTimeout();

    switch (currentPhase) {
      case "image":
        // Show image for 3 seconds, then advance
        dbg(`Setting 3 second timeout for image phase`);
        schedulePhase(() => {
          advancePhase();
        }, 3000);
        break;

      case "fadeToVideo":
        // Call advancePhase to start the fade animation and video playback
        dbg(`In fadeToVideo phase - calling advancePhase to start transition`);
        advancePhase();
        break;

      case "video":
        dbg(`Entered video phase, isVideoReady: ${isVideoReady}`);
        // If video is ready, ensure it's playing
        if (isVideoReady && player) {
          try {
            if (player.playing === false) {
              dbg(`Video is ready but not playing, starting playback`);
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
          } catch {
            dbg("Player released during video phase");
          }
        }
        // Extended fallback timeout in case video doesn't end naturally (max 60 seconds)
        schedulePhase(() => {
          dbg(`Video fallback timeout reached (60s), moving to next slide`);
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
      clearPhaseTimeout();
    };
  }, [
    clearPhaseTimeout,
    schedulePhase,
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

  // Monitor app mode transitions for TV navigation stack behavior
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = currentMode;

    // Deliberately does NOT read isFocused: naming it here would add it to this
    // effect's deps and change when the mode-transition cleanup runs. The FOCUS
    // and HEARTBEAT lines already report focus.
    dbg("MODE", { from: prevMode, to: currentMode });

    // Cleanup when leaving browse mode to any other mode
    if (prevMode === "browse" && currentMode !== "browse") {
      dbg(
        `Leaving browse mode (${prevMode} -> ${currentMode}), triggering cleanup`,
      );
      cleanupBanner();
    }

    // Restart state machine when entering browse mode from any other mode
    if (prevMode !== "browse" && currentMode === "browse") {
      dbg(
        `Entering browse mode (${prevMode} -> ${currentMode}), preparing to restart state machine`,
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
        } catch {
          dbg("Player released during mode transition");
        }
      }

      dbg("State machine reset complete for browse mode entry");
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
    const isRisingEdge = !prevFocused && isFocused;

    // Do NOT consume a rising edge we cannot act on yet.
    //
    // The restart below is gated on currentMode === "browse", but focus comes
    // back BEFORE the mode settles: dismissing the screensaver ping-pongs the
    // mode (screensaver -> browse -> screensaver) as ScreensaverScreen unmounts
    // and BrowseLayout/TVHomePage re-assert it. Writing this unconditionally
    // burned the edge during that window, so the restart written for exactly
    // this round-trip never ran. currentMode is a dep, so holding the edge means
    // we re-evaluate the moment the mode settles.
    if (!isRisingEdge || currentMode === "browse") {
      prevFocusedRef.current = isFocused;
    }

    dbg("FOCUS", {
      from: prevFocused,
      to: isFocused,
      mode: currentMode,
      phase: currentPhase,
      willRestart: isRisingEdge && currentMode === "browse",
      // true = focus is back but the mode has not settled yet; the edge is HELD
      // and this effect will re-run when currentMode changes.
      edgeHeld: isRisingEdge && currentMode !== "browse",
    });

    // Handle focus loss - pause state machine and video
    if (prevFocused && !isFocused) {
      dbg("Screen unfocused - pausing state machine and video");

      // Clear all timeouts to pause state machine
      clearPhaseTimeout();
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
            dbg("Pausing video due to focus loss");
            player.pause();
          }
          player.volume = 0;
        } catch {
          dbg("Player released during focus loss");
        }
      }
    }

    // Handle focus gain - restart the cycle from a known-good state.
    //
    // Deliberately a full restart rather than a mid-clip resume. Resuming
    // depended on the player still holding a live, ready source, which is not
    // true after a screensaver round-trip: we came back in the `video` phase
    // with isVideoReady false, so nothing played AND the state machine armed
    // the 60s fallback — a minute of frozen banner. Since `video` occupies
    // most of the cycle, that was the usual outcome. Restarting from `image`
    // costs the remainder of a clip nobody was watching (the screen was off)
    // and always produces a fresh clip within the normal 3s image dwell.
    if (isRisingEdge && currentMode === "browse") {
      dbg("Screen focused - restarting banner cycle from image phase");

      clearPhaseTimeout();
      if (player) {
        try {
          player.pause();
          player.volume = 0;
        } catch {
          dbg("Player released during focus gain");
        }
      }

      fadeBackTriggeredRef.current = false;
      videoPositionRef.current = 0;
      setIsVideoReady(false);
      setVideoDuration(0);
      setCurrentVideoURL(null);
      imageOpacity.value = 1;
      setCurrentPhase("image");

      // Re-arm the image dwell here rather than relying on the state change
      // above to re-trigger the state-machine effect. If focus was lost DURING
      // the image dwell we are already in exactly this state, so every setter
      // above hits React's bailout, nothing re-renders, that effect never
      // re-runs — and the clearPhaseTimeout() above would have left the banner
      // frozen for good. When the phase does change, the effect re-runs and
      // schedulePhase() replaces this timer rather than racing it.
      schedulePhase(() => {
        advancePhase();
      }, 3000);
    }
  }, [
    advancePhase,
    clearPhaseTimeout,
    imageOpacity,
    isFocused,
    currentMode,
    player,
    isVideoReady,
    currentPhase,
    schedulePhase,
  ]);

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
      dbg(
        "Starting state machine: browse mode + banner data available + screen focused",
      );

      // The state machine timing effect will handle the actual start
      // We just need to ensure the conditions are met
    }
  }, [currentMode, currentBanner, currentPhase, isNavigating, isFocused]);

  // Cleanup timeouts on unmount
  // useEffect(() => {
  //   return () => {
  //     dbg("Component unmounting, performing cleanup");
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

  // Whether the (always-mounted) video layer should be visible. Replaces the
  // old conditional mount — see the note on the VideoView below.
  const isVideoLayerVisible =
    !!currentVideoURL &&
    (currentPhase === "fadeToVideo" ||
      currentPhase === "video" ||
      currentPhase === "fadeToImage");

  // Helper function to render banner content with layered video architecture
  const renderBannerContent = useCallback(
    (banner: BannerItem) => (
      <View style={styles.bannerBackground}>
        {/* Video layer (background) - positioned absolutely behind content.
            Mounted once for the component's lifetime and hidden with opacity,
            NEVER unmounted per phase. expo-video's native VideoView does not
            detach itself from its player when destroyed: OnViewDestroys only
            calls VideoManager.unregisterVideoView, while removeListener and
            onVideoPlayerDetachedFromView live in the `player` prop setter and
            so never run. VideoManager keeps a strong map of player -> views,
            so every unmounted view stayed alive, still registered as a
            listener, and still received onTracksChanged / onVideoSourceLoaded
            on each replaceAsync — one leaked view and PlayerView tree per
            banner cycle, forever. */}
        {player ? (
          <VideoView
            style={[
              styles.videoLayer,
              { opacity: isVideoLayerVisible ? 1 : 0 },
            ]}
            player={player}
            fullscreenOptions={{ enable: false }}
            allowsPictureInPicture={false}
            nativeControls={false}
          />
        ) : null}

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
      isVideoLayerVisible,
      player,
      animatedImageStyle,
      animatedContentStyle,
    ],
  );

  // Handle banner press
  const handleBannerPress = useCallback(() => {
    if (!currentBanner) return;

    // Navigate to media info page for the banner item
    navigationHelper.navigateToMediaInfo({
      id: currentBanner.id,
      type: currentBanner.type,
    });
  }, [currentBanner]);

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
        dbg("Banner gained focus - restoring volume");
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
            dbg("Banner lost focus - fading out volume");
            setVolumeBeforeFocusLoss(player.volume);
            setIsMutedDueToFocusLoss(true);

            // Fade volume out over 500ms
            fadeVolume(0, 500);
          }
        } catch {
          dbg("Player released during banner focus loss");
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
