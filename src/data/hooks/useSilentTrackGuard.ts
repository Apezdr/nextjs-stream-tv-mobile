// The silent-failure guard. media3 raises no error when a track has no
// decoder: it leaves the track unselected and plays the rest. On the raw
// file tier that is audio over a black screen; none of the error-driven
// hooks (useVideoErrorHandling, useVideoTierFallback, useAudioFallback) can
// see it, because nothing errors. This hook watches what the player reports
// after readyToPlay — the listed tracks, the selected ones, whether a frame
// was ever drawn, and how far the playback clock has run — and acts when
// the pure policy in silentTrackGuardPolicy says so: a report (severity
// `error`, never fatal: playback did not stop, it showed nothing), then a
// descent on the pinned tiers or the error card on the ladder tiers; for
// audio, a supported sibling track first.
import type { AudioTrack, VideoPlayer, VideoTrack } from "expo-video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  SilentGuardSnapshot,
  accumulateClock,
  decideSilentFailure,
} from "@/src/data/hooks/silentTrackGuardPolicy";
import { pickFallbackAudioTrack } from "@/src/data/hooks/useAudioFallback";
import type {
  SilentFailureDetails,
  SilentFailureVerdict,
} from "@/src/data/types/clientError.types";
import { isAudioTrackSupported } from "@/src/hooks/useAudioTracks";
import type { QualityTierController } from "@/src/hooks/useQualityTier";
import { getPlatformClass } from "@/src/utils/deviceInfo";
import { getCachedAudioGroups } from "@/src/utils/hlsAudioFormats";
import { applyResumePosition } from "@/src/utils/resumeGuard";
import { describeStreamTier, isPinnedTierURL } from "@/src/utils/streamUrls";
import { logSilentPlaybackFailure } from "@/src/utils/videoDiagnostics";
import { videoSourceFor } from "@/src/utils/videoRange";

/** The ladder-tier card: nothing lower to descend to. */
export const SILENT_FAILURE_COPY =
  "This device can't play this video's format.";

interface Options {
  player: VideoPlayer | null;
  quality: QualityTierController;
  /** The active source URL (what the player currently holds). */
  videoURL: string | null;
  /** False while the VideoView is not mounted; no verdict can form then. */
  enabled: boolean;
  /** useVideoTierFallback's isHandling — a recovery in progress pauses us. */
  isHandlingError: () => boolean;
  isInPictureInPicture?: () => boolean;
  preferredLanguages: string[];
  getPlaybackSessionId?: () => string | null;
  mediaId?: string | null;
  mediaType?: string | null;
}

interface SourceState {
  url: string | null;
  /** The first readyToPlay for this source opened the evaluation window. */
  started: boolean;
  lastTime: number | null;
  clock: number;
  firstFrame: boolean;
  audioRetryDone: boolean;
  decided: Set<SilentFailureVerdict>;
  acted: boolean;
}

function freshState(url: string | null): SourceState {
  return {
    url,
    started: false,
    lastTime: null,
    clock: 0,
    firstFrame: false,
    audioRetryDone: false,
    decided: new Set(),
    acted: false,
  };
}

function trackDetails(
  videoTracks: VideoTrack[],
  audioTracks: AudioTrack[],
): Pick<SilentFailureDetails, "videoTracks" | "audioTracks"> {
  return {
    videoTracks: videoTracks.map((t) => ({
      id: t.id ?? null,
      mimeType: t.mimeType ?? null,
      width: t.size?.width ?? null,
      height: t.size?.height ?? null,
      isSupported: typeof t.isSupported === "boolean" ? t.isSupported : null,
    })),
    audioTracks: audioTracks.map((t) => ({
      id: t.id ?? null,
      sampleMimeType: t.sampleMimeType ?? null,
      isSupported: typeof t.isSupported === "boolean" ? t.isSupported : null,
    })),
  };
}

