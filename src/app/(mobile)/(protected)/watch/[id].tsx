import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useRouter } from "expo-router";
import { BufferOptions, VideoPlayer, VideoView } from "expo-video";
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
  useTransition,
} from "react";
import {
  View,
  StyleSheet,
  Text,
  BackHandler,
  TouchableOpacity,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import MobileVideoControls from "@/src/components/Mobile/Video/MobileVideoControls";
import { Colors } from "@/src/constants/Colors";
import { useAudioFallback } from "@/src/data/hooks/useAudioFallback";
import { useVideoErrorHandling } from "@/src/data/hooks/useVideoErrorHandling";
import {
  contentService,
  PlaybackUpdateRequest,
} from "@/src/data/services/contentService";
import {
  MediaDetailsResponse,
  TVDeviceEpisode,
} from "@/src/data/types/content.types";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useOptimizedVideoPlayer } from "@/src/hooks/useOptimizedVideoPlayer";

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

// Custom hook for playback tracking (simplified for mobile)
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

  // Expose function to flush current progress immediately
  const flushCurrentProgress = useCallback(async (): Promise<void> => {
    if (!player || !videoData || !videoURL || !isPlayerValid(player)) {
      return;
    }

    try {
      const currentTime = player.currentTime;
      if (typeof currentTime === "number" && currentTime > 0) {
        console.log("[MobilePlaybackTracking] Force flushing current progress");

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

        await contentService.updatePlaybackProgress(playbackData);
        lastUpdateTimeRef.current = currentTime;

        console.log(
          `[MobilePlaybackTracking] Updated progress: ${currentTime}s`,
        );
      }
    } catch (error) {
      console.error("[MobilePlaybackTracking] Error in force flush:", error);
    }
  }, [
    player,
    videoData,
    videoURL,
    isPlayerValid,
    params.type,
    params.id,
    params.season,
    params.episode,
  ]);

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
          `[MobilePlaybackTracking] Sending update at ${currentTime}s`,
        );

        await contentService.updatePlaybackProgress(playbackData);

        if (isMountedRef.current) {
          console.log(
            `[MobilePlaybackTracking] Updated progress: ${currentTime}s`,
          );
        }
      } catch (error) {
        if (isMountedRef.current) {
          console.error(
            "[MobilePlaybackTracking] Failed to update progress:",
            error,
          );
        }
      }
    },
    [videoData, videoURL, params],
  );

  // Cleanup functions
  const cleanupListeners = useCallback(() => {
    listenersRef.current.forEach((listener) => {
      try {
        listener.remove();
      } catch (error) {
        console.error(
          "[MobilePlaybackTracking] Error removing listener:",
          error,
        );
      }
    });
    listenersRef.current = [];
  }, []);

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
              "[MobilePlaybackTracking] Player released during time update:",
              error,
            );
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
              "[MobilePlaybackTracking] Player released during playing change:",
              error,
            );
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
              "[MobilePlaybackTracking] Player released during interval update:",
              error,
            );
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
            "[MobilePlaybackTracking] Error setting up listeners:",
            error,
          );
        }
      } catch (error) {
        console.error(
          "[MobilePlaybackTracking] Error in setupTracking:",
          error,
        );
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
      cleanupListeners();
      cleanupInterval();
    };
  }, [cleanupListeners, cleanupInterval]);

  return { flushCurrentProgress };
}

