import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { NetworkStateType, useNetworkState } from "expo-network";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
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
  AppState,
  AppStateStatus,
} from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import MobileVideoControls from "@/src/components/Mobile/Video/MobileVideoControls";
import { Colors } from "@/src/constants/Colors";
import { useDirectPlayInfo } from "@/src/data/hooks/queries/useDirectPlayInfo";
import { useAudioFallback } from "@/src/data/hooks/useAudioFallback";
import { useVideoErrorHandling } from "@/src/data/hooks/useVideoErrorHandling";
import { useVideoTierFallback } from "@/src/data/hooks/useVideoTierFallback";
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
import { qualityPrefMediaKey } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import { navigationHelper } from "@/src/utils/navigationHelper";
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

export default function MobileWatchPage() {
  const params = useLocalSearchParams<{
    id: string;
    type: "tv" | "movie";
    season?: string;
    episode?: string;
    backdrop?: string; // Backdrop URL passed from navigation
    backdropBlurhash?: string; // Backdrop blurhash passed from navigation
    restart?: string; // Restart from beginning flag
  }>();
  const router = useRouter();

  const [isEpisodeSwitching, setIsEpisodeSwitching] = useState(false);
  const isEpisodeSwitchingRef = useRef(false);

  // Track PiP state
  const pipActiveRef = useRef(false);
  const pipWasPlayingRef = useRef(false);
  const lastPipStopAtRef = useRef<number | null>(null);
  // Tunable: how soon after PiP stop we consider "restore"
  const PIP_RESTORE_WINDOW_MS = 1500;

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

  // Cellular awareness for the data-saver preference: on cellular with the
  // saver on, Original/high-bitrate tiers are never auto-applied (explicit
  // in-session selection still works).
  const networkState = useNetworkState();
  const isCellular = networkState.type === NetworkStateType.CELLULAR;

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
    isCellular,
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

  // Buffer Options (mobile-optimized). NOTE: with
  // prioritizeTimeOverSizeThreshold true, media3 keeps loading until the TIME
  // target regardless of maxBufferBytes — the byte value is advisory for HLS.
  const bufferOptions = useMemo<BufferOptions>(
    () => ({
      // More conservative for mobile devices
      preferredForwardBufferDuration: 10, // 10 seconds for mobile
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 2, // 2 seconds minimum for mobile
      maxBufferBytes: 67108864, // 64 MB for mobile (advisory under the flag)
      prioritizeTimeOverSizeThreshold: true,
    }),
    [],
  );

  // Direct-play (/file) sources need the OPPOSITE trade-off: Mp4Extractor
  // materializes the container's full sample index on the Java heap before
  // playback (hundreds of MB for a TrueHD-in-MP4 remux), so the media buffer
  // must be small and the byte cap must actually bind (see the SHIELD OOM in
  // PlaybackErrorDetails.tierDescent telemetry).
  const fileTierBufferOptions = useMemo<BufferOptions>(
    () => ({
      preferredForwardBufferDuration: 8,
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 2,
      maxBufferBytes: 50331648, // 48 MB
      prioritizeTimeOverSizeThreshold: false, // byte cap is authoritative
    }),
    [],
  );
  const activeBufferOptions = isFileTierURL(playbackSourceURL)
    ? fileTierBufferOptions
    : bufferOptions;
  // Ref so the one-shot setup callback reads the value for the source it is
  // actually setting up, without re-running setup on tier switches.
  const activeBufferOptionsRef = useRef(activeBufferOptions);
  activeBufferOptionsRef.current = activeBufferOptions;

  // Create optimized player. The source stays null until the quality
  // preference has resolved — the hook pins its first URL for the mount.
  const { player, notifySourceReplaced } = useOptimizedVideoPlayer(
    quality.sourceReady ? playbackSourceURL : null,
    (p) => {
      p.timeUpdateEventInterval = 1;
      p.loop = false;
      p.bufferOptions = activeBufferOptionsRef.current;

      // Check if we should restart from beginning or resume from watch history
      const shouldRestart = params.restart === "true";
      const watchHistory = effectiveVideoData?.watchHistory;

      if (!shouldRestart && watchHistory && watchHistory.playbackTime > 0) {
        // Resume from saved position (with a small buffer to account for seeking precision)
        const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
        console.log(
          `[MobileWatchPage] Resuming playback from ${resumeTime}s (saved: ${watchHistory.playbackTime}s)`,
        );
        // Survives the async source commit (see resumeGuard).
        applyResumePosition(p, resumeTime, "MobileWatchPage");
      } else if (shouldRestart) {
        p.currentTime = 0;
      }

      p.play();
    },
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

  // Keep buffer options matched to the active tier: a switch onto or off the
  // raw /file source must swap between the HLS profile and the hard-capped
  // direct-play profile.
  useEffect(() => {
    if (!player) return;
    player.bufferOptions = activeBufferOptions;
  }, [player, activeBufferOptions]);

  // Clear restart parameter after player is configured (prevent setState during render)
  useEffect(() => {
    if (params.restart === "true") {
      const cleanParams = { ...params };
      delete cleanParams.restart;
      router.setParams(cleanParams);
    }
  }, [params.restart, router]);

  // Refresh watch history when screen gets focus to sync with other instances
  useFocusEffect(
    useCallback(() => {
      const refreshWatchHistory = async () => {
        if (!player || !params.id || !params.type || !effectiveVideoURL) return;

        // Don't refresh/override if we're in a restart scenario
        if (params.restart === "true") {
          console.log(
            "[MobileWatchPage] Skipping watch history refresh due to restart parameter",
          );
          return;
        }

        try {
          console.log(
            "[MobileWatchPage] Screen focused - refreshing watch history",
          );

          // Fetch fresh media details with watch history
          const freshData = await contentService.getMediaDetails({
            mediaType: params.type,
            mediaId: params.id,
            season: parseNumericParam(params.season),
            episode: parseNumericParam(params.episode),
            includeWatchHistory: true,
          });

          if (
            freshData?.watchHistory &&
            freshData.watchHistory.playbackTime > 0
          ) {
            const currentPlayerTime = player.currentTime || 0;
            const savedTime = freshData.watchHistory.playbackTime;

            // Only update if the saved time is significantly different (more than 30 seconds)
            // and the saved time is newer than current player time
            if (
              Math.abs(savedTime - currentPlayerTime) > 30 &&
              savedTime > currentPlayerTime
            ) {
              const resumeTime = Math.max(0, savedTime - 2);
              console.log(
                `[MobileWatchPage] Updating player time from focus refresh: ${currentPlayerTime}s -> ${resumeTime}s`,
              );
              player.currentTime = resumeTime;
            }
          }
        } catch (error) {
          console.error(
            "[MobileWatchPage] Error refreshing watch history on focus:",
            error,
          );
        }
      };

      // Only refresh if we have essential data and player is ready
      if (effectiveVideoData && !loading && !isEpisodeSwitching) {
        refreshWatchHistory();
      }
    }, [
      player,
      params.id,
      params.type,
      params.season,
      params.episode,
      effectiveVideoURL,
      effectiveVideoData,
      loading,
      isEpisodeSwitching,
      params.restart,
    ]),
  );

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

        // Phase 1: Send final playback update for current episode, and end
        // its presence session. sessionId is deliberately omitted from this
        // update — it's paired with endSession() below for the same session,
        // and the two must never share a sessionId on the wire (see the
        // resurrection footgun note on PlaybackUpdateRequest).
        if (player && effectiveVideoData && effectiveVideoURL) {
          const currentTime = player.currentTime;
          const outgoingSessionId = getSessionId();
          console.log(
            "[MobileWatchPage] Ending presence session for outgoing episode",
            outgoingSessionId,
          );
          endSession();

          if (currentTime > 0) {
            console.log(
              "[MobileWatchPage] Sending final playback update for current episode",
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

        // Phase 3: Replace video source seamlessly. applyEpisodeSource pins
        // the engine's source for the new item (Android "original" demotes to
        // auto — the old file's verdict cannot authorize the new file).
        if (player) {
          console.log("[MobileWatchPage] Replacing video source");
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
        // Clear restart parameter to prevent accidental re-restarts
        router.setParams({
          season: currentSeasonNumber.toString(),
          episode: episode.episodeNumber.toString(),
          // Explicitly omit restart parameter
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
      endSession,
      getSessionId,
      quality.applyEpisodeSource,
    ],
  );

  // Combine content, audio, video, and episode switch errors
  const finalError =
    contentError || audioError || videoError || episodeSwitchError;

  // Separate initial loading from episode switching. Quality-source
  // resolution (preference hydration + bounded verdict wait) is part of
  // initial loading.
  const showFullLoading =
    (loading || !quality.sourceReady) && !currentEpisodeData;

  // Keep screen awake during video playback and handle PiP state changes
  useEffect(() => {
    if (!player) return;

    const listeners: { remove: () => void }[] = [];

    try {
      const playingChangeListener = player.addListener(
        "playingChange",
        ({ isPlaying }) => {
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
        },
      );

      // Note: PiP status change events may not be available in current expo-video version
      // The automatic PiP behavior is handled by startsPictureInPictureAutomatically={true}
      // and the AppState change listeners below

      listeners.push(playingChangeListener);
    } catch (error) {
      console.error(
        "[MobileWatchPage] Error setting up video listeners:",
        error,
      );
    }

    return () => {
      listeners.forEach((listener) => {
        try {
          listener.remove();
        } catch (error) {
          console.error(
            "[MobileWatchPage] Error removing video listener:",
            error,
          );
        }
      });
      // Ensure keep awake is deactivated when component unmounts
      deactivateKeepAwake();
      console.log(
        "[MobileWatchPage] Component unmounting - deactivated keep awake",
      );
    };
  }, [player]);

  // Handle app state changes - only used to resume on restore
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (!player) return;

      if (nextAppState === "active") {
        const stoppedAt = lastPipStopAtRef.current;
        const withinRestoreWindow =
          typeof stoppedAt === "number" &&
          Date.now() - stoppedAt < PIP_RESTORE_WINDOW_MS;

        if (withinRestoreWindow && pipWasPlayingRef.current) {
          console.log("[MobileWatchPage] Likely PiP restore -> resuming");
          try {
            player.play();
          } catch (error) {
            console.warn("[MobileWatchPage] Error resuming on restore:", error);
          }
        }

        // Clear the marker either way so we don't auto-resume later
        lastPipStopAtRef.current = null;
      }

      // Note: Removed "if background then player.play()" logic that was causing
      // video to keep playing after PiP close
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription?.remove();
    };
  }, [player, PIP_RESTORE_WINDOW_MS]);

  // Mobile-optimized exit handler
  const handleExit = useCallback(async () => {
    try {
      // Flush current progress before navigation. sessionId is omitted here
      // since we're ending the presence session right below — the two must
      // never share a sessionId on the wire (see PlaybackUpdateRequest).
      await flushCurrentProgress({ includeSessionId: false });
      await endSession();
    } catch (error) {
      console.error(
        "[MobileWatchPage] Error flushing progress on exit:",
        error,
      );
    }

    // Restore system bars
    SystemBars.setHidden(false);
    router.back();
  }, [flushCurrentProgress, endSession, router]);

  // Mobile-optimized info navigation
  const handleInfoPress = useCallback(async () => {
    try {
      // Flush current progress before navigation (sessionId omitted — see handleExit).
      await flushCurrentProgress({ includeSessionId: false });
      await endSession();
    } catch (error) {
      console.error(
        "[MobileWatchPage] Error flushing progress on info navigation:",
        error,
      );
    }

    // Restore system bars
    SystemBars.setHidden(false);

    // Navigate to media info page using replace to prevent Watch screen accumulation
    navigationHelper.navigateToMediaInfo(
      {
        id: params.id,
        type: params.type,
        ...(params.season && { season: parseInt(params.season, 10) }),
      },
      false,
      true,
    ); // fromEpisodeInfo = false, fromWatch = true
  }, [
    flushCurrentProgress,
    endSession,
    router,
    params.id,
    params.type,
    params.season,
  ]);

  // Handle PiP start
  const handlePiPStart = useCallback(() => {
    pipActiveRef.current = true;
    pipWasPlayingRef.current = !!player?.playing;
    lastPipStopAtRef.current = null;

    console.log(
      "[MobileWatchPage] Entered PiP, wasPlaying:",
      pipWasPlayingRef.current,
    );

    // Optional: some devices pause when entering PiP — kick it back on
    try {
      if (pipWasPlayingRef.current && player && !player.playing) {
        player.play();
      }
    } catch (error) {
      console.warn("[MobileWatchPage] Error resuming on PiP start:", error);
    }
  }, [player]);

  // Handle PiP stop - pause immediately (no timer)
  const handlePiPStop = useCallback(async () => {
    pipActiveRef.current = false;
    lastPipStopAtRef.current = Date.now();

    console.log("[MobileWatchPage] Exited PiP -> pausing immediately");

    // Pause immediately (no setTimeout)
    try {
      await flushCurrentProgress();
    } catch (error) {
      console.warn(
        "[MobileWatchPage] flushCurrentProgress failed on PiP stop:",
        error,
      );
    }

    try {
      player?.pause();
    } catch (error) {
      console.warn("[MobileWatchPage] player.pause failed on PiP stop:", error);
    }

    deactivateKeepAwake();
  }, [player, flushCurrentProgress]);

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
        fullscreenOptions={{ enable: false }}
        startsPictureInPictureAutomatically={true}
        allowsPictureInPicture={true}
        nativeControls={false}
        onPictureInPictureStart={handlePiPStart}
        onPictureInPictureStop={handlePiPStop}
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
