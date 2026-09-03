// src/app/(tv)/(protected)/watch/[id].tsx
import { Image } from "expo-image";
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
import { View, StyleSheet, Text, BackHandler, Pressable } from "react-native";

import StandaloneVideoControls from "@/src/components/Video/StandaloneVideoControls";
import { Colors } from "@/src/constants/Colors";
import { useRemoteActivity } from "@/src/context/RemoteActivityContext";
import { useScreensaver } from "@/src/context/ScreensaverContext";
import { useTVAppState } from "@/src/context/TVAppStateContext";
import { useDirectPlayInfo } from "@/src/data/hooks/queries/useDirectPlayInfo";
import { useAudioFallback } from "@/src/data/hooks/useAudioFallback";
import { useVideoErrorHandling } from "@/src/data/hooks/useVideoErrorHandling";
import { useVideoTierFallback } from "@/src/data/hooks/useVideoTierFallback";
import { setWatchMode, tvQueryHelpers } from "@/src/data/query/queryClient";
import { contentService } from "@/src/data/services/contentService";
import {
  MediaDetailsResponse,
  TVDeviceEpisode,
} from "@/src/data/types/content.types";
import { useActiveVideoTrack } from "@/src/hooks/useActiveVideoTrack";
import { setVerdictAudioTracks } from "@/src/hooks/useAudioTracks";
import { useBackdropManager } from "@/src/hooks/useBackdrop";
import { useOptimizedVideoPlayer } from "@/src/hooks/useOptimizedVideoPlayer";
import { usePlaybackPresenceTracking } from "@/src/hooks/usePlaybackPresenceTracking";
import { useQualityTier } from "@/src/hooks/useQualityTier";
import { useWatchHistoryApplication } from "@/src/hooks/useWatchHistoryApplication";
import { qualityPrefMediaKey } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import { describeActiveQuality } from "@/src/utils/qualityTiers";
import { applyResumePosition } from "@/src/utils/resumeGuard";
import { isAdaptiveStreamURL } from "@/src/utils/streamType";
import { canonicalVideoId, isFileTierURL } from "@/src/utils/streamUrls";

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

  // Use the new Zustand-based backdrop manager
  const {
    show: showBackdrop,
    hide: hideBackdrop,
    setMessage: setBackdropMessage,
  } = useBackdropManager();

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
  const episodeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  // Watch-history/presence identity must stay the canonical master URL no
  // matter which tier is playing — a `?direct=1` or `/file` videoId would
  // split resume history and restart the presence session mid-viewing.
  const presenceVideoId = useMemo(
    () => (effectiveVideoURL ? canonicalVideoId(effectiveVideoURL) : null),
    [effectiveVideoURL],
  );

  // Per-item delivery-tier verdict, fetched at playback-open only (§3 — the
  // first call for a title triggers the server's one-time keyframe
  // derivation, so browse surfaces must never request it).
  const directPlayInfoParams = useMemo(() => {
    if (!params.id || !params.type) return null;
    if (params.type === "tv") {
      const season = effectiveVideoData?.seasonNumber ?? currentSeasonNumber;
      const episode =
        effectiveVideoData?.episodeNumber ?? effectiveEpisodeNumber;
      if (season == null || episode == null) return null;
      return { mediaType: params.type, mediaId: params.id, season, episode };
    }
    return { mediaType: params.type, mediaId: params.id };
  }, [
    params.id,
    params.type,
    effectiveVideoData,
    currentSeasonNumber,
    effectiveEpisodeNumber,
  ]);
  const { data: directPlayInfo } = useDirectPlayInfo(directPlayInfoParams);

  // Delivery-tier source policy + in-place tier switching (§4-§6). The hook
  // decides the source URL the player mounts with — Apple defaults to the
  // `?direct=1` master, Android "Original" is the raw file — applies the
  // remembered-per-title preference, and performs position-preserving swaps.
  // The player itself is wired in via refs right after it is created below.
  const playerRef = useRef<VideoPlayer | null>(null);
  const notifySourceReplacedRef = useRef<((url: string | null) => void) | null>(
    null,
  );
  // Publish the server's per-track audio verdict for the audio choosers
  // (commentary demotion on a direct-played container). Cleared on unmount.
  useEffect(() => {
    setVerdictAudioTracks(directPlayInfo?.file?.audioTracks);
    return () => setVerdictAudioTracks(null);
  }, [directPlayInfo]);

  const quality = useQualityTier({
    videoURL: effectiveVideoURL,
    directPlayInfo,
    mediaKey:
      params.id && params.type
        ? qualityPrefMediaKey(params.type, params.id)
        : null,
    isCellular: false, // TVs are never on metered cellular
    playerRef,
    notifySourceReplacedRef,
  });

  const playbackSourceURL = quality.activeSourceURL;

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

  // Buffer Options. NOTE: with prioritizeTimeOverSizeThreshold true, media3
  // keeps loading until the TIME target regardless of maxBufferBytes — the
  // byte value below is advisory, not a hard limit, for HLS sources.
  const bufferOptions = useMemo<BufferOptions>(
    () => ({
      // Conservative forward buffer - balance smoothness vs memory
      preferredForwardBufferDuration: 15, // 15 seconds = ~116 MB (vs 60s = 463 MB)

      // iOS: Let system manage stalling intelligently
      waitsToMinimizeStalling: true,

      // Android: Memory-conscious settings
      minBufferForPlayback: 3, // Just 3 seconds minimum = ~23 MB
      maxBufferBytes: 134217728, // 128 MB (advisory under the flag below)
      prioritizeTimeOverSizeThreshold: true, // Prioritize time over aggressive buffering
    }),
    [],
  );

  // Direct-play (/file) sources need the OPPOSITE trade-off: Mp4Extractor
  // materializes the container's full sample index on the same 512MB Java
  // heap before playback (hundreds of MB for a TrueHD-in-MP4 remux), so the
  // media buffer must be small and the byte cap must actually bind. At remux
  // bitrates a 15s time target alone is ~140MB — which is how a SHIELD OOMed
  // playing a 4K remux (see PlaybackErrorDetails.tierDescent telemetry).
  const fileTierBufferOptions = useMemo<BufferOptions>(
    () => ({
      preferredForwardBufferDuration: 8,
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 2,
      maxBufferBytes: 67108864, // 64 MB
      prioritizeTimeOverSizeThreshold: false, // byte cap is authoritative
    }),
    [],
  );
  const activeBufferOptions = isFileTierURL(playbackSourceURL)
    ? fileTierBufferOptions
    : bufferOptions;
  // Ref so the one-shot setup callback reads the value for the source it is
  // actually setting up, without widening its effect deps.
  const activeBufferOptionsRef = useRef(activeBufferOptions);
  activeBufferOptionsRef.current = activeBufferOptions;

  // Step 1: Create optimized player with deferred setup (no automatic watch history application)
  const { player, setupPlayer, notifySourceReplaced } = useOptimizedVideoPlayer(
    // Only load a source once content is loaded AND the quality preference
    // has resolved — the hook pins its first URL for the life of the mount.
    loading || !quality.sourceReady ? null : playbackSourceURL,
    undefined, // No setup callback - we'll use setupPlayer manually
    true, // deferSetup = true
  );
  playerRef.current = player;

  // The chrome badge reflects what is playing NOW (tier plus the rendered
  // track), never what the verdict merely offers.
  const activeVideoTrack = useActiveVideoTrack(player);
  const qualityBadge = useMemo(
    () =>
      describeActiveQuality({
        tier: quality.activeTier,
        info: directPlayInfo,
        platformClass: getPlatformClass(),
        videoTrack: activeVideoTrack,
        isSwitching: quality.isSwitching,
      }),
    [quality.activeTier, quality.isSwitching, directPlayInfo, activeVideoTrack],
  );
  notifySourceReplacedRef.current = notifySourceReplaced;

  // Free the browse screens' decoded images for the length of the session:
  // Glide keeps every backdrop and poster the user scrolled past in memory
  // although nothing draws them here. On a memory-tight TV (a 3 GB SHIELD in
  // a 4K Dolby Vision session) that headroom is the difference between steady
  // playback and lmkd process churn that starves the audio track.
  useEffect(() => {
    Image.clearMemoryCache().catch(() => {});
  }, []);

  // Step 2: Use watch history application hook to manage the stepped process
  const { status: watchHistoryStatus, isControlsReady } =
    useWatchHistoryApplication({
      player,
      videoData: effectiveVideoData,
      contentLoading: loading,
    });

  // Step 3: Setup player once watch history application is complete
  useEffect(() => {
    if (player && watchHistoryStatus === "success" && effectiveVideoData) {
      setupPlayer((p) => {
        p.timeUpdateEventInterval = 1;
        p.loop = false;
        p.bufferOptions = activeBufferOptionsRef.current;
        p.play();
      });
    }
  }, [player, watchHistoryStatus, effectiveVideoData, setupPlayer]);

  // Keep buffer options matched to the active tier: a switch onto or off the
  // raw /file source must swap between the HLS profile and the hard-capped
  // direct-play profile.
  useEffect(() => {
    if (!player) return;
    player.bufferOptions = activeBufferOptions;
  }, [player, activeBufferOptions]);

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

  // Handle audio‐codec errors and fallback using what is actually playing
  const audioError = useAudioFallback({
    videoURL: playbackSourceURL,
    player,
    preferredLanguages: ["en"],
    fallbackTimeoutMs: 5000,
  });

  // Enable playback + presence tracking, keyed by the canonical identity URL
  const { flushCurrentProgress, endSession, getSessionId } =
    usePlaybackPresenceTracking(
      player,
      effectiveVideoData,
      presenceVideoId,
      params,
    );

  // §8 decode-error descent: retry once, then drop a tier at position.
  // Declared BEFORE useVideoErrorHandling so its statusChange listener
  // registers first and claims errors the descent can recover from.
  const tierFallback = useVideoTierFallback({
    player,
    quality,
    videoURL: playbackSourceURL,
    getPlaybackSessionId: getSessionId,
    mediaId: params.id ?? null,
    mediaType: params.type ?? null,
  });

  // Handle video codec errors and provide user-friendly messages
  const videoError = useVideoErrorHandling({
    player,
    videoURL: playbackSourceURL,
    getPlaybackSessionId: getSessionId,
    mediaId: params.id ?? null,
    mediaType: params.type ?? null,
    suppressWhile: tierFallback.isHandling,
  });

  // Refs let the fetch callback read the latest "first load" state without
  // listing them as deps. Including them in the deps array would re-create
  // `fetchEpisodeData` after the first fetch, which in turn re-fires the
  // mount-time effect that calls it — producing the two back-to-back
  // "Lazily fetching episode data" logs on a single navigation.
  const hasLoadedEpisodesOnceRef = useRef(hasLoadedEpisodesOnce);
  hasLoadedEpisodesOnceRef.current = hasLoadedEpisodesOnce;
  const episodesLengthRef = useRef(episodes.length);
  episodesLengthRef.current = episodes.length;
  const isEpisodeSwitchingStateRef = useRef(isEpisodeSwitching);
  isEpisodeSwitchingStateRef.current = isEpisodeSwitching;

  // Function to fetch episode data using the preferred API pattern
  const fetchEpisodeData = useCallback(async () => {
    if (params.type !== "tv" || !params.id) return;

    // Don't fetch episode data during episode switching to prevent skeleton flash
    if (isEpisodeSwitchingStateRef.current || isEpisodeSwitchingRef.current) {
      console.log(
        "[WatchPage] Skipping episode data fetch during episode switching",
      );
      return;
    }

    // Smart loading state: Only show skeleton for first load when no episodes exist
    const isFirstLoad =
      !hasLoadedEpisodesOnceRef.current && episodesLengthRef.current === 0;

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
  }, [params.type, params.id, currentSeasonNumber]);

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

        // Phase 1: Send final playback update for current episode, and end
        // its presence session. sessionId is deliberately omitted from this
        // update — it's paired with endSession() below for the same session,
        // and the two must never share a sessionId on the wire (see the
        // resurrection footgun note on PlaybackUpdateRequest).
        if (player && effectiveVideoData && effectiveVideoURL) {
          const currentTime = player.currentTime;
          const outgoingSessionId = getSessionId();
          console.log(
            "[WatchPage] Ending presence session for outgoing episode",
            outgoingSessionId,
          );
          endSession();

          if (currentTime > 0) {
            console.log(
              "[WatchPage] Sending final playback update for current episode",
            );
            await contentService.updatePlaybackProgress({
              videoId: canonicalVideoId(effectiveVideoURL),
              playbackTime: currentTime,
              isPaused: !player.playing,
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

        // Phase 3: Replace video source seamlessly. applyEpisodeSource pins
        // the engine's source for the new item (Android "original" demotes to
        // auto — the old file's verdict cannot authorize the new file).
        if (player) {
          console.log("[WatchPage] Replacing video source");
          const nextSourceURL = quality.applyEpisodeSource(
            newEpisodeData.videoURL,
          );
          await player.replaceAsync({ uri: nextSourceURL });
          // Tell the hook we swapped the source ourselves, so its drift effect
          // does not issue a second redundant replaceAsync when
          // effectiveVideoURL catches up — that reload would discard both the
          // resume seek below and the selected audio track.
          notifySourceReplaced(nextSourceURL);

          // Apply resume position from watch history
          const watchHistory = newEpisodeData.watchHistory;
          if (watchHistory && watchHistory.playbackTime > 0) {
            const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
            console.log(`[WatchPage] Resuming new episode from ${resumeTime}s`);
            // Survives the async source commit (see resumeGuard).
            applyResumePosition(player, resumeTime, "WatchPage");
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
      endSession,
      getSessionId,
      quality.applyEpisodeSource,
    ],
  );

  // Combine content, audio, video, and episode switch errors
  const finalError =
    contentError || audioError || videoError || episodeSwitchError;

  // Separate initial loading from episode switching
  // Only show full loading screen for initial page load, not during episode
  // switching. Quality-source resolution (preference hydration + bounded
  // verdict wait) is part of initial loading.
  const showFullLoading =
    (loading || !quality.sourceReady) && !currentEpisodeData;

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

      // Restore React Query browse-mode optimizations. We intentionally do not
      // call `setMode("browse")` here — BrowseLayout's effect re-establishes
      // browse mode when the user lands back on a browse route, and doing it
      // from this cleanup bounces the mode briefly before the route swap,
      // triggering an extra TVAppStateProvider render and TVBanner cleanup
      // cascade.
      setWatchMode(false);

      // Resume background queries
      tvQueryHelpers.resumeBackgroundQueries();
    };
  }, [setMode]);

  // Screensaver sync and keep awake management. Reading
  // `setVideoPlayingState` through a ref keeps this effect's deps stable
  // (`player` is the only true dep) so we don't tear down and re-attach the
  // playingChange listener — and re-log "Component unmounting - deactivated
  // keep awake" — on every parent render.
  const setVideoPlayingStateRef = useRef(setVideoPlayingState);
  setVideoPlayingStateRef.current = setVideoPlayingState;
  useEffect(() => {
    const sub = player.addListener("playingChange", ({ isPlaying }) => {
      setVideoPlayingStateRef.current(isPlaying);

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
  }, [player]);

  const handleExit = useCallback(async () => {
    try {
      // Flush current progress before navigation. sessionId is omitted here
      // since we're ending the presence session right below — the two must
      // never share a sessionId on the wire (see PlaybackUpdateRequest).
      await flushCurrentProgress({ includeSessionId: false });
      await endSession();
    } catch (error) {
      console.error("[WatchPage] Error flushing progress on exit:", error);
    }

    setVideoPlayingState(false);
    resetActivityTimer();
    setMode("browse");
    router.back();
  }, [
    flushCurrentProgress,
    endSession,
    setVideoPlayingState,
    resetActivityTimer,
    setMode,
    router,
  ]);

  const handleInfoPress = useCallback(async () => {
    try {
      // Flush current progress before navigation (sessionId omitted — see handleExit).
      await flushCurrentProgress({ includeSessionId: false });
      await endSession();
    } catch (error) {
      console.error(
        "[WatchPage] Error flushing progress on info navigation:",
        error,
      );
    }

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
    flushCurrentProgress,
    endSession,
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

  // Optimized backdrop management - only show when actually visible to user.
  // Split into two effects: a re-run-safe show/hide effect with NO cleanup
  // (previously the cleanup hid the backdrop on every dep change, producing the
  // 4× "Component unmounting - hiding backdrop" flicker during initial load),
  // and a separate mount-only effect that hides on actual unmount.
  useEffect(() => {
    const shouldShowBackdrop =
      showFullLoading || isEpisodeSwitching || !isControlsReady;

    if (shouldShowBackdrop && effectiveBackdropURL) {
      console.log(
        "[WatchPage] Showing backdrop for loading state:",
        effectiveBackdropURL,
      );

      let message: string | undefined;
      if (showFullLoading) {
        message = "Loading video...";
      } else if (isEpisodeSwitching) {
        message = "Switching episode...";
      } else if (watchHistoryStatus === "applying") {
        message = "Restoring your playback position...";
      } else if (
        watchHistoryStatus === "loading" ||
        watchHistoryStatus === "ready"
      ) {
        message = "Loading playback position...";
      }

      showBackdrop(effectiveBackdropURL, {
        fade: true,
        duration: 300,
        blurhash: effectiveBackdropBlurhash as string | undefined,
        message,
      });
    } else if (!shouldShowBackdrop && isControlsReady) {
      console.log("[WatchPage] Hiding backdrop - controls are ready");
      hideBackdrop({ fade: true, duration: 500 });
    }
  }, [
    effectiveBackdropURL,
    effectiveBackdropBlurhash,
    showFullLoading,
    isEpisodeSwitching,
    isControlsReady,
    watchHistoryStatus,
    showBackdrop,
    hideBackdrop,
  ]);

  // Hide backdrop only on true unmount, not on every dep change above.
  const hideBackdropRef = useRef(hideBackdrop);
  hideBackdropRef.current = hideBackdrop;
  useEffect(() => {
    return () => {
      console.log("[WatchPage] Component unmounting - hiding backdrop");
      hideBackdropRef.current({ fade: true, duration: 300 });
    };
  }, []);

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
        fullscreenOptions={{ enable: false }}
        allowsPictureInPicture={false}
        nativeControls={false}
      />

      {isControlsReady ? (
        <StandaloneVideoControls
          player={player}
          videoInfo={videoInfo}
          overlayMode
          onExitWatchMode={handleExit}
          onInfoPress={handleInfoPress}
          showCaptionControls={!!videoInfo?.captionURLs}
          showAudioControls={
            isAdaptiveStreamURL(playbackSourceURL) ||
            isFileTierURL(playbackSourceURL)
          }
          videoURL={playbackSourceURL}
          qualityTiers={quality.tiers}
          activeQualityTier={quality.activeTier}
          onSelectQualityTier={quality.selectTier}
          isQualitySwitching={quality.isSwitching}
          hasQualityDescended={quality.hasDescended}
          qualityBadge={qualityBadge}
          episodes={params.type === "tv" ? episodes : undefined}
          currentEpisodeNumber={effectiveEpisodeNumber}
          onEpisodeSelect={handleEpisodeSelect}
          isLoadingEpisodes={isLoadingEpisodes}
          isEpisodeSwitching={isEpisodeSwitching}
          episodeSwitchError={episodeSwitchError}
        />
      ) : /* Keep backdrop visible with loading message - controls will appear after watch history is applied */
      null}
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
