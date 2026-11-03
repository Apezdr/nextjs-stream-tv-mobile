import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { NetworkStateType, useNetworkState } from "expo-network";
import { BufferOptions, VideoPlayer } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

import { useDirectPlayInfo } from "@/src/data/hooks/queries/useDirectPlayInfo";
import { useAudioFallback } from "@/src/data/hooks/useAudioFallback";
import { useSilentTrackGuard } from "@/src/data/hooks/useSilentTrackGuard";
import { useVideoErrorHandling } from "@/src/data/hooks/useVideoErrorHandling";
import { useVideoTierFallback } from "@/src/data/hooks/useVideoTierFallback";
import { contentService } from "@/src/data/services/contentService";
import { useActiveVideoTrack } from "@/src/hooks/useActiveVideoTrack";
import { setVerdictAudioTracks } from "@/src/hooks/useAudioTracks";
import { useOptimizedVideoPlayer } from "@/src/hooks/useOptimizedVideoPlayer";
import { usePlaybackPresenceTracking } from "@/src/hooks/usePlaybackPresenceTracking";
import { useQualityTier } from "@/src/hooks/useQualityTier";
import { useVideoRange } from "@/src/hooks/useVideoRange";
import { useWatchContentLoader } from "@/src/hooks/useWatchContentLoader";
import { qualityPrefMediaKey } from "@/src/stores/qualityPreferencesStore";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import { createPipExitArbiter } from "@/src/utils/pipExit";
import { describeActiveQuality } from "@/src/utils/qualityTiers";
import { applyResumePosition } from "@/src/utils/resumeGuard";
import { canonicalVideoId, isFileTierURL } from "@/src/utils/streamUrls";
import {
  NowPlayingMetadata,
  setNowPlayingMetadata,
} from "@/src/utils/videoRange";

const LOG = "[MobilePlaybackSession]";

// How long after a PiP stop we wait for the Activity to resume before
// treating the stop as a dismissal (see createPipExitArbiter). An expand
// resumes well inside this; a dismissal never does.
const PIP_DISMISS_GRACE_MS = 2500;

export interface MobilePlaybackSessionInput {
  id: string;
  type: "tv" | "movie";
  season?: number;
  episode?: number;
  /** Start from the beginning even when the history has a position. */
  restart?: boolean;
}

/** The route-style params the shared playback hooks were written for. */
export interface MobilePlaybackParams {
  id: string;
  type: "tv" | "movie";
  season?: string;
  episode?: string;
}

export interface WatchVideoInfo {
  type?: "tv" | "movie" | null;
  title: string;
  description?: string;
  logo?: string;
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
  showTitle?: string;
}

/**
 * One mobile playback session: the content load, the player, delivery-tier
 * policy, error handling, watch-history resume and sync, presence tracking,
 * keep-awake and the picture-in-picture arbitration. This is the former
 * mobile watch screen's logic with the screen taken out: it does not know
 * where the video is drawn or how big, which is the session component's
 * business, and it does not navigate. A new title or episode is a new
 * mount (the host keys the session component), so every hook here keeps its
 * one-title-per-mount assumptions.
 */
export interface MobilePlaybackSessionOptions {
  /** Called when a PiP window is expanded back into the app. */
  onPictureInPictureExpanded?: () => void;
}

