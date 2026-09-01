// §8 decode-error descent (FRONTEND_PLAYBACK_REQUIREMENTS.md), modeled on
// useAudioFallback: while playback holds a tier with somewhere lower to go
// (Apple `?direct=1` master → transcode-only master; Android `/file` → Auto),
// a fatal player error gets ONE plain recovery attempt — reload the same
// source at position — and on recurrence descends a tier instead of freezing.
// Audio-codec errors are excluded: useAudioFallback owns those, and the two
// regexes are disjoint so the hooks never race a replaceAsync.
//
// Also covers the initial-load stall: the first `?direct=1` request for an
// eligible title pays the server's keyframe derivation (minutes on a huge
// un-indexed MKV), so a source that never becomes playable descends rather
// than parking on a black screen.
import type { VideoPlayer, StatusChangeEventPayload } from "expo-video";
import { useCallback, useEffect, useRef } from "react";

import { QualityTierController } from "@/src/hooks/useQualityTier";
import { logPlaybackError } from "@/src/utils/videoDiagnostics";

// Matches useAudioFallback's trigger exactly — those errors are its job.
const AUDIO_ERROR_RE =
  /audio.*codec|audio.*decoder|aac|mp3|vorbis|opus|MediaCodecAudioRenderer/i;

// A source that has never reached readyToPlay after this long descends.
// Generous against normal startup (seconds) but far short of a big-MKV
// keyframe derivation stall.
const LOAD_STALL_MS = 20000;

interface Options {
  player: VideoPlayer | null;
  quality: QualityTierController;
  /** The active source URL (what the player currently holds). */
  videoURL: string | null;
  getPlaybackSessionId?: () => string | null;
  mediaId?: string | null;
  mediaType?: string | null;
}

export function useVideoTierFallback({
  player,
  quality,
  videoURL,
  getPlaybackSessionId,
  mediaId,
  mediaType,
}: Options): { isHandling: () => boolean } {
  // Refs so the single per-player subscription reads current values.
  const qualityRef = useRef(quality);
  qualityRef.current = quality;
  const videoURLRef = useRef(videoURL);
  videoURLRef.current = videoURL;
  const ctxRef = useRef({ getPlaybackSessionId, mediaId, mediaType });
  ctxRef.current = { getPlaybackSessionId, mediaId, mediaType };

  // The one plain recovery attempt is per source URL; reset on readyToPlay.
  const retriedForSourceRef = useRef<string | null>(null);
  const handlingRef = useRef(false);
  const everReadyForSourceRef = useRef<string | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHandling = useCallback(() => handlingRef.current, []);

  const reportDescent = useCallback(
    (
      rawErrorMessage: string,
      playerStatus: string | null,
      position: number,
    ) => {
      const q = qualityRef.current;
      const ctx = ctxRef.current;
      if (!q.descentTarget) return;
      logPlaybackError({
        // Distinct message prefix so per-session dedupe never collapses the
        // descent record into the raw error report that preceded it.
        rawErrorMessage: `Tier descent (${q.activeTier} → ${q.descentTarget}): ${rawErrorMessage}`,
        videoURL: videoURLRef.current,
        playerStatus,
        playbackSessionId: ctx.getPlaybackSessionId?.() ?? null,
        mediaId: ctx.mediaId ?? null,
        mediaType: ctx.mediaType ?? null,
        tierDescent: {
          from: q.activeTier,
          to: q.descentTarget,
          position,
        },
      });
    },
    [],
  );

  useEffect(() => {
    if (!player) return;

    const onStatusChange = async ({
      status,
      error: e,
    }: StatusChangeEventPayload) => {
      if (status === "readyToPlay" && !e) {
        everReadyForSourceRef.current = videoURLRef.current;
        if (stallTimerRef.current) {
          clearTimeout(stallTimerRef.current);
          stallTimerRef.current = null;
        }
        // Deliberately do NOT clear retriedForSourceRef here: a deterministic
        // mid-file decode error plays fine, errors, and reads readyToPlay
        // again after the retry — clearing on ready would loop
        // retry→ready→error forever instead of descending on recurrence
        // (the frozen-player class this §8 policy exists to kill). One plain
        // retry per source per mount; the second error descends.
        return;
      }
      if (!e) return;
      if (AUDIO_ERROR_RE.test(e.message)) return;

      const q = qualityRef.current;
      const src = videoURLRef.current;
      if (!src || !q.descentTarget || handlingRef.current) return;

      // Claim the error synchronously so useVideoErrorHandling's listener
      // (registered after this hook's) suppresses its fatal error surface.
      handlingRef.current = true;
      try {
        const position = player.currentTime || 0;
        if (retriedForSourceRef.current !== src) {
          // §8 step 1: one plain recovery attempt on the same source.
          retriedForSourceRef.current = src;
          console.warn(
            "[useVideoTierFallback] Fatal player error — retrying same source once:",
            e.message,
          );
          await player.replaceAsync({ uri: src });
          if (position > 0) player.currentTime = position;
          player.play();
        } else {
          // §8 step 2: recurrence — descend a tier at the same position.
          console.warn(
            "[useVideoTierFallback] Error recurred — descending a tier:",
            e.message,
          );
          reportDescent(e.message, status, position);
          await q.descendTier();
        }
      } catch (fallbackError) {
        console.error(
          "[useVideoTierFallback] Recovery attempt failed — descending:",
          fallbackError,
        );
        reportDescent(e.message, status, player.currentTime || 0);
        await qualityRef.current.descendTier();
      } finally {
        handlingRef.current = false;
      }
    };

    const sub = player.addListener("statusChange", onStatusChange);
    return () => {
      sub.remove();
    };
  }, [player, reportDescent]);

  // Initial-load stall watchdog, armed once per source. Only descends when
  // the source never reached readyToPlay — a later rebuffer never triggers.
  useEffect(() => {
    if (!player || !videoURL) return;
    if (everReadyForSourceRef.current === videoURL) return;
    const timer = setTimeout(() => {
      const q = qualityRef.current;
      // The source became playable at some point — this is not a load stall.
      if (
        everReadyForSourceRef.current === videoURL ||
        player.status === "readyToPlay"
      ) {
        return;
      }
      if (!q.descentTarget) return;
      console.warn(
        `[useVideoTierFallback] Source never became playable after ${LOAD_STALL_MS}ms — descending`,
      );
      reportDescent("Initial load stall", player.status, 0);
      q.descendTier();
    }, LOAD_STALL_MS);
    stallTimerRef.current = timer;
    return () => clearTimeout(timer);
  }, [player, videoURL, reportDescent]);

  return { isHandling };
}
