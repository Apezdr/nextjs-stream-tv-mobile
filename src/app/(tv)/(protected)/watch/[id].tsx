// src/app/(tv)/(protected)/watch/[id].tsx
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  BufferOptions,
  useVideoPlayer,
  VideoPlayer,
  VideoView,
} from "expo-video";
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useTransition,
} from "react";
import { View, StyleSheet, Text, BackHandler, Pressable } from "react-native";

import StandaloneVideoControls from "@/src/components/Video/StandaloneVideoControls";
import { Colors } from "@/src/constants/Colors";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useAudioFallback } from "@/src/data/hooks/useAudioFallback";
import { useVideoErrorHandling } from "@/src/data/hooks/useVideoErrorHandling";
import { setWatchMode, tvQueryHelpers } from "@/src/data/query/queryClient";
import {
  contentService,
  PlaybackUpdateRequest,
} from "@/src/data/services/contentService";
import {
  MediaDetailsResponse,
  TVDeviceEpisode,
} from "@/src/data/types/content.types";
import { backdropManager } from "@/src/utils/BackdropManager";

function parseNumericParam(value: string | undefined): number | undefined {
  if (!value || value === "") return undefined;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? undefined : parsed;
}

// Custom hook to handle content loading logic
function useContentLoader(
  params: {
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
  },
  skipLoading = false,
) {
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<MediaDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!params.id || !params.type || skipLoading) return;

      setLoading(true);
      setContentError(null);

      try {
        const md = await contentService.getMediaDetails({
          mediaType: params.type,
          mediaId: params.id,
          // Parse season and episode as numbers directly from route params
          season: parseNumericParam(params.season),
          episode: parseNumericParam(params.episode),
          // Include watch history for resume functionality
          includeWatchHistory: true,
        });

        if (!cancelled) {
          setVideoURL(md?.videoURL ?? null);
          setVideoData(md ?? null);
        }
      } catch (error) {
        if (!cancelled) {
          setContentError(
            error instanceof Error ? error.message : "Failed to load content",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.id, params.type, params.season, params.episode, skipLoading]);

  return {
    videoURL,
    videoData,
    loading,
    contentError,
  };
}