export function useMobilePlaybackSession(
  input: MobilePlaybackSessionInput,
  options: MobilePlaybackSessionOptions = {},
) {
  const onPictureInPictureExpandedRef = useRef(
    options.onPictureInPictureExpanded,
  );
  onPictureInPictureExpandedRef.current = options.onPictureInPictureExpanded;
  const params = useMemo<MobilePlaybackParams>(
    () => ({
      id: input.id,
      type: input.type,
      season: input.season !== undefined ? String(input.season) : undefined,
      episode: input.episode !== undefined ? String(input.episode) : undefined,
    }),
    [input.id, input.type, input.season, input.episode],
  );

  // "Restart from beginning" applies to THIS mount only.
  const restartedThisMountRef = useRef(!!input.restart);

  // PiP state: a ref for the guards that read it, state for the chrome.
  const pipActiveRef = useRef(false);
  const pipWasPlayingRef = useRef(false);
  const [isInPictureInPicture, setIsInPictureInPicture] = useState(false);

  // Video player loading states
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);

  // Content loading (abstracted)
  const { videoURL, videoData, loading, contentError, retryContent } =
    useWatchContentLoader(params);

  const currentSeasonNumber = input.season ?? 1;

  // Mobile has no in-player source swap for an episode change (a new
  // episode is a new session mount), so the loaded content is the effective
  // content.
  const effectiveVideoData = videoData;
  const effectiveVideoURL = videoURL;

  // Watch-history/presence identity is the canonical master URL no matter
  // which tier is playing, so stored videoId strings stay stable.
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
      const episode = effectiveVideoData?.episodeNumber ?? input.episode;
      if (season == null || episode == null) return null;
      return { mediaType: params.type, mediaId: params.id, season, episode };
    }
    return { mediaType: params.type, mediaId: params.id };
  }, [
    params.id,
    params.type,
    effectiveVideoData,
    currentSeasonNumber,
    input.episode,
  ]);
  const { data: directPlayInfo } = useDirectPlayInfo(directPlayInfoParams);

  // Cellular awareness for the data-saver preference.
  const networkState = useNetworkState();
  const isCellular = networkState.type === NetworkStateType.CELLULAR;

  // Delivery-tier source policy + in-place tier switching (§4-§6).
  const playerRef = useRef<VideoPlayer | null>(null);
  const notifySourceReplacedRef = useRef<((url: string | null) => void) | null>(
    null,
  );
  // Publish the server's per-track audio verdict for the audio choosers.
  useEffect(() => {
    setVerdictAudioTracks(directPlayInfo?.file?.audioTracks);
    return () => setVerdictAudioTracks(null);
  }, [directPlayInfo]);

  const videoRange = useVideoRange(effectiveVideoData);

  // What the system's media notification shows. Written during render, not
  // in an effect: the player below builds its source object while rendering
  // (useVideoPlayer → videoSourceFor), and the metadata has to be in place
  // by then. The registry write is idempotent; cleared on unmount.
  const nowPlaying = useMemo<NowPlayingMetadata | null>(() => {
    if (!effectiveVideoData) return null;
    const showTitle = effectiveVideoData.showTitle as string | undefined;
    const title = effectiveVideoData.title || showTitle || "";
    if (!title) return null;
    const episodeLine =
      effectiveVideoData.type === "tv" &&
      effectiveVideoData.seasonNumber !== undefined &&
      effectiveVideoData.episodeNumber !== undefined
        ? `S${String(effectiveVideoData.seasonNumber).padStart(2, "0")}E${String(
            effectiveVideoData.episodeNumber,
          ).padStart(2, "0")}`
        : null;
    const artist =
      effectiveVideoData.type === "tv"
        ? [showTitle, episodeLine].filter(Boolean).join(" · ") || undefined
        : undefined;
    return {
      title,
      artist,
      artwork: effectiveVideoData.backdrop || effectiveVideoData.posterURL,
    };
  }, [effectiveVideoData]);
  const lastNowPlayingRef = useRef<NowPlayingMetadata | null>(null);
  if (lastNowPlayingRef.current !== nowPlaying) {
    lastNowPlayingRef.current = nowPlaying;
    setNowPlayingMetadata(nowPlaying);
  }
  useEffect(() => () => setNowPlayingMetadata(null), []);

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
    videoRange,
  });

  const playbackSourceURL = quality.activeSourceURL;

  // Buffer Options (mobile-optimized). NOTE: with
  // prioritizeTimeOverSizeThreshold true, media3 keeps loading until the TIME
  // target regardless of maxBufferBytes — the byte value is advisory for HLS.
  const bufferOptions = useMemo<BufferOptions>(
    () => ({
      preferredForwardBufferDuration: 10,
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 2,
      maxBufferBytes: 67108864,
      prioritizeTimeOverSizeThreshold: true,
    }),
    [],
  );

  // Direct-play (/file) sources need the OPPOSITE trade-off: Mp4Extractor
  // materializes the container's full sample index on the Java heap before
  // playback, so the media buffer must be small and the byte cap must bind.
  const fileTierBufferOptions = useMemo<BufferOptions>(
    () => ({
      preferredForwardBufferDuration: 8,
      waitsToMinimizeStalling: true,
      minBufferForPlayback: 2,
      maxBufferBytes: 50331648,
      prioritizeTimeOverSizeThreshold: false,
    }),
    [],
  );
  const activeBufferOptions = isFileTierURL(playbackSourceURL)
    ? fileTierBufferOptions
    : bufferOptions;
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
      // Media controls in the system shade (title and artwork come from the
      // source's metadata). Needs the plugin's supportsBackgroundPlayback.
      p.showNowPlayingNotification = true;

      const shouldRestart = restartedThisMountRef.current;
      const watchHistory = effectiveVideoData?.watchHistory;

      if (!shouldRestart && watchHistory && watchHistory.playbackTime > 0) {
        const resumeTime = Math.max(0, watchHistory.playbackTime - 2);
        console.log(
          `${LOG} Resuming playback from ${resumeTime}s (saved: ${watchHistory.playbackTime}s)`,
        );
        applyResumePosition(p, resumeTime, "MobilePlaybackSession");
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

  // Keep buffer options matched to the active tier.
  useEffect(() => {
    if (!player) return;
    player.bufferOptions = activeBufferOptions;
  }, [player, activeBufferOptions]);

  // Playback + presence tracking, keyed by the canonical identity URL
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

  // Cross-device sync: when the app comes back to the foreground, pick up a
  // position another device wrote meanwhile. (The former screen did this on
  // navigation focus; the session never blurs, so the app's own foreground
  // edge is the equivalent moment.) A return from PiP is not one: nothing
  // elsewhere could have moved while this device was the one playing.
  const refreshWatchHistory = useCallback(async () => {
    if (!player || !params.id || !params.type || !effectiveVideoURL) return;
    if (!effectiveVideoData || loading) return;

    // After a Restart the server row is the OLD position until this
    // session's first write lands; applying it would undo the restart.
    if (restartedThisMountRef.current && getLastSentAt() === 0) {
      console.log(
        `${LOG} Skipping watch history refresh — restarted and nothing sent yet`,
      );
      return;
    }

    try {
      console.log(`${LOG} App foregrounded - refreshing watch history`);
      const freshData = await contentService.getMediaDetails({
        mediaType: params.type,
        mediaId: params.id,
        season: input.season,
        episode: input.episode,
        includeWatchHistory: true,
      });

      if (freshData?.watchHistory && freshData.watchHistory.playbackTime > 0) {
        const currentPlayerTime = player.currentTime || 0;
        const savedTime = freshData.watchHistory.playbackTime;
        // Only a row written AFTER this session's last write can be another
        // device's progress. An older row is just this device's own history
        // echoed back.
        const rowWrittenAt = Date.parse(freshData.watchHistory.lastWatched);
        const isNewerThanOurs =
          Number.isNaN(rowWrittenAt) || rowWrittenAt > getLastSentAt();

        if (isNewerThanOurs && Math.abs(savedTime - currentPlayerTime) > 30) {
          const resumeTime = Math.max(0, savedTime - 2);
          console.log(
            `${LOG} Updating player time from foreground refresh: ${currentPlayerTime}s -> ${resumeTime}s`,
          );
          applyResumePosition(player, resumeTime, "MobilePlaybackSession:fg");
        }
      }
    } catch (error) {
      console.error(`${LOG} Error refreshing watch history:`, error);
    }
  }, [
    player,
    params.id,
    params.type,
    input.season,
    input.episode,
    effectiveVideoURL,
    effectiveVideoData,
    loading,
    getLastSentAt,
  ]);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const previous = appStateRef.current;
      appStateRef.current = next;
      if (next !== "active" || previous === "active") return;
      if (pipActiveRef.current) return;
      void refreshWatchHistory();
    });
    return () => sub.remove();
  }, [refreshWatchHistory]);

  // Video player loading state tracking
  useEffect(() => {
    if (!player) return;

    setIsVideoLoading(true);
    setIsVideoPlaying(false);

    const listeners: { remove: () => void }[] = [];

    try {
      const statusListener = player.addListener("statusChange", (status) => {
        console.log(`${LOG} Video status changed:`, status);
        if (status.status === "readyToPlay" && !status.error) {
          setIsVideoLoading(false);
        }
      });

      const playingListener = player.addListener(
        "playingChange",
        ({ isPlaying }) => {
          setIsVideoPlaying(isPlaying);
          if (isPlaying) setIsVideoLoading(false);
        },
      );

      const sourceListener = player.addListener("sourceChange", () => {
        console.log(`${LOG} Video source changed - resetting loading state`);
        setIsVideoLoading(true);
        setIsVideoPlaying(false);
      });

      listeners.push(statusListener, playingListener, sourceListener);
    } catch (error) {
      console.error(`${LOG} Error setting up video loading listeners:`, error);
    }

    return () => {
      listeners.forEach((listener) => {
        try {
          listener.remove();
        } catch (error) {
          console.error(`${LOG} Error removing video loading listener:`, error);
        }
      });
    };
  }, [player]);

  // Handle audio-codec errors and fallback using what is actually playing
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

  const videoError = useVideoErrorHandling({
    player,
    videoURL: playbackSourceURL,
    getPlaybackSessionId: getSessionId,
    mediaId: params.id ?? null,
    mediaType: params.type ?? null,
    suppressWhile: tierFallback.isHandling,
  });

  // The failures no error announces: ready, clock running, but no video
  // track selected / no frame drawn / no audio track selected.
  const silentGuard = useSilentTrackGuard({
    player,
    quality,
    videoURL: playbackSourceURL,
    enabled: !(loading || !quality.sourceReady) && !!player,
    isHandlingError: tierFallback.isHandling,
    isInPictureInPicture: () => pipActiveRef.current,
    preferredLanguages: ["en"],
    getPlaybackSessionId: getSessionId,
    mediaId: params.id ?? null,
    mediaType: params.type ?? null,
  });

  const error = contentError || audioError || videoError || silentGuard.error;

  // Quality-source resolution (preference hydration + bounded verdict wait)
  // is part of initial loading.
  const isLoading = loading || !quality.sourceReady;

  // Keep the screen awake during video playback
  useEffect(() => {
    if (!player) return;

    const listeners: { remove: () => void }[] = [];
    try {
      listeners.push(
        player.addListener("playingChange", ({ isPlaying }) => {
          if (isPlaying) {
            activateKeepAwakeAsync();
          } else {
            deactivateKeepAwake();
          }
        }),
      );
    } catch (error) {
      console.error(`${LOG} Error setting up keep-awake listener:`, error);
    }

    return () => {
      listeners.forEach((listener) => {
        try {
          listener.remove();
        } catch (error) {
          console.error(`${LOG} Error removing keep-awake listener:`, error);
        }
      });
      deactivateKeepAwake();
    };
  }, [player]);

  // PiP exit arbitration: `onPictureInPictureStop` fires both when the PiP
  // window is expanded back into the app and when it is dismissed with its
  // close button; only the dismissal should pause (see createPipExitArbiter).
  const flushCurrentProgressRef = useRef(flushCurrentProgress);
  flushCurrentProgressRef.current = flushCurrentProgress;
  const pipExitArbiter = useMemo(
    () =>
      createPipExitArbiter({
        graceMs: PIP_DISMISS_GRACE_MS,
        onOutcome: (outcome) => {
          const currentPlayer = playerRef.current;
          if (outcome === "expanded") {
            console.log(`${LOG} PiP expanded back into the app -> playing`);
            try {
              if (
                pipWasPlayingRef.current &&
                currentPlayer &&
                !currentPlayer.playing
              ) {
                currentPlayer.play();
              }
            } catch (error) {
              console.warn(`${LOG} Error resuming after PiP expand:`, error);
            }
            onPictureInPictureExpandedRef.current?.();
            return;
          }

          // A background stop is called a dismissal at once (see pipExit):
          // the pause here is undone within the grace window if it turns
          // out to be an expand.
          console.log(`${LOG} PiP stopped in the background -> pausing`);
          // Pause FIRST. The flush is a network round trip; when the pause
          // waited behind it, an expand's resume (a few hundred ms after
          // the stop) ran before the pause, which then landed on the
          // restored app and left it paused.
          try {
            playerRef.current?.pause();
          } catch (error) {
            console.warn(`${LOG} player.pause failed on PiP dismiss:`, error);
          }
          deactivateKeepAwake();
          flushCurrentProgressRef.current().catch((error) => {
            console.warn(
              `${LOG} flushCurrentProgress failed on PiP dismiss:`,
              error,
            );
          });
        },
      }),
    [],
  );

  // The resume that follows a PiP expand arrives here.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      pipExitArbiter.onAppStateChange(next);
    });
    return () => {
      subscription?.remove();
      pipExitArbiter.cancel();
    };
  }, [pipExitArbiter]);

  const handlePiPStart = useCallback(() => {
    pipActiveRef.current = true;
    setIsInPictureInPicture(true);
    pipWasPlayingRef.current = !!player?.playing;
    pipExitArbiter.cancel();
    console.log(`${LOG} Entered PiP, wasPlaying:`, pipWasPlayingRef.current);

    // Some devices pause when entering PiP — kick it back on
    try {
      if (pipWasPlayingRef.current && player && !player.playing) {
        player.play();
      }
    } catch (error) {
      console.warn(`${LOG} Error resuming on PiP start:`, error);
    }
  }, [player, pipExitArbiter]);

  const handlePiPStop = useCallback(() => {
    pipActiveRef.current = false;
    setIsInPictureInPicture(false);
    const appState = AppState.currentState;
    console.log(`${LOG} Exited PiP, app state:`, appState);
    pipExitArbiter.onPipStop(appState);
  }, [pipExitArbiter]);

  /**
   * Wrap the session up before it goes away for good: write the position,
   * end the presence row and detach the tracker so nothing the teardown
   * does (the player's pause) turns into a write for a session just ended.
   */
  const finish = useCallback(async () => {
    try {
      // sessionId omitted: the presence session ends right below, and the
      // two must never share a sessionId on the wire.
      await flushCurrentProgress({ includeSessionId: false });
      await endSession();
    } catch (error) {
      console.error(`${LOG} Error flushing progress on finish:`, error);
    }
    suspendTracking();
  }, [flushCurrentProgress, endSession, suspendTracking]);

  const videoInfo = useMemo<WatchVideoInfo | undefined>(
    () =>
      effectiveVideoData
        ? {
            type: effectiveVideoData.type,
            title: effectiveVideoData.title || "",
            description: effectiveVideoData.metadata?.overview,
            logo: effectiveVideoData.logo,
            captionURLs: effectiveVideoData.captionURLs as
              WatchVideoInfo["captionURLs"] | undefined,
            backdrop: effectiveVideoData.backdrop,
            showTitle: effectiveVideoData.showTitle as string | undefined,
          }
        : undefined,
    [effectiveVideoData],
  );

  return {
    params,
    player,
    videoData: effectiveVideoData,
    videoURL: effectiveVideoURL,
    playbackSourceURL,
    videoInfo,
    quality,
    directPlayInfo,
    qualityBadge,
    isLoading,
    isVideoLoading,
    isVideoPlaying,
    error,
    contentError,
    retryContent,
    silentGuard,
    isInPictureInPicture,
    handlePiPStart,
    handlePiPStop,
    finish,
  };
}
