import type { AudioTrack } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  audioTrackGroupId,
  effectiveAudioLanguage,
  normalizeLanguageTag,
} from "@/src/hooks/useAudioTracks";
import {
  HlsAudioGroupInfo,
  cacheAudioGroups,
  codecFromSampleMimeType,
  deriveAudioFormatLabel,
  getCachedAudioGroups,
  parseMasterAudioGroups,
} from "@/src/utils/hlsAudioFormats";
import { isAdaptiveStreamURL } from "@/src/utils/streamType";

export interface AudioFormatOption {
  groupId: string;
  // e.g. "Stereo", "Dolby Digital+ 5.1".
  label: string;
  // The track to assign to switch to this format in the current language.
  track: AudioTrack;
  // False when the device has no decoder for this format (patched runtimes
  // only; assumed true when the player doesn't report support).
  isSupported: boolean;
}

// A patched expo-video reports codec/channel metadata per track, which makes
// the master-playlist fetch unnecessary and is authoritative about decoder
// support. Unpatched runtimes report neither, and fall back to the playlist.
function hasNativeFormatMetadata(tracks: AudioTrack[]): boolean {
  return tracks.some((track) => !!track.sampleMimeType);
}

function nativeFormatOptions(
  tracks: AudioTrack[],
  activeLanguage: string,
): AudioFormatOption[] {
  const options: AudioFormatOption[] = [];
  const seenGroups = new Set<string>();

  for (const track of tracks) {
    if (normalizeLanguageTag(track.language) !== activeLanguage) continue;
    const groupId = audioTrackGroupId(track);
    if (!groupId || seenGroups.has(groupId)) continue;
    seenGroups.add(groupId);
    options.push({
      groupId,
      label: deriveAudioFormatLabel(
        codecFromSampleMimeType(track.sampleMimeType),
        track.channelCount ?? null,
        (track.sampleMimeType ?? "").toLowerCase().includes("joc"),
      ),
      track,
      isSupported: track.isSupported !== false,
    });
  }

  return options;
}

const FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 400;

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

// Latches true for the life of a source. The audio button's inputs (track
// list, parsed formats) are empty for a window after every load and every
// replaceAsync, and a focused TV control that vanishes mid-session throws
// focus to another region — so once the button has earned its place, it keeps
// it until the source changes.
export function useStickyForSource(value: boolean, sourceKey: unknown) {
  const [latched, setLatched] = useState(value);
  const keyRef = useRef(sourceKey);

  useEffect(() => {
    if (keyRef.current !== sourceKey) {
      keyRef.current = sourceKey;
      setLatched(value);
      return;
    }
    if (value) setLatched(true);
  }, [value, sourceKey]);

  return keyRef.current === sourceKey ? latched || value : value;
}

// The Sound Format axis of the audio selector. expo-video's AudioTrack
// carries no codec/channel metadata, so the master playlist is fetched and
// parsed for it, then joined to the player's tracks via the GROUP-ID prefix
// of AudioTrack.id. That id only exists on Android — on Apple platforms the
// join yields nothing, which is correct there: AVFoundation collapses
// corresponding renditions into one option and owns the codec choice.
export function useAudioFormats(
  videoURL: string | null | undefined,
  availableAudioTracks: AudioTrack[],
  selectedAudioTrack: AudioTrack | null,
): {
  formatOptions: AudioFormatOption[];
  selectedFormatGroupId: string | null;
} {
  const [audioGroups, setAudioGroups] = useState<HlsAudioGroupInfo[] | null>(
    () => getCachedAudioGroups(videoURL),
  );

  const nativeMetadata = hasNativeFormatMetadata(availableAudioTracks);

  // Keyed on the URL alone: the track list arriving (or an episode switch
  // landing its new URL a tick late) must not discard a good parse.
  useEffect(() => {
    if (!videoURL || !isAdaptiveStreamURL(videoURL) || nativeMetadata) {
      setAudioGroups(null);
      return;
    }

    const cached = getCachedAudioGroups(videoURL);
    if (cached) {
      setAudioGroups(cached);
      return;
    }

    setAudioGroups(null);
    const controller = new AbortController();

    (async () => {
      for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt++) {
        try {
          const response = await fetch(videoURL, {
            signal: controller.signal,
            headers: { "Cache-Control": "no-cache" },
          });
          if (!response.ok) {
            console.warn(
              `[useAudioFormats] Master playlist fetch failed (${response.status}), attempt ${attempt}/${FETCH_ATTEMPTS}`,
            );
          } else {
            const groups = parseMasterAudioGroups(await response.text());
            cacheAudioGroups(videoURL, groups);
            if (!controller.signal.aborted) setAudioGroups(groups);
            return;
          }
        } catch (e) {
          if (controller.signal.aborted) return;
          console.warn(
            `[useAudioFormats] Master playlist fetch error, attempt ${attempt}/${FETCH_ATTEMPTS}:`,
            e,
          );
        }
        if (attempt < FETCH_ATTEMPTS) {
          await wait(RETRY_BASE_DELAY_MS * attempt);
          if (controller.signal.aborted) return;
        }
      }
      // Exhausted: the format section stays hidden. Language selection and
      // playback are unaffected.
    })();

    return () => {
      controller.abort();
    };
  }, [videoURL, nativeMetadata]);

  const selectedFormatGroupId = audioTrackGroupId(selectedAudioTrack);

  const formatOptions = useMemo(() => {
    // Formats are offered within the active language — switching format must
    // never silently switch language.
    const activeLanguage = effectiveAudioLanguage(
      selectedAudioTrack,
      availableAudioTracks,
    );

    let options: AudioFormatOption[];

    if (nativeMetadata) {
      options = nativeFormatOptions(availableAudioTracks, activeLanguage);
      // Keep the top-rung filter when a parse happens to be cached: the
      // player has no notion of which video rungs a group serves.
      const groups = getCachedAudioGroups(videoURL);
      if (groups) {
        options = options.filter((option) => {
          const group = groups.find((g) => g.groupId === option.groupId);
          return !group || group.selectable;
        });
      }
    } else if (audioGroups && audioGroups.length > 0) {
      options = [];
      for (const group of audioGroups) {
        // Groups that only serve low video rungs (e.g. a cellular-only mono
        // group) must not be selectable — pinning one would cap video quality.
        if (!group.selectable) continue;
        const track = availableAudioTracks.find(
          (candidate) =>
            audioTrackGroupId(candidate) === group.groupId &&
            normalizeLanguageTag(candidate.language) === activeLanguage,
        );
        if (!track) continue;
        options.push({
          groupId: group.groupId,
          label: group.label,
          track,
          isSupported: track.isSupported !== false,
        });
      }
    } else {
      options = [];
    }

    // A single option is not a choice; hide the section.
    return options.length >= 2 ? options : [];
  }, [
    audioGroups,
    availableAudioTracks,
    selectedAudioTrack,
    nativeMetadata,
    videoURL,
  ]);

  return { formatOptions, selectedFormatGroupId };
}