// Custom hook for playback tracking with improved memory leak prevention
function usePlaybackTracking(
  player: VideoPlayer,
  videoData: MediaDetailsResponse | null,
  videoURL: string | null,
  params: {
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
  },
) {
  const lastUpdateTimeRef = useRef<number>(0);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const listenersRef = useRef<{ remove: () => void }[]>([]);
  const isMountedRef = useRef(true);
  const pendingUpdateRef = useRef<Promise<void> | null>(null);

  // Helper function to check if player is still valid
  const isPlayerValid = useCallback((player: VideoPlayer | null): boolean => {
    if (!player) return false;

    try {
      // Try to access a property to check if the native object is still valid
      const _ = player.currentTime;
      return true;
    } catch (error) {
      // If accessing the property throws, the native object has been released
      return false;
    }
  }, []);

  const sendPlaybackUpdate = useCallback(
    async (currentTime: number) => {
      if (
        !isMountedRef.current ||
        !videoData ||
        !videoURL ||
        currentTime <= 0
      ) {
        return;
      }

      try {
        const playbackData: PlaybackUpdateRequest = {
          videoId: videoURL,
          playbackTime: currentTime,
          mediaMetadata: {
            mediaType: videoData.type || params.type,
            mediaId: videoData.id || params.id,
            ...(params.type === "tv" && {
              showId: params.id,
              seasonNumber:
                videoData.seasonNumber || parseNumericParam(params.season),
              episodeNumber:
                videoData.episodeNumber || parseNumericParam(params.episode),
            }),
          },
        };

        console.log(
          `[PlaybackTracking] Sending update for ${playbackData.mediaMetadata.mediaType} ${playbackData.mediaMetadata.mediaId} at ${currentTime}s`,
        );

        // Store the promise to handle cleanup
        const updatePromise =
          contentService.updatePlaybackProgress(playbackData);
        pendingUpdateRef.current = updatePromise;

        await updatePromise;

        // Clear the pending update if it's still the same one
        if (pendingUpdateRef.current === updatePromise) {
          pendingUpdateRef.current = null;
        }

        if (isMountedRef.current) {
          console.log(`[PlaybackTracking] Updated progress: ${currentTime}s`);
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error("[PlaybackTracking] Failed to update progress:", error);
        }
      }
    },
    [videoData, videoURL, params],
  );

  // Cleanup function to remove all listeners
  const cleanupListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => {
      try {
        listener.remove();
      } catch (error) {
        console.error("[PlaybackTracking] Error removing listener:", error);
      }
    });
    listenersRef.current = [];
  }, []);

  // Cleanup function to clear interval
  const cleanupInterval = useCallback(() => {
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }
  }, []);

  // Main effect for setting up tracking
  useEffect(() => {
    if (!player || !videoURL || !videoData || !isPlayerValid(player)) return;

    isMountedRef.current = true;

    // Clear any existing listeners and intervals
    cleanupListeners();
    cleanupInterval();

    let initTimeoutId: NodeJS.Timeout;

    const setupTracking = () => {
      if (!isMountedRef.current || !player || !isPlayerValid(player)) return;

      try {
        const handleTimeUpdate = () => {
          if (!isMountedRef.current || !player || !isPlayerValid(player))
            return;

          try {
            const currentTime = player.currentTime;
            if (typeof currentTime !== "number") return;

            const timeSinceLastUpdate = currentTime - lastUpdateTimeRef.current;

            // Update if 30 seconds have passed or if there's a significant jump (seeking)
            if (
              timeSinceLastUpdate >= 30 ||
              Math.abs(timeSinceLastUpdate) > 10
            ) {
              lastUpdateTimeRef.current = currentTime;
              sendPlaybackUpdate(currentTime);
            }
          } catch (error) {
            console.error(
              "[PlaybackTracking] Player released during time update:",
              error,
            );
            // Player has been released, clean up
            cleanupInterval();
            cleanupListeners();
          }
        };

        const handlePlayingChange = ({ isPlaying }: { isPlaying: boolean }) => {
          if (!isMountedRef.current || !player || !isPlayerValid(player))
            return;

          try {
            if (!isPlaying) {
              const currentTime = player.currentTime;
              if (typeof currentTime === "number" && currentTime > 0) {
                lastUpdateTimeRef.current = currentTime;
                sendPlaybackUpdate(currentTime);
              }
            }
          } catch (error) {
            console.error(
              "[PlaybackTracking] Player released during playing change:",
              error,
            );
            // Player has been released, clean up
            cleanupInterval();
            cleanupListeners();
          }
        };

        // Set up periodic updates
        updateIntervalRef.current = setInterval(() => {
          if (!isMountedRef.current || !player || !isPlayerValid(player)) {
            cleanupInterval();
            return;
          }

          try {
            const isPlaying = player.playing;
            if (isPlaying) {
              handleTimeUpdate();
            }
          } catch (error) {
            console.error(
              "[PlaybackTracking] Player released during interval update:",
              error,
            );
            // Player has been released, clean up immediately
            cleanupInterval();
            cleanupListeners();
          }
        }, 30000);

        // Set up event listeners
        try {
          const timeUpdateListener = player.addListener(
            "timeUpdate",
            handleTimeUpdate,
          );
          const playingChangeListener = player.addListener(
            "playingChange",
            handlePlayingChange,
          );

          // Store listeners for cleanup
          listenersRef.current.push(timeUpdateListener, playingChangeListener);
        } catch (error) {
          console.error(
            "[PlaybackTracking] Error setting up listeners:",
            error,
          );
        }
      } catch (error) {
        console.error("[PlaybackTracking] Error in setupTracking:", error);
      }
    };

    // Small delay to ensure player is fully initialized
    initTimeoutId = setTimeout(setupTracking, 100);

    return () => {
      clearTimeout(initTimeoutId);
      cleanupListeners();
      cleanupInterval();
    };
  }, [
    player,
    videoURL,
    videoData,
    sendPlaybackUpdate,
    cleanupListeners,
    cleanupInterval,
    isPlayerValid,
  ]);

  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      isMountedRef.current = false;

      // Clean up everything
      cleanupListeners();
      cleanupInterval();

      // Send final update if there's a valid current time
      try {
        if (player && isPlayerValid(player)) {
          const currentTime = player.currentTime;
          if (typeof currentTime === "number" && currentTime > 0) {
            // Don't await this - fire and forget on unmount
            sendPlaybackUpdate(currentTime);
          }
        }
      } catch (error) {
        console.error("[PlaybackTracking] Error in final update:", error);
      }
    };
  }, [
    player,
    sendPlaybackUpdate,
    cleanupListeners,
    cleanupInterval,
    isPlayerValid,
  ]);
}

