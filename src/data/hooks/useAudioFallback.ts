import type {
  VideoPlayer,
  AudioTrack,
  StatusChangeEventPayload,
} from "expo-video";
import { useEffect, useRef, useState } from "react";

import {
  audioTrackGroupId,
  audioTrackKey,
  audioTracksEqual,
  normalizeLanguageTag,
} from "@/src/hooks/useAudioTracks";
import { getCachedAudioGroups } from "@/src/utils/hlsAudioFormats";

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
  // The audioTrackChange listener must tell fallback-driven switches apart
  // from manual selections made in the audio controls — but one fallback
  // cycle emits SEVERAL native audioTrackChange events (Android emits on each
  // trackSelectionParameters write and on the replace transition, and events
  // can arrive after the replaceAsync await settles), so a single-consume
  // boolean is not enough. Instead: fallbackBusyRef covers the whole cycle,
  // and internalSwitchRef remembers the expected track so late confirmations
  // of our own switch are still recognized afterwards.
  const internalSwitchRef = useRef<AudioTrack | null>(null);
  const fallbackBusyRef = useRef(false);
  // Last track we've actually observed. Android's AudioTrack has no equals
  // override and the native getter builds a fresh instance per read, so
  // expo-video's "did the track change?" check is always true once a
  // selection exists — meaning audioTrackChange fires on EVERY tracks change
  // (including routine ABR switches). Comparing by value here is what stops
  // those spurious events from resetting the fallback's state.
  const lastKnownTrackRef = useRef<AudioTrack | null>(null);

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
    // Compare via audioTrackKey — `id` is Android-only, so filtering on it
    // matched nothing on Apple platforms.
    const candidates = availableAudioTracks.filter(
      (t) =>
        !audioTracksEqual(t, audioTrack) &&
        !triedRef.current.has(audioTrackKey(t)),
    );

    // Groups that only serve low video rungs (a cellular-only mono group)
    // would cap video quality, so try them last — but still try them, since
    // mono beats silence when everything else has failed.
    const groups = getCachedAudioGroups(urlRef.current);
    const ranked = groups
      ? [...candidates].sort((a, b) => {
          const rank = (t: AudioTrack) => {
            const id = audioTrackGroupId(t);
            const group = id ? groups.find((g) => g.groupId === id) : undefined;
            return group && !group.selectable ? 1 : 0;
          };
          return rank(a) - rank(b);
        })
      : candidates;

    for (const lang of langsRef.current) {
      const normalized = normalizeLanguageTag(lang);
      const match = ranked.find(
        (t) => normalizeLanguageTag(t.language) === normalized,
      );
      if (match) return match;
    }
    return ranked[0] || null;
  };

  // — The main fallback routine —
  const doFallback = async () => {
    clearTimer();
    const next = pickNext();
    if (!next) {
      setError("All audio tracks failed or are unsupported.");
      return;
    }

    triedRef.current.add(audioTrackKey(next));
    setError(null);
    fallbackBusyRef.current = true;
    internalSwitchRef.current = next;

    try {
      // Preserve current playback position before replace
      const currentTime = player.currentTime || 0;
      console.log(
        `[useAudioFallback] Preserving current time: ${currentTime}s before audio track fallback`,
      );

      player.audioTrack = next;
      if (urlRef.current) {
        // The replace reloads the source to recover from the codec error —
        // this is the ONLY place a track switch may go through replaceAsync;
        // manual selection assigns player.audioTrack directly.
        await player.replaceAsync({ uri: urlRef.current });

        // On Apple platforms audio selection is per-AVPlayerItem, so the
        // pre-replace assignment dies with the old item and automatic
        // selection re-picks the broken default — re-apply on the new item.
        // Harmless on Android, where the selection override is player-level.
        player.audioTrack = next;

        // Restore the position after replace
        if (currentTime > 0) {
          player.currentTime = currentTime;
          console.log(
            `[useAudioFallback] Restored current time: ${currentTime}s after audio track fallback`,
          );
        }

        player.play();
      } else {
        fallbackBusyRef.current = false;
        setError("No video URL available for playback.");
        return;
      }
    } catch (error) {
      fallbackBusyRef.current = false;
      console.error(`[useAudioFallback] Error during fallback:`, error);
      // immediate retry on replace/play failure
      return doFallback();
    }
    fallbackBusyRef.current = false;

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
    const onAudioTrackChange = ({
      audioTrack: changedTrack,
    }: {
      audioTrack: AudioTrack | null;
    }) => {
      if (fallbackBusyRef.current) {
        // Mid-cycle event from our own switch/replace: resume playback (the
        // replace leaves the player paused) and never treat it as manual.
        lastKnownTrackRef.current = changedTrack;
        player.play();
        return;
      }
      if (
        !changedTrack ||
        audioTracksEqual(changedTrack, internalSwitchRef.current)
      ) {
        // Teardown noise, or a late confirmation of our own switch arriving
        // after the cycle settled — the cycle already resumed playback, so
        // consume silently.
        lastKnownTrackRef.current = changedTrack ?? lastKnownTrackRef.current;
        return;
      }
      if (audioTracksEqual(changedTrack, lastKnownTrackRef.current)) {
        // Same track we already knew about — a spurious re-emit, not a
        // selection. Clearing the tried-set here would let a recurring codec
        // error retry the same broken rendition forever.
        return;
      }
      // Genuine manual selection from the audio controls: reset the fallback
      // baseline to the user's choice, and do NOT force playback — picking a
      // language while paused must not un-pause. If the chosen track later
      // throws a codec error, the fallback still rescues playback from there.
      lastKnownTrackRef.current = changedTrack;
      internalSwitchRef.current = null;
      triedRef.current.clear();
      clearTimer();
      setError(null);
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
