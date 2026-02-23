import type {
  VideoPlayer,
  AudioTrack,
  StatusChangeEventPayload,
} from "expo-video";
import { useEffect, useRef, useState } from "react";

interface Options {
  videoURL: string | null;
  player: VideoPlayer;
  preferredLanguages: string[];
  fallbackTimeoutMs?: number;
}

export function useAudioFallback({
  videoURL,
  player,
  preferredLanguages,
  fallbackTimeoutMs = 5000,
}: Options): string | null {
  // — Refs for mutable values, so callbacks never have to change —
  const triedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlRef = useRef<string | null>(videoURL);
  const langsRef = useRef<string[]>(preferredLanguages);
  const timeoutRef = useRef<number>(fallbackTimeoutMs);
  const errorRef = useRef<string | null>(null);

  // — Single state for error, only updated when it actually changes —
  const [error, setErrorState] = useState<string | null>(null);
  const setError = (msg: string | null) => {
    if (errorRef.current !== msg) {
      errorRef.current = msg;
      setErrorState(msg);
    }
  };

  // — Keep refs in sync with props without recreating callbacks —
  useEffect(() => {
    urlRef.current = videoURL;
  }, [videoURL]);
  useEffect(() => {
    langsRef.current = preferredLanguages;
  }, [preferredLanguages]);
  useEffect(() => {
    timeoutRef.current = fallbackTimeoutMs;
  }, [fallbackTimeoutMs]);

  // — Helpers never change identity —
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const resetAll = () => {
    triedRef.current.clear();
    clearTimer();
    setError(null);
  };

  // — Pick next track by reading from refs only —
  const pickNext = (): AudioTrack | null => {
    const { availableAudioTracks = [], audioTrack } = player;
    const candidates = availableAudioTracks.filter(
      (t) => t.id !== audioTrack?.id && !triedRef.current.has(t.id),
    );
    for (let lang of langsRef.current) {
      const match = candidates.find((t) => t.language === lang);
      if (match) return match;
    }
    return candidates[0] || null;
  };

  // — The main fallback routine —
  const doFallback = async () => {
    clearTimer();
    const next = pickNext();
    if (!next) {
      setError("All audio tracks failed or are unsupported.");
      return;
    }

    triedRef.current.add(next.id);
    setError(null);

    try {
      // Preserve current playback position before replace
      const currentTime = player.currentTime || 0;
      console.log(
        `[useAudioFallback] Preserving current time: ${currentTime}s before audio track fallback`,
      );

      player.audioTrack = next;
      if (urlRef.current) {
        await player.replaceAsync({ uri: urlRef.current });

        // Restore the position after replace
        if (currentTime > 0) {
          player.currentTime = currentTime;
          console.log(
            `[useAudioFallback] Restored current time: ${currentTime}s after audio track fallback`,
          );
        }

        player.play();
      } else {
        setError("No video URL available for playback.");
        return;
      }
    } catch (error) {
      console.error(`[useAudioFallback] Error during fallback:`, error);
      // immediate retry on replace/play failure
      return doFallback();
    }

    timerRef.current = setTimeout(() => {
      // if still not playing after timeout, try again
      if (player.status === "error" || player.status === "idle") {
        return doFallback();
      }
    }, timeoutRef.current);
  };

  // — One effect: subscribe once per player instance —
  useEffect(() => {
    const onStatusChange = ({ status, error: e }: StatusChangeEventPayload) => {
      // Only trigger audio fallback for actual audio codec errors
      if (
        e?.message.match(
          /audio.*codec|audio.*decoder|aac|mp3|vorbis|opus|MediaCodecAudioRenderer/i,
        )
      ) {
        clearTimer();
        doFallback();
      } else if (status === "readyToPlay") {
        resetAll();
      }
    };
    const onAudioTrackChange = () => {
      player.play();
    };

    const subs = [
      player.addListener("statusChange", onStatusChange),
      player.addListener("audioTrackChange", onAudioTrackChange),
    ];

    return () => {
      subs.forEach((s) => s.remove());
      clearTimer();
    };
  }, [player]); // 👉 only re-run if the player instance itself changes

  return error;
}