export default function WatchPage() {
  const params = useLocalSearchParams<{
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
    backdrop?: string; // Backdrop URL passed from navigation
    backdropBlurhash?: string; // Backdrop blurhash passed from navigation
  }>();
  const router = useRouter();

  // App contexts
  const { setMode } = useTVAppState();
  const { resetActivityTimer } = useRemoteActivity();
  const { setVideoPlayingState } = useScreensaver();
  const [isEpisodeSwitching, setIsEpisodeSwitching] = useState(false);
  const isEpisodeSwitchingRef = useRef(false);

  // Video player loading states
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Content loading (abstracted) - skip loading during episode switching
  // Use ref to ensure we block loading even during React state update timing issues
  const { videoURL, videoData, loading, contentError } = useContentLoader(
    params,
    isEpisodeSwitching || isEpisodeSwitchingRef.current,
  );

  // Enhanced episode switching state
  const [currentEpisodeData, setCurrentEpisodeData] =
    useState<MediaDetailsResponse | null>(null);
  const [episodeSwitchError, setEpisodeSwitchError] = useState<string | null>(
    null,
  );

  // Episode carousel state and management
  const [episodes, setEpisodes] = useState<TVDeviceEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [hasLoadedEpisodesOnce, setHasLoadedEpisodesOnce] = useState(false);
  const [isPending, startTransition] = useTransition();
  const episodeRefreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Current episode and season from params
  const currentEpisodeNumber = params.episode
    ? parseInt(params.episode, 10)
    : undefined;
  const currentSeasonNumber = params.season ? parseInt(params.season, 10) : 1;

  // Hybrid data resolution - use episode switching data when available
  const effectiveVideoData = currentEpisodeData || videoData;
  const effectiveVideoURL = currentEpisodeData?.videoURL || videoURL;
  const effectiveEpisodeNumber =
    currentEpisodeData?.episodeNumber || currentEpisodeNumber;

  // Backdrop URL resolution - prioritize route param, then current data, then loaded data
  const effectiveBackdropURL =
    params.backdrop || // From route navigation
    currentEpisodeData?.backdrop || // From episode switching
    videoData?.backdrop; // From initial data load

  // Backdrop blurhash resolution - prioritize route param, then current data, then loaded data
  const effectiveBackdropBlurhash =
    params.backdropBlurhash || // From route navigation
    currentEpisodeData?.backdropBlurhash || // From episode switching
    videoData?.backdropBlurhash; // From initial data load

  // Buffer Options
  const bufferOptions: BufferOptions = {
    // Conservative forward buffer - balance smoothness vs memory
    preferredForwardBufferDuration: 15, // 15 seconds = ~116 MB (vs 60s = 463 MB)

    // iOS: Let system manage stalling intelligently
    waitsToMinimizeStalling: true,

    // Android: Memory-conscious settings
    minBufferForPlayback: 3, // Just 3 seconds minimum = ~23 MB
    maxBufferBytes: 134217728, // 128 MB hard limit (vs 0 = unlimited)
    prioritizeTimeOverSizeThreshold: true, // Prioritize time over aggressive buffering
  };

  // Create player with resume functionality using effective data
  const player = useVideoPlayer(effectiveVideoURL, (p) => {
    p.timeUpdateEventInterval = 1;
    p.loop = false;
    p.bufferOptions = bufferOptions;

    // Check if we have watch history and should resume
    const watchHistory = effectiveVideoData?.watchHistory;
    if (watchHistory && watchHistory.playbackTime > 0) {
      // Resume from saved position (with a small buffer to account for seeking precision)
      const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
      console.log(
        `[WatchPage] Resuming playback from ${resumeTime}s (saved: ${watchHistory.playbackTime}s)`,
      );
      p.currentTime = resumeTime;
    }

    p.play();
  });

  // Video player loading state tracking
  useEffect(() => {
    if (!player) return;

    // Reset loading state when player changes
    setIsVideoLoading(true);
    setIsVideoPlaying(false);

    const listeners: { remove: () => void }[] = [];

    try {
      // Listen for status changes to detect when video is ready
      const statusListener = player.addListener("statusChange", (status) => {
        console.log("[WatchPage] Video status changed:", status);

        // Video is ready when it has loaded enough to start playing
        if (status.status === "readyToPlay" && !status.error) {
          setIsVideoLoading(false);
        }
      });

      // Listen for playing state changes
      const playingListener = player.addListener(
        "playingChange",
        ({ isPlaying }) => {
          console.log("[WatchPage] Video playing state changed:", isPlaying);
          setIsVideoPlaying(isPlaying);

          // If video starts playing, it's definitely not loading anymore
          if (isPlaying) {
            setIsVideoLoading(false);
          }
        },
      );

      // Listen for source changes (during episode switching)
      const sourceListener = player.addListener("sourceChange", () => {
        console.log(
          "[WatchPage] Video source changed - resetting loading state",
        );
        setIsVideoLoading(true);
        setIsVideoPlaying(false);
      });

      listeners.push(statusListener, playingListener, sourceListener);
    } catch (error) {
      console.error(
        "[WatchPage] Error setting up video loading listeners:",
        error,
      );
    }

    return () => {
      listeners.forEach((listener) => {
        try {
          listener.remove();
        } catch (error) {
          console.error(
            "[WatchPage] Error removing video loading listener:",
            error,
          );
        }
      });
    };
  }, [player]);

  // Handle audio‐codec errors and fallback using effective data
  const audioError = useAudioFallback({
    videoURL: effectiveVideoURL,
    player,
    preferredLanguages: ["en"],
    fallbackTimeoutMs: 5000,
  });

  // Handle video codec errors and provide user-friendly messages
  const videoError = useVideoErrorHandling({
    player,
  });

  // Enable playback tracking using effective data
  usePlaybackTracking(player, effectiveVideoData, effectiveVideoURL, params);

  // Function to fetch episode data using the preferred API pattern
  const fetchEpisodeData = useCallback(async () => {
    if (params.type !== "tv" || !params.id) return;

    // Don't fetch episode data during episode switching to prevent skeleton flash
    if (isEpisodeSwitching || isEpisodeSwitchingRef.current) {
      console.log(
        "[WatchPage] Skipping episode data fetch during episode switching",
      );
      return;
    }

    // Smart loading state: Only show skeleton for first load when no episodes exist
    const isFirstLoad = !hasLoadedEpisodesOnce && episodes.length === 0;

    try {
      if (isFirstLoad) {
        setIsLoadingEpisodes(true);
        console.log(
          "[WatchPage] First load - showing skeleton while fetching episode data",
        );
      } else {
        console.log(
          "[WatchPage] Background refresh - updating episodes silently",
        );
      }

      console.log(
        "[WatchPage] Fetching episode data for season",
        currentSeasonNumber,
      );
      const result = await contentService.getTVMediaDetails({
        mediaType: params.type,
        mediaId: params.id,
        season: currentSeasonNumber,
        includeWatchHistory: true,
      });

      if (result && result.episodes) {
        console.log("[WatchPage] Loaded", result.episodes.length, "episodes");
        setEpisodes(result.episodes);
        setHasLoadedEpisodesOnce(true);
      }
    } catch (error) {
      console.error("[WatchPage] Error fetching episode data:", error);
    } finally {
      if (isFirstLoad) {
        setIsLoadingEpisodes(false);
      }
    }
  }, [
    params.type,
    params.id,
    currentSeasonNumber,
    isEpisodeSwitching,
    hasLoadedEpisodesOnce,
    episodes.length,
  ]);

  // Reset episode loading state when season changes
  useEffect(() => {
    if (params.type === "tv") {
      setHasLoadedEpisodesOnce(false);
      setEpisodes([]);
    }
  }, [currentSeasonNumber, params.type]);

  // Lazily fetch episode data after the video starts playing
  useEffect(() => {
    if (videoURL && player && params.type === "tv") {
      // Start a transition to avoid blocking the main thread
      startTransition(() => {
        console.log("[WatchPage] Lazily fetching episode data");
        fetchEpisodeData();
      });
    }
  }, [videoURL, player, params.type, fetchEpisodeData]);

  // Periodically refresh episode data while playing (every 5 minutes)
  useEffect(() => {
    if (params.type !== "tv" || !videoURL || !player) return;

    // Set up a refresh interval
    episodeRefreshTimerRef.current = setInterval(
      () => {
        // Use transition to avoid interfering with playback
        startTransition(() => {
          console.log("[WatchPage] Refreshing episode data");
          fetchEpisodeData();
        });
      },
      5 * 60 * 1000,
    ); // Every 5 minutes

    return () => {
      if (episodeRefreshTimerRef.current) {
        clearInterval(episodeRefreshTimerRef.current);
        episodeRefreshTimerRef.current = null;
      }
    };
  }, [params.type, videoURL, player, fetchEpisodeData]);

  // Enhanced episode selection with seamless switching
  const handleEpisodeSelect = useCallback(
    async (episode: TVDeviceEpisode) => {
      if (!params.id || !params.type || params.type !== "tv") return;

      try {
        setIsEpisodeSwitching(true);
        isEpisodeSwitchingRef.current = true;
        setEpisodeSwitchError(null);

        console.log(
          "[WatchPage] Seamlessly switching to episode",
          episode.episodeNumber,
        );

        // Phase 1: Send final playback update for current episode
        if (player && effectiveVideoData && effectiveVideoURL) {
          const currentTime = player.currentTime;
          if (currentTime > 0) {
            console.log(
              "[WatchPage] Sending final playback update for current episode",
            );
            await contentService.updatePlaybackProgress({
              videoId: effectiveVideoURL,
              playbackTime: currentTime,
              mediaMetadata: {
                mediaType: effectiveVideoData.type || params.type,
                mediaId: effectiveVideoData.id || params.id,
                showId: params.id,
                seasonNumber:
                  effectiveVideoData.seasonNumber || currentSeasonNumber,
                episodeNumber:
                  effectiveVideoData.episodeNumber || effectiveEpisodeNumber,
              },
            });
          }
        }

        // Phase 2: Fetch new episode data with watch history
        console.log("[WatchPage] Fetching new episode data");
        const newEpisodeData = await contentService.getMediaDetails({
          mediaType: params.type,
          mediaId: params.id,
          season: currentSeasonNumber,
          episode: episode.episodeNumber,
          includeWatchHistory: true,
        });

        if (!newEpisodeData?.videoURL) {
          throw new Error("No video URL available for selected episode");
        }

        // Phase 3: Replace video source seamlessly
        if (player) {
          console.log("[WatchPage] Replacing video source");
          await player.replaceAsync({ uri: newEpisodeData.videoURL });

          // Apply resume position from watch history
          const watchHistory = newEpisodeData.watchHistory;
          if (watchHistory && watchHistory.playbackTime > 0) {
            const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
            console.log(`[WatchPage] Resuming new episode from ${resumeTime}s`);
            player.currentTime = resumeTime;
          }

          player.play();
        }

        // Phase 4: Update state and URL parameters
        setCurrentEpisodeData(newEpisodeData);

        // Update URL parameters without navigation using setParams
        router.setParams({
          season: currentSeasonNumber.toString(),
          episode: episode.episodeNumber.toString(),
        });

        // Phase 5: Update episode list to reflect any watch history changes
        // This ensures the episode carousel shows updated progress/watched status
        if (newEpisodeData.episodeNumber) {
          setEpisodes((prevEpisodes) =>
            prevEpisodes.map((ep) =>
              ep.episodeNumber === newEpisodeData.episodeNumber
                ? {
                    ...ep,
                    watchHistory: newEpisodeData.watchHistory,
                  }
                : ep,
            ),
          );
        }

        console.log("[WatchPage] Episode switch completed successfully");
      } catch (error) {
        console.error("[WatchPage] Episode switch failed:", error);
        setEpisodeSwitchError(
          error instanceof Error ? error.message : "Failed to switch episode",
        );

        // Fallback: try updating params for critical failures
        if (error instanceof Error && error.message.includes("No video URL")) {
          console.log("[WatchPage] Falling back to param update");
          router.setParams({
            season: currentSeasonNumber.toString(),
            episode: episode.episodeNumber.toString(),
          });
        }
      } finally {
        // Add a small delay before clearing the switching flags to ensure
        // the URL parameter change doesn't trigger the content loader
        setTimeout(() => {
          setIsEpisodeSwitching(false);
          isEpisodeSwitchingRef.current = false;
        }, 150);
      }
    },
    [
      params,
      player,
      effectiveVideoData,
      effectiveVideoURL,
      effectiveEpisodeNumber,
      currentSeasonNumber,
      router,
    ],
  );

  // Combine content, audio, video, and episode switch errors
  const finalError =
    contentError || audioError || videoError || episodeSwitchError;

  // Separate initial loading from episode switching
  // Only show full loading screen for initial page load, not during episode switching
  const showFullLoading = loading && !currentEpisodeData;

  // Tell the app we're in "watch" mode and optimize queries for video playback
  useEffect(() => {
    console.log(
      "[WatchPage] Entering watch mode - suspending background queries",
    );

    // Set TV app state to watch mode
    setMode("watch");

    // Enable React Query watch mode optimizations
    setWatchMode(true);

    // Suspend background queries and clear browse cache to free memory
    tvQueryHelpers.suspendBackgroundQueries();
    tvQueryHelpers.clearBrowseCache();

    return () => {
      console.log(
        "[WatchPage] Exiting watch mode - resuming background queries",
      );

      // Restore normal mode
      setMode("browse");
      setWatchMode(false);

      // Resume background queries
      tvQueryHelpers.resumeBackgroundQueries();
    };
  }, [setMode]);

  // Screensaver sync and keep awake management
  useEffect(() => {
    const sub = player.addListener("playingChange", ({ isPlaying }) => {
      setVideoPlayingState(isPlaying);

      // Keep screen awake during video playback to prevent Android screensaver
      if (isPlaying) {
        activateKeepAwakeAsync();
        console.log("[WatchPage] Activated keep awake for video playback");
      } else {
        deactivateKeepAwake();
        console.log(
          "[WatchPage] Deactivated keep awake - video paused/stopped",
        );
      }
    });

    return () => {
      sub.remove();
      // Ensure keep awake is deactivated when component unmounts
      deactivateKeepAwake();
      console.log("[WatchPage] Component unmounting - deactivated keep awake");
    };
  }, [player, setVideoPlayingState]);

  const handleExit = useCallback(() => {
    setVideoPlayingState(false);
    resetActivityTimer();
    setMode("browse");
    router.back();
  }, [setVideoPlayingState, resetActivityTimer, setMode, router]);

  const handleInfoPress = useCallback(() => {
    setVideoPlayingState(false);
    resetActivityTimer();

    // Use dismissTo to navigate back to the media-info page if it exists in the stack,
    // or create a new one if it doesn't
    router.dismissTo({
      pathname: "/media-info/[id]",
      params: {
        id: params.id,
        type: params.type,
        ...(params.season && { season: params.season }),
      },
    });
  }, [
    resetActivityTimer,
    router,
    params.id,
    params.type,
    params.season,
    setVideoPlayingState,
  ]);

  // Back handler
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleExit();
      return true;
    });
    return () => sub.remove();
  }, [handleExit]);

  const videoInfo = useMemo(
    () =>
      effectiveVideoData
        ? {
            type: effectiveVideoData.type,
            title: effectiveVideoData.title || "",
            description: effectiveVideoData.metadata?.overview,
            logo: effectiveVideoData.logo,
            captionURLs: effectiveVideoData.captionURLs as
              | Record<
                  string,
                  {
                    srcLang: string;
                    url: string;
                    lastModified: string;
                    sourceServerId: string;
                  }
                >
              | undefined,
            backdrop: effectiveVideoData.backdrop,
            showTitle: effectiveVideoData.showTitle as string | undefined,
          }
        : undefined,
    [effectiveVideoData],
  );

  // Backdrop management with global backdrop manager
  useEffect(() => {
    // Show backdrop immediately when page loads, even if we don't have the URL yet
    if (
      effectiveBackdropURL ||
      showFullLoading ||
      isEpisodeSwitching ||
      isVideoLoading
    ) {
      console.log(
        "[WatchPage] Showing backdrop:",
        effectiveBackdropURL || "loading...",
      );

      // Determine loading message based on current state
      let message: string | undefined;
      if (showFullLoading) message = "Loading video...";
      else if (isEpisodeSwitching) message = "Switching episode...";
      else if (isVideoLoading) message = "Buffering...";

      // Show backdrop with URL if available, otherwise just update message
      if (effectiveBackdropURL) {
        backdropManager.show(effectiveBackdropURL, {
          fade: true,
          duration: 300,
          blurhash: effectiveBackdropBlurhash as string | undefined,
          message,
        });
      } else if (message && backdropManager.isBackdropVisible()) {
        // If backdrop is already visible but we don't have URL yet, just update message
        backdropManager.setMessage(message);
      }
    }

    // Hide backdrop when video starts playing
    if (
      !showFullLoading &&
      !isEpisodeSwitching &&
      !isVideoLoading &&
      isVideoPlaying
    ) {
      console.log("[WatchPage] Video playing - hiding backdrop");
      backdropManager.hide({ fade: true, duration: 500 });
    }

    // Cleanup on unmount
    return () => {
      console.log("[WatchPage] Component unmounting - hiding backdrop");
      backdropManager.hide({ fade: true, duration: 300 });
    };
  }, [
    effectiveBackdropURL,
    effectiveBackdropBlurhash,
    showFullLoading,
    isEpisodeSwitching,
    isVideoLoading,
    isVideoPlaying,
  ]);

  // Update backdrop message when loading states change
  useEffect(() => {
    if (effectiveBackdropURL) {
      let message: string | undefined;
      if (showFullLoading) message = "Loading video...";
      else if (isEpisodeSwitching) message = "Switching episode...";
      else if (isVideoLoading) message = "Buffering...";

      if (message) {
        backdropManager.setMessage(message);
      } else {
        backdropManager.setMessage(undefined);
      }
    }
  }, [
    showFullLoading,
    isEpisodeSwitching,
    isVideoLoading,
    effectiveBackdropURL,
  ]);

  // Render
  if (showFullLoading) {
    return <View style={styles.container} />;
  }
  if (finalError) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>Error: {finalError}</Text>
          <Pressable
            focusable
            hasTVPreferredFocus
            style={({ focused }) => [
              styles.clickableText,
              focused && styles.clickableTextFocused,
            ]}
            onPress={handleExit}
          >
            <Text style={styles.messageText}>Go back to browse</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  if (!effectiveVideoURL || !player) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>No video content loaded.</Text>
          <Pressable
            focusable
            hasTVPreferredFocus
            style={({ focused }) => [
              styles.clickableText,
              focused && styles.clickableTextFocused,
            ]}
            onPress={handleExit}
          >
            <Text style={styles.messageText}>Go back to browse</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.video}
        player={player}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        nativeControls={false}
      />

      <StandaloneVideoControls
        player={player}
        videoInfo={videoInfo}
        overlayMode
        onExitWatchMode={handleExit}
        onInfoPress={handleInfoPress}
        showCaptionControls={!!videoInfo?.captionURLs}
        episodes={params.type === "tv" ? episodes : undefined}
        currentEpisodeNumber={effectiveEpisodeNumber}
        onEpisodeSelect={handleEpisodeSelect}
        isLoadingEpisodes={isLoadingEpisodes}
        isEpisodeSwitching={isEpisodeSwitching}
        episodeSwitchError={episodeSwitchError}
      />
    </View>
  );
}

// (You’d define CenteredMessage and CenteredError as tiny helpers)

const styles = StyleSheet.create({
  clickableText: {
    backgroundColor: Colors.dark.inputBackground,
    borderRadius: 8,
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  clickableTextFocused: {
    backgroundColor: Colors.dark.tint,
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  container: {
    backgroundColor: "#000000",
    flex: 1,
  },
  errorText: {
    color: "#FF6B6B",
    fontSize: 18,
    marginBottom: 20,
    textAlign: "center",
  },
  messageContainer: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 18,
    marginBottom: 10,
    textAlign: "center",
  },
  video: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0, // Behind controls
  },
});
