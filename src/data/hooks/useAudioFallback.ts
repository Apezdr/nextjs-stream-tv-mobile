import type {
  VideoPlayer,
  AudioTrack,
  StatusChangeEventPayload,
} from "expo-video";
import { useEffect, useRef, useState } from "react";

import {
  audioTrackGroupId,
  audioTrackKey,
  audioTrackPreferenceRank,
  audioTracksEqual,
  normalizeLanguageTag,
} from "@/src/hooks/useAudioTracks";
import {
  HlsAudioGroupInfo,
  getCachedAudioGroups,
} from "@/src/utils/hlsAudioFormats";

interface Options {
  videoURL: string | null;
  player: VideoPlayer;
  preferredLanguages: string[];
  fallbackTimeoutMs?: number;
}

// The next track to try after a codec error, or null when every track has
// been tried. Pure, so the walk order is testable without a player.
//
// Candidates are split by audioTrackPreferenceRank into pools that are
// exhausted strictly in order — decodable main mixes, then decodable
// commentary / audio-description, then the tracks ExoPlayer has already
// declared undecodable — and the preferred languages are honoured WITHIN a
// pool: the first language that has a candidate there wins, else the pool's
// best. So a main mix in another language beats commentary in the preferred
// one (the film's own audio is closer to what the viewer wanted, and the
// language row then honestly says which language is playing), and both beat
// a track that can only end in another codec error and reload. Undecodable
// tracks are still tried once everything else has failed: ExoPlayer's
// capability check is conservative, and mono beats silence.
//
// Within a pool, groups that only serve low video rungs (a cellular-only mono
// group) come last since pinning one would cap video quality, then more
// channels beat fewer so a 5.1 mix wins over a stereo one on merit. Ties keep
// the source's declared order.
export function pickFallbackAudioTrack(
  tracks: AudioTrack[],
  currentTrack: AudioTrack | null | undefined,
  tried: ReadonlySet<string>,
  groups: HlsAudioGroupInfo[] | null,
  preferredLanguages: string[],
): AudioTrack | null {
  const withinPoolRank = (track: AudioTrack): [number, number] => {
    const id = audioTrackGroupId(track);
    const group =
      id && groups ? groups.find((g) => g.groupId === id) : undefined;
    return [group && !group.selectable ? 1 : 0, -(track.channelCount ?? 0)];
  };

  const ordered = tracks
    .map((track, index) => ({ track, index, rank: withinPoolRank(track) }))
    .filter(
      ({ track }) =>
        !audioTracksEqual(track, currentTrack) &&
        !tried.has(audioTrackKey(track)),
    )
    .sort(
      (a, b) =>
        a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index,
    )
    .map(({ track }) => track);

  const pools = new Map<number, AudioTrack[]>();
  for (const track of ordered) {
    const pool = audioTrackPreferenceRank(track);
    pools.set(pool, [...(pools.get(pool) ?? []), track]);
  }

  const normalizedLanguages = preferredLanguages.map(normalizeLanguageTag);
  for (const pool of [...pools.keys()].sort((a, b) => a - b)) {
    const candidates = pools.get(pool) ?? [];
    for (const language of normalizedLanguages) {
      const match = candidates.find(
        (track) => normalizeLanguageTag(track.language) === language,
      );
      if (match) return match;
    }
    if (candidates.length > 0) return candidates[0];
  }
  return null;
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
    return pickFallbackAudioTrack(
      availableAudioTracks,
      audioTrack,
      triedRef.current,
      getCachedAudioGroups(urlRef.current),
      langsRef.current,
    );
  };

  // The track that just failed is excluded from this round as "current", but
  // it is not in the tried set — so once the fallback has moved on it would
  // become a candidate again and be reloaded for a second time before the
  // walk reaches anything new. Pin it so each track fails at most once.
  const markCurrentTried = () => {
    try {
      const current = player.audioTrack;
      if (current) triedRef.current.add(audioTrackKey(current));
    } catch {
      // The native getter can throw while the player is tearing down.
    }
  };

  // — The main fallback routine —
  const doFallback = async () => {
    clearTimer();
    markCurrentTried();
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
        `[useAudioFallback] Falling back to audio track ${audioTrackKey(next)} ` +
          `(${next.language}, ${next.name ?? next.label}, ` +
          `${next.channelCount ?? "?"}ch, ${next.sampleMimeType ?? "codec unknown"}) ` +
          `at ${currentTime}s`,
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