export default function MobileWatchPage() {
  const params = useLocalSearchParams<{
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
    backdrop?: string; // Backdrop URL passed from navigation
    backdropBlurhash?: string; // Backdrop blurhash passed from navigation
  }>();
  const router = useRouter();

  const [isEpisodeSwitching, setIsEpisodeSwitching] = useState(false);
  const isEpisodeSwitchingRef = useRef(false);

  // Use the backdrop manager
  const { show: showBackdrop, hide: hideBackdrop } = useBackdropManager();

  // Video player loading states
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Content loading (abstracted) - skip loading during episode switching
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

  // Buffer Options (mobile-optimized)
  const bufferOptions = useMemo<BufferOptions>(
    () => ({
      // More conservative for mobile devices
      preferredForwardBufferDuration: 10, // 10 seconds for mobile
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 2, // 2 seconds minimum for mobile
      maxBufferBytes: 67108864, // 64 MB for mobile (half of TV)
      prioritizeTimeOverSizeThreshold: true,
    }),
    [],
  );

  // Create optimized player
  const { player } = useOptimizedVideoPlayer(effectiveVideoURL, (p) => {
    p.timeUpdateEventInterval = 1;
    p.loop = false;
    p.bufferOptions = bufferOptions;

    // Check if we have watch history and should resume
    const watchHistory = effectiveVideoData?.watchHistory;
    if (watchHistory && watchHistory.playbackTime > 0) {
      // Resume from saved position (with a small buffer to account for seeking precision)
      const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
      console.log(
        `[MobileWatchPage] Resuming playback from ${resumeTime}s (saved: ${watchHistory.playbackTime}s)`,
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
        console.log("[MobileWatchPage] Video status changed:", status);

        // Video is ready when it has loaded enough to start playing
        if (status.status === "readyToPlay" && !status.error) {
          setIsVideoLoading(false);
        }
      });

      // Listen for playing state changes
      const playingListener = player.addListener(
        "playingChange",
        ({ isPlaying }) => {
          console.log(
            "[MobileWatchPage] Video playing state changed:",
            isPlaying,
          );
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
          "[MobileWatchPage] Video source changed - resetting loading state",
        );
        setIsVideoLoading(true);
        setIsVideoPlaying(false);
      });

      listeners.push(statusListener, playingListener, sourceListener);
    } catch (error) {
      console.error(
        "[MobileWatchPage] Error setting up video loading listeners:",
        error,
      );
    }

    return () => {
      listeners.forEach((listener) => {
        try {
          listener.remove();
        } catch (error) {
          console.error(
            "[MobileWatchPage] Error removing video loading listener:",
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
  const { flushCurrentProgress } = usePlaybackTracking(
    player,
    effectiveVideoData,
    effectiveVideoURL,
    params,
  );

  // Function to fetch episode data for TV shows
  const fetchEpisodeData = useCallback(async () => {
    if (params.type !== "tv" || !params.id) return;

    // Don't fetch episode data during episode switching
    if (isEpisodeSwitching || isEpisodeSwitchingRef.current) {
      console.log(
        "[MobileWatchPage] Skipping episode data fetch during episode switching",
      );
      return;
    }

    // Smart loading state: Only show skeleton for first load when no episodes exist
    const isFirstLoad = !hasLoadedEpisodesOnce && episodes.length === 0;

    try {
      if (isFirstLoad) {
        setIsLoadingEpisodes(true);
        console.log("[MobileWatchPage] First load - fetching episode data");
      } else {
        console.log(
          "[MobileWatchPage] Background refresh - updating episodes silently",
        );
      }

      console.log(
        "[MobileWatchPage] Fetching episode data for season",
        currentSeasonNumber,
      );
      const result = await contentService.getTVMediaDetails({
        mediaType: params.type,
        mediaId: params.id,
        season: currentSeasonNumber,
        includeWatchHistory: true,
      });

      if (result && result.episodes) {
        console.log(
          "[MobileWatchPage] Loaded",
          result.episodes.length,
          "episodes",
        );
        setEpisodes(result.episodes);
        setHasLoadedEpisodesOnce(true);
      }
    } catch (error) {
      console.error("[MobileWatchPage] Error fetching episode data:", error);
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

  // Lazily fetch episode data after the video starts playing (for TV shows)
  useEffect(() => {
    if (videoURL && player && params.type === "tv") {
      // Start a transition to avoid blocking the main thread
      startTransition(() => {
        console.log("[MobileWatchPage] Lazily fetching episode data");
        fetchEpisodeData();
      });
    }
  }, [videoURL, player, params.type, fetchEpisodeData]);

  // Enhanced episode selection with seamless switching
  const handleEpisodeSelect = useCallback(
    async (episode: TVDeviceEpisode) => {
      if (!params.id || !params.type || params.type !== "tv") return;

      try {
        setIsEpisodeSwitching(true);
        isEpisodeSwitchingRef.current = true;
        setEpisodeSwitchError(null);

        console.log(
          "[MobileWatchPage] Switching to episode",
          episode.episodeNumber,
        );

        // Phase 1: Send final playback update for current episode
        if (player && effectiveVideoData && effectiveVideoURL) {
          const currentTime = player.currentTime;
          if (currentTime > 0) {
            console.log(
              "[MobileWatchPage] Sending final playback update for current episode",
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
        console.log("[MobileWatchPage] Fetching new episode data");
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
          console.log("[MobileWatchPage] Replacing video source");
          await player.replaceAsync({ uri: newEpisodeData.videoURL });

          // Apply resume position from watch history
          const watchHistory = newEpisodeData.watchHistory;
          if (watchHistory && watchHistory.playbackTime > 0) {
            const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
            console.log(
              `[MobileWatchPage] Resuming new episode from ${resumeTime}s`,
            );
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

        console.log("[MobileWatchPage] Episode switch completed successfully");
      } catch (error) {
        console.error("[MobileWatchPage] Episode switch failed:", error);
        setEpisodeSwitchError(
          error instanceof Error ? error.message : "Failed to switch episode",
        );

        // Fallback: try updating params for critical failures
        if (error instanceof Error && error.message.includes("No video URL")) {
          console.log("[MobileWatchPage] Falling back to param update");
          router.setParams({
            season: currentSeasonNumber.toString(),
            episode: episode.episodeNumber.toString(),
          });
        }
      } finally {
        // Add a small delay before clearing the switching flags
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
  const showFullLoading = loading && !currentEpisodeData;

  // Keep screen awake during video playback
  useEffect(() => {
    if (!player) return;

    const sub = player.addListener("playingChange", ({ isPlaying }) => {
      // Keep screen awake during video playback to prevent mobile screensaver
      if (isPlaying) {
        activateKeepAwakeAsync();
        console.log(
          "[MobileWatchPage] Activated keep awake for video playback",
        );
      } else {
        deactivateKeepAwake();
        console.log(
          "[MobileWatchPage] Deactivated keep awake - video paused/stopped",
        );
      }
    });

    return () => {
      sub.remove();
      // Ensure keep awake is deactivated when component unmounts
      deactivateKeepAwake();
      console.log(
        "[MobileWatchPage] Component unmounting - deactivated keep awake",
      );
    };
  }, [player]);

  // Mobile-optimized exit handler
  const handleExit = useCallback(async () => {
    try {
      // Flush current progress before navigation
      await flushCurrentProgress();
    } catch (error) {
      console.error(
        "[MobileWatchPage] Error flushing progress on exit:",
        error,
      );
    }

    // Restore system bars
    SystemBars.setHidden(false);
    router.back();
  }, [flushCurrentProgress, router]);

  // Mobile-optimized info navigation
  const handleInfoPress = useCallback(async () => {
    try {
      // Flush current progress before navigation
      await flushCurrentProgress();
    } catch (error) {
      console.error(
        "[MobileWatchPage] Error flushing progress on info navigation:",
        error,
      );
    }

    // Restore system bars
    SystemBars.setHidden(false);

    // Navigate to media info page
    router.push(
      {
        pathname: "/(mobile)/(protected)/media-info/[id]",
        params: {
          id: params.id,
          type: params.type,
          ...(params.season && { season: params.season }),
        },
      },
      {
        dangerouslySingular: true,
      },
    );
  }, [flushCurrentProgress, router, params.id, params.type, params.season]);

  // Back handler for Android
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleExit();
      return true;
    });
    return () => sub.remove();
  }, [handleExit]);

  // Set system bars to hidden for fullscreen video experience
  useEffect(() => {
    SystemBars.setHidden(true);
    return () => {
      SystemBars.setHidden(false);
    };
  }, []);

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

  // Optimized backdrop management for mobile
  useEffect(() => {
    // Only show backdrop during initial loading or episode switching
    const shouldShowBackdrop = showFullLoading || isEpisodeSwitching;

    if (shouldShowBackdrop && effectiveBackdropURL) {
      console.log(
        "[MobileWatchPage] Showing backdrop for loading state:",
        effectiveBackdropURL,
      );

      // Determine loading message
      let message: string | undefined;
      if (showFullLoading) message = "Loading video...";
      else if (isEpisodeSwitching) message = "Switching episode...";

      showBackdrop(effectiveBackdropURL, {
        fade: true,
        duration: 300,
        blurhash: effectiveBackdropBlurhash as string | undefined,
        message,
      });
    }

    // Hide backdrop when we're done with initial loading or episode switching
    if (!shouldShowBackdrop && !showFullLoading && !isEpisodeSwitching) {
      console.log("[MobileWatchPage] Hiding backdrop - video interface ready");
      hideBackdrop({ fade: true, duration: 500 });
    }

    // Cleanup on unmount
    return () => {
      console.log("[MobileWatchPage] Component unmounting - hiding backdrop");
      hideBackdrop({ fade: true, duration: 300 });
    };
  }, [
    effectiveBackdropURL,
    effectiveBackdropBlurhash,
    showFullLoading,
    isEpisodeSwitching,
    showBackdrop,
    hideBackdrop,
  ]);

  // Render loading state
  if (showFullLoading) {
    return <View style={styles.container} />;
  }

  // Render error state
  if (finalError) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>Error: {finalError}</Text>
          <TouchableOpacity style={styles.errorButton} onPress={handleExit}>
            <Text style={styles.errorButtonText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render no content state
  if (!effectiveVideoURL || !player) {
    return (
      <View style={styles.container}>
        <View style={styles.messageContainer}>
          <Text style={styles.errorText}>No video content loaded.</Text>
          <TouchableOpacity style={styles.errorButton} onPress={handleExit}>
            <Text style={styles.errorButtonText}>Go back</Text>
          </TouchableOpacity>
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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <MobileVideoControls
          player={player}
          videoInfo={videoInfo}
          onExitWatchMode={handleExit}
          onInfoPress={handleInfoPress}
          episodes={params.type === "tv" ? episodes : undefined}
          currentEpisodeNumber={effectiveEpisodeNumber}
          onEpisodeSelect={handleEpisodeSelect}
          isLoadingEpisodes={isLoadingEpisodes}
          isEpisodeSwitching={isEpisodeSwitching}
          episodeSwitchError={episodeSwitchError}
        />
      </GestureHandlerRootView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000000",
    flex: 1,
  },
  errorButton: {
    backgroundColor: Colors.dark.brandPrimary,
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorButtonText: {
    color: Colors.dark.whiteText,
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: Colors.dark.error,
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
  video: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 0, // Behind controls
  },
});
