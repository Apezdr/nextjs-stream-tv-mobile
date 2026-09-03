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
import { applyResumePosition } from "@/src/utils/resumeGuard";
import { isDirectOnlyURL, isFileTierURL } from "@/src/utils/streamUrls";
import { logPlaybackError } from "@/src/utils/videoDiagnostics";

// Matches useAudioFallback's trigger exactly — those errors are its job.
const AUDIO_ERROR_RE =
  /audio.*codec|audio.*decoder|aac|mp3|vorbis|opus|MediaCodecAudioRenderer/i;

// A source that has never reached readyToPlay after this long descends.
// Generous against normal startup (seconds) but far short of a big-MKV
// keyframe derivation stall.
const LOAD_STALL_MS = 20000;

// A pinned tier (the ?direct=only master, the raw file) has no ABR: a weak
// link rebuffers instead of stepping down, so a mid-playback stall this long
// descends. ABR tiers are left to the player.
const REBUFFER_STALL_MS = 20000;

// Errors that a same-source retry cannot fix, so the retry only costs a
// second failure (and, for a decoder wedge, a second multi-second teardown):
//   - OutOfMemoryError: deterministic for this file on this heap;
//   - "stuck playing": the decoder wedged, and rebuilding it re-wedges;
//   - a ?direct=only refusal (HTTP 404): the server says "no copy rung right
//     now" with the reason in the body, and never falls back to the ladder.
const NO_RETRY_RE = /OutOfMemoryError|stuck playing/i;
const HTTP_404_RE = /Response code: 404|ERROR_CODE_IO_BAD_HTTP_STATUS/;

function isNoRetryError(sourceURL: string, message: string): boolean {
  if (NO_RETRY_RE.test(message)) return true;
  return isDirectOnlyURL(sourceURL) && HTTP_404_RE.test(message);
}

function isPinnedTierURL(url: string | null): boolean {
  return isDirectOnlyURL(url) || isFileTierURL(url);
}

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

  const rebufferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearRebufferWatchdog = useCallback(() => {
    if (rebufferTimerRef.current) {
      clearTimeout(rebufferTimerRef.current);
      rebufferTimerRef.current = null;
    }
  }, []);

  // (Re)arm the initial-load watchdog for a source: descends if it never
  // reaches readyToPlay within LOAD_STALL_MS.
  const armStallWatchdog = useCallback(
    (src: string) => {
      const p = player;
      if (!p) return;
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        stallTimerRef.current = null;
        const q = qualityRef.current;
        if (
          everReadyForSourceRef.current === src ||
          videoURLRef.current !== src ||
          p.status === "readyToPlay"
        ) {
          return;
        }
        if (!q.descentTarget) return;
        console.warn(
          `[useVideoTierFallback] Source never became playable after ${LOAD_STALL_MS}ms — descending`,
        );
        reportDescent(
          "Initial load stall",
          p.status,
          q.positionHintRef.current,
        );
        q.descendTier();
      }, LOAD_STALL_MS);
    },
    [player, reportDescent],
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
        clearRebufferWatchdog();
        // Deliberately do NOT clear retriedForSourceRef here: a deterministic
        // mid-file decode error plays fine, errors, and reads readyToPlay
        // again after the retry — clearing on ready would loop
        // retry→ready→error forever instead of descending on recurrence
        // (the frozen-player class this §8 policy exists to kill). One plain
        // retry per source per mount; the second error descends.
        return;
      }
      if (!e) {
        // A rebuffer on a pinned tier: nothing steps down for us, so a stall
        // this long descends at position. Cleared by the next readyToPlay.
        const src = videoURLRef.current;
        if (
          status === "loading" &&
          src &&
          everReadyForSourceRef.current === src &&
          isPinnedTierURL(src) &&
          !rebufferTimerRef.current
        ) {
          rebufferTimerRef.current = setTimeout(() => {
            rebufferTimerRef.current = null;
            const q = qualityRef.current;
            if (
              videoURLRef.current !== src ||
              player.status !== "loading" ||
              !q.descentTarget ||
              handlingRef.current
            ) {
              return;
            }
            console.warn(
              `[useVideoTierFallback] Pinned source rebuffering for ${REBUFFER_STALL_MS}ms — descending`,
            );
            reportDescent(
              "Rebuffer stall",
              player.status,
              q.positionHintRef.current,
            );
            q.descendTier();
          }, REBUFFER_STALL_MS);
        }
        return;
      }
      if (AUDIO_ERROR_RE.test(e.message)) return;

      const q = qualityRef.current;
      const src = videoURLRef.current;
      if (!src || !q.descentTarget || handlingRef.current) return;

      // Claim the error synchronously so useVideoErrorHandling's listener
      // (registered after this hook's) suppresses its fatal error surface.
      handlingRef.current = true;
      // A player mid-error or still preparing reports 0; use the last
      // position observed from timeUpdate so recovery never restarts a
      // resumed session from the beginning.
      const observed = player.currentTime || 0;
      const position = observed > 0 ? observed : q.positionHintRef.current;
      if (position > 0) q.positionHintRef.current = position;
      try {
        if (isNoRetryError(src, e.message)) {
          console.warn(
            "[useVideoTierFallback] Unrecoverable on this source — descending a tier:",
            e.message,
          );
          reportDescent(e.message, status, position);
          await q.descendTier();
        } else if (retriedForSourceRef.current !== src) {
          // §8 step 1: one plain recovery attempt on the same source.
          retriedForSourceRef.current = src;
          console.warn(
            "[useVideoTierFallback] Fatal player error — retrying same source once:",
            e.message,
          );
          await player.replaceAsync({ uri: src });
          if (position > 0) {
            applyResumePosition(player, position, "useVideoTierFallback");
          }
          player.play();
          // The retry is a fresh load: give it the full stall window instead
          // of letting the watchdog armed at the original open overrule it.
          armStallWatchdog(src);
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
        reportDescent(e.message, status, position);
        await qualityRef.current.descendTier();
      } finally {
        handlingRef.current = false;
      }
    };

    const onTimeUpdate = ({ currentTime }: { currentTime: number }) => {
      if (Number.isFinite(currentTime) && currentTime > 0) {
        qualityRef.current.positionHintRef.current = currentTime;
      }
    };

    const sub = player.addListener("statusChange", onStatusChange);
    const timeSub = player.addListener("timeUpdate", onTimeUpdate);
    return () => {
      sub.remove();
      timeSub.remove();
      clearRebufferWatchdog();
    };
  }, [player, reportDescent, clearRebufferWatchdog, armStallWatchdog]);

  // Initial-load stall watchdog, armed on every open of a source (a switch,
  // an episode, a retry re-arms it explicitly). Only descends when the source
  // never reached readyToPlay — a later rebuffer is the rebuffer watchdog's.
  useEffect(() => {
    if (!player || !videoURL) return;
    if (everReadyForSourceRef.current === videoURL) return;
    armStallWatchdog(videoURL);
    return () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
  }, [player, videoURL, armStallWatchdog]);

  return { isHandling };
}