export function useSilentTrackGuard({
  player,
  quality,
  videoURL,
  enabled,
  isHandlingError,
  isInPictureInPicture,
  preferredLanguages,
  getPlaybackSessionId,
  mediaId,
  mediaType,
}: Options): {
  error: string | null;
  onFirstFrameRender: () => void;
  /** The card's "Try again": reload the same source at position and watch again. */
  retry: () => Promise<void>;
} {
  const platformClass = useMemo(() => getPlatformClass(), []);
  const [error, setError] = useState<string | null>(null);

  // Refs so the single per-player subscription reads current values.
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const optionsRef = useRef({
    videoURL,
    enabled,
    isHandlingError,
    isInPictureInPicture,
    preferredLanguages,
    getPlaybackSessionId,
    mediaId,
    mediaType,
  });
  optionsRef.current = {
    videoURL,
    enabled,
    isHandlingError,
    isInPictureInPicture,
    preferredLanguages,
    getPlaybackSessionId,
    mediaId,
    mediaType,
  };
  const stateRef = useRef<SourceState>(freshState(videoURL));
  const actingRef = useRef(false);

  // A new source (tier switch, retry, descent, episode) is a fresh window.
  useEffect(() => {
    if (stateRef.current.url !== videoURL) {
      stateRef.current = freshState(videoURL);
    }
  }, [videoURL]);

  const onFirstFrameRender = useCallback(() => {
    stateRef.current.firstFrame = true;
  }, []);

  const retry = useCallback(async () => {
    const url = optionsRef.current.videoURL;
    if (!player || !url) return;
    const position = qualityRef.current.positionHintRef.current;
    console.log(
      `[useSilentTrackGuard] Retrying ${url} at ${position.toFixed(1)}s`,
    );
    stateRef.current = freshState(url);
    setError(null);
    try {
      await player.replaceAsync(videoSourceFor(url));
      if (position > 0) {
        applyResumePosition(player, position, "useSilentTrackGuard");
      }
      player.play();
    } catch (e) {
      console.error("[useSilentTrackGuard] Retry failed:", e);
    }
  }, [player]);

  useEffect(() => {
    if (!player) return;
    const p = player;

    const act = async (
      verdict: SilentFailureVerdict,
      action: "descend-or-card" | "audio-retry" | "report-only",
      videoTracks: VideoTrack[],
      audioTracks: AudioTrack[],
      videoTrack: VideoTrack | null,
      audioTrack: AudioTrack | null,
    ) => {
      const state = stateRef.current;
      const opts = optionsRef.current;
      const q = qualityRef.current;
      const url = state.url;

      if (action === "audio-retry") {
        // One in-place attempt at a track the device can decode; no reload.
        state.audioRetryDone = true;
        const candidates = audioTracks.filter(isAudioTrackSupported);
        const next = pickFallbackAudioTrack(
          candidates,
          audioTrack,
          new Set(),
          getCachedAudioGroups(url),
          opts.preferredLanguages,
        );
        if (next) {
          console.warn(
            `[useSilentTrackGuard] No audio track selected — trying ${next.id ?? next.label}`,
          );
          try {
            p.audioTrack = next;
          } catch (e) {
            console.warn(
              "[useSilentTrackGuard] Audio track assignment failed:",
              e,
            );
          }
        } else {
          console.warn(
            "[useSilentTrackGuard] No audio track selected and no supported sibling to try",
          );
        }
        return;
      }

      state.decided.add(verdict);
      const details: SilentFailureDetails = {
        verdict,
        action,
        clockAdvancedSec: Math.round(state.clock * 10) / 10,
        firstFrameSeen: state.firstFrame,
        tier: describeStreamTier(url),
        ...trackDetails(videoTracks, audioTracks),
        selectedVideoTrack: videoTrack?.id ?? null,
        selectedAudioTrack: audioTrack?.id ?? null,
      };
      const common = {
        videoURL: url,
        playerStatus: p.status,
        playbackSessionId: opts.getPlaybackSessionId?.() ?? null,
        mediaId: opts.mediaId ?? null,
        mediaType: opts.mediaType ?? null,
      };

      if (action === "report-only") {
        console.warn(`[useSilentTrackGuard] ${verdict} (report only)`, details);
        logSilentPlaybackFailure({
          silentFailure: details,
          severity: "warning",
          ...common,
        });
        return;
      }

      // descend-or-card
      state.acted = true;
      const pinned = isPinnedTierURL(url);
      const target = pinned ? q.descentTarget : null;
      console.warn(
        `[useSilentTrackGuard] ${verdict} — ${target ? `descending ${q.activeTier} → ${target}` : "nothing lower; showing the card"}`,
        details,
      );
      logSilentPlaybackFailure({
        silentFailure: details,
        severity: "error",
        ...common,
        ...(target
          ? {
              tierDescent: {
                from: q.activeTier,
                to: target,
                position: q.positionHintRef.current,
              },
            }
          : {}),
      });
      if (target) {
        const descended = await q.descendTier();
        if (descended) return;
      }
      setError(SILENT_FAILURE_COPY);
    };

    const evaluate = () => {
      const state = stateRef.current;
      const opts = optionsRef.current;
      const q = qualityRef.current;
      if (!state.started || state.acted || actingRef.current) return;
      if (q.isBusy()) return;

      let videoTracks: VideoTrack[];
      let audioTracks: AudioTrack[];
      let videoTrack: VideoTrack | null;
      let audioTrack: AudioTrack | null;
      let status: string;
      let playing: boolean;
      try {
        videoTracks = p.availableVideoTracks ?? [];
        audioTracks = p.availableAudioTracks ?? [];
        videoTrack = p.videoTrack ?? null;
        audioTrack = p.audioTrack ?? null;
        status = p.status;
        playing = p.playing;
      } catch {
        // The native getters can throw while the player is tearing down.
        return;
      }

      const snapshot: SilentGuardSnapshot = {
        platformClass,
        appActive: AppState.currentState === "active",
        inPictureInPicture: opts.isInPictureInPicture?.() ?? false,
        viewMounted: opts.enabled,
        status,
        playing,
        isSwitching: q.isSwitching,
        isHandlingError: opts.isHandlingError(),
        clockAdvancedSec: state.clock,
        firstFrameSeen: state.firstFrame,
        videoTracks: videoTracks.map((t) => ({
          id: t.id ?? null,
          mimeType: t.mimeType ?? null,
          isSupported:
            typeof t.isSupported === "boolean" ? t.isSupported : null,
        })),
        videoTrackSelected: videoTrack !== null,
        audioTracks: audioTracks.map((t) => ({
          id: t.id ?? null,
          isSupported:
            typeof t.isSupported === "boolean" ? t.isSupported : null,
        })),
        audioTrackSelected: audioTrack !== null,
        audioRetryDone: state.audioRetryDone,
        alreadyDecided: state.decided,
      };
      const decision = decideSilentFailure(snapshot);
      if (!decision) return;

      actingRef.current = true;
      act(
        decision.verdict,
        decision.action,
        videoTracks,
        audioTracks,
        videoTrack,
        audioTrack,
      )
        .catch((e) => console.error("[useSilentTrackGuard] Action failed:", e))
        .finally(() => {
          actingRef.current = false;
        });
    };

    const subs = [
      p.addListener("sourceChange", () => {
        // Same URL reloaded (a retry) or a new one: start the window over.
        stateRef.current = freshState(optionsRef.current.videoURL);
        setError(null);
      }),
      p.addListener("statusChange", ({ status, error: e }) => {
        const state = stateRef.current;
        if (e) {
          // A real error has its own hooks; stand down for this source.
          state.acted = true;
          return;
        }
        if (status === "readyToPlay" && !state.started) {
          state.started = true;
          state.lastTime = null;
        }
      }),
      p.addListener("timeUpdate", ({ currentTime }) => {
        const state = stateRef.current;
        if (!state.started) return;
        if (Number.isFinite(currentTime)) {
          state.clock += accumulateClock(state.lastTime, currentTime);
          state.lastTime = currentTime;
        }
        evaluate();
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [player, platformClass]);

  return { error, onFirstFrameRender, retry };
}
