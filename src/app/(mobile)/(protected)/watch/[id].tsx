import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { NetworkStateType, useNetworkState } from "expo-network";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { BufferOptions, VideoPlayer, VideoView } from "expo-video";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
import { MediaDetailsResponse } from "@/src/data/types/content.types";
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
function useContentLoader(params: {
  id: string;
  type: "tv" | "movie";
  season?: string;
  episode?: string;
}) {
  const [videoURL, setVideoURL] = useState<string | null>(null);
  const [videoData, setVideoData] = useState<MediaDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!params.id || !params.type) return;

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
  }, [params.id, params.type, params.season, params.episode]);

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

  // "Restart From Beginning" applies to THIS mount only. Tracked in a ref
  // rather than by clearing the route param: expo-router's setParams goes
  // through React Navigation's SET_PARAMS, which shallow-merges, so a
  // deleted key never actually leaves the params and the flag stuck for the
  // life of the screen — disabling the focus-refresh sync entirely.
  const restartedThisMountRef = useRef(params.restart === "true");

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

  // Content loading (abstracted)
  const { videoURL, videoData, loading, contentError } =
    useContentLoader(params);

  // Current episode and season from params
  const currentEpisodeNumber = params.episode
    ? parseInt(params.episode, 10)
    : undefined;
  const currentSeasonNumber = params.season ? parseInt(params.season, 10) : 1;

  // Mobile has no in-player episode switching (the controls expose no
  // episode picker; an episode change is a fresh navigation), so the loaded
  // content is the effective content.
  const effectiveVideoData = videoData;
  const effectiveVideoURL = videoURL;
  const effectiveEpisodeNumber = currentEpisodeNumber;

  // Watch-history/presence identity is the canonical master URL no matter
  // which tier is playing, so stored videoId strings stay stable. (The
  // server folds tier variants itself; this keeps the wire tidy.)
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
    playbackSource: effectiveVideoData?.playbackSource ?? null,
  });

  const playbackSourceURL = quality.activeSourceURL;

  // Backdrop URL resolution - prioritize route param, then loaded data
  const effectiveBackdropURL =
    params.backdrop || // From route navigation
    videoData?.backdrop; // From initial data load

  // Backdrop blurhash resolution - prioritize route param, then loaded data
  const effectiveBackdropBlurhash =
    params.backdropBlurhash || // From route navigation
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
      const shouldRestart = restartedThisMountRef.current;
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

  // Enable playback + presence tracking, keyed by the canonical identity URL
  const {
    flushCurrentProgress,
    endSession,
    suspendTracking,
    getSessionId,
    getLastSentAt,
  } = usePlaybackPresenceTracking(
    player,
    effectiveVideoData,
    presenceVideoId,
    params,
  );

  // Refresh watch history when screen gets focus to sync with other instances
  useFocusEffect(
    useCallback(() => {
      const refreshWatchHistory = async () => {
        if (!player || !params.id || !params.type || !effectiveVideoURL) return;

        // After a Restart the server row is the OLD position until this
        // session's first write lands; applying it would undo the restart.
        // Once something has been sent, the newer-than check below is the
        // gate instead, so cross-device sync works again mid-session.
        if (restartedThisMountRef.current && getLastSentAt() === 0) {
          console.log(
            "[MobileWatchPage] Skipping watch history refresh — restarted and nothing sent yet",
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
            // Only a row written AFTER this session's last write can be
            // another device's progress (a rewind on the web or the TV
            // counts as much as a fast-forward). An older row is just this
            // device's own history echoed back.
            const rowWrittenAt = Date.parse(freshData.watchHistory.lastWatched);
            const isNewerThanOurs =
              Number.isNaN(rowWrittenAt) || rowWrittenAt > getLastSentAt();

            // Only update if the saved time is significantly different
            // (more than 30 seconds), in either direction.
            if (
              isNewerThanOurs &&
              Math.abs(savedTime - currentPlayerTime) > 30
            ) {
              const resumeTime = Math.max(0, savedTime - 2);
              console.log(
                `[MobileWatchPage] Updating player time from focus refresh: ${currentPlayerTime}s -> ${resumeTime}s`,
              );
              applyResumePosition(player, resumeTime, "MobileWatchPage:focus");
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
      if (effectiveVideoData && !loading) {
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
      getLastSentAt,
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

  // Combine content, audio and video errors
  const finalError = contentError || audioError || videoError;

  // Quality-source resolution (preference hydration + bounded verdict wait)
  // is part of initial loading.
  const showFullLoading = loading || !quality.sourceReady;

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
    // Detach the tracker before navigating: the screen blurs while still
    // mounted and the player hook's blur cleanup pauses the player — that
    // pause event must not turn into a write for the session just ended.
    suspendTracking();

    // Restore system bars
    SystemBars.setHidden(false);
    router.back();
  }, [flushCurrentProgress, endSession, suspendTracking, router]);

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
    suspendTracking(); // see handleExit

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
    suspendTracking,
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
    // Only show backdrop during initial loading
    if (showFullLoading && effectiveBackdropURL) {
      console.log(
        "[MobileWatchPage] Showing backdrop for loading state:",
        effectiveBackdropURL,
      );

      showBackdrop(effectiveBackdropURL, {
        fade: true,
        duration: 300,
        blurhash: effectiveBackdropBlurhash as string | undefined,
        message: "Loading video...",
      });
    }

    // Hide backdrop when we're done with initial loading
    if (!showFullLoading) {
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
