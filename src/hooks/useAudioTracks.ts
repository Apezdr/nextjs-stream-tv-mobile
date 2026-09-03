import type { AudioTrack, VideoPlayer } from "expo-video";
import { useCallback, useEffect, useState } from "react";

// `AudioTrack.id` only exists on Android; on Apple platforms it is absent, so
// tracks are keyed by language+label there (which is also how the native side
// matches an assigned track).
export function audioTrackKey(track: AudioTrack): string {
  return track.id ?? `${track.language}|${track.label}`;
}

export function audioTracksEqual(
  a: AudioTrack | null | undefined,
  b: AudioTrack | null | undefined,
): boolean {
  if (!a || !b) return a === b;
  return audioTrackKey(a) === audioTrackKey(b);
}

// "en-US" / "en_US" / "EN" / "en" all describe the same selectable language.
// Apple's language comes from `option.locale?.identifier`, which Foundation
// canonicalizes with an underscore, so both separators must be handled.
export function normalizeLanguageTag(
  language: string | null | undefined,
): string {
  return (language ?? "").toLowerCase().split(/[-_]/)[0];
}

// The language the player is actually rendering. `player.audioTrack` is null
// whenever the player is on automatic selection — expo-video only reports a
// track once something explicitly assigns one — so null means "the platform
// picked for us", not "no audio". Fall back to the first available track,
// which is the playlist's declared default.
export function effectiveAudioLanguage(
  selectedAudioTrack: AudioTrack | null | undefined,
  availableAudioTracks: AudioTrack[],
): string {
  return normalizeLanguageTag(
    selectedAudioTrack?.language ?? availableAudioTracks[0]?.language,
  );
}

// On Android, ExoPlayer builds the HLS rendition format id as
// "<GROUP-ID>:<NAME>", so the audio group — the format discriminator — is the
// part before the first colon. (NAME is identical across groups per RFC 8216
// and useless as a format key; on multi-language sources it's the language
// endonym.) Returns null on Apple platforms, where id doesn't exist and
// AVFoundation owns rendition choice within a language.
//
// Caveat: RFC 8216 permits a colon inside GROUP-ID, which would truncate this
// slice. Safe while the transcoder emits "aud-*" ids; revisit if that changes.
export function audioTrackGroupId(
  track: AudioTrack | null | undefined,
): string | null {
  const id = track?.id as string | undefined;
  if (!id) return null;
  const colonIndex = id.indexOf(":");
  return colonIndex > 0 ? id.slice(0, colonIndex) : null;
}

// Track names that mark a supplementary mix rather than the main one: the
// same four keywords the transcoder uses to demote such tracks out of the
// default rendition slot, so the app and the server agree on what counts as
// descriptive. On a direct-played container every track keeps its own name,
// and nothing else in the pipeline knows that "English [Commentary]" is not
// the film's dialogue. The Matroska Name element surfaces as `name` on
// Android (`label` there is the locale's display name and never matches);
// Apple platforms carry the option's display name in `label`.
const DESCRIPTIVE_AUDIO_RE =
  /commentary|audio description|descriptive|visually impaired/i;

export function isDescriptiveAudioTrack(
  track: AudioTrack | null | undefined,
): boolean {
  if (!track) return false;
  return (
    DESCRIPTIVE_AUDIO_RE.test(track.name ?? "") ||
    DESCRIPTIVE_AUDIO_RE.test(track.label ?? "")
  );
}

// ExoPlayer's own verdict on whether the device can decode the track — false
// means it found no decoder (or none whose capabilities the format fits), so
// assigning the track can only end in a codec error. Only patched runtimes
// report it; a runtime that says nothing is assumed capable.
export function isAudioTrackSupported(
  track: AudioTrack | null | undefined,
): boolean {
  return track?.isSupported !== false;
}

// How likely a track is to be what the viewer wants to hear, lower is better:
//   0 — decodable main mix
//   1 — decodable commentary / audio description
//   2 — main mix the device has no decoder for
//   3 — undecodable commentary / audio description
// A decodable descriptive track outranks an undecodable main mix because
// assigning the latter fails and the fallback lands on the former anyway,
// one reload later. Every chooser that must settle on ONE track among
// several of a language (the language row's representative, the codec-error
// fallback) orders by this first so they agree with each other.
export function audioTrackPreferenceRank(track: AudioTrack): number {
  return (
    (isAudioTrackSupported(track) ? 0 : 2) +
    (isDescriptiveAudioTrack(track) ? 1 : 0)
  );
}

// Endonyms for the language rows. Hermes has no Intl.DisplayNames, and the
// playlist NAME attribute is often a generic "Audio", so a static map is the
// only reliable source of readable names.
const LANGUAGE_NAMES: Record<string, string> = {
  ar: "العربية",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  en: "English",
  es: "Español",
  fi: "Suomi",
  fr: "Français",
  he: "עברית",
  hi: "हिन्दी",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  nl: "Nederlands",
  no: "Norsk",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  ru: "Русский",
  sv: "Svenska",
  th: "ไทย",
  tr: "Türkçe",
  uk: "Українська",
  vi: "Tiếng Việt",
  zh: "中文",
};

export interface AudioLanguageOption {
  // Normalized primary subtag, e.g. "en". Always non-empty.
  language: string;
  // Human-readable row label.
  label: string;
  // Representative track to assign when this language is chosen.
  track: AudioTrack;
}

// An HLS master frequently exposes several renditions of the SAME language
// (AAC stereo / AC3 5.1 / EAC3 5.1 / low-bitrate mono), which arrive as
// separate AudioTracks with identical label+language. The selector offers
// languages, so collapse to one option per distinct language; rendition
// choice within a language belongs to the Sound Format axis.
//
// The representative — what a tap on the row assigns — is the best-ranked
// track of the language (see audioTrackPreferenceRank), the first declared
// one among equals. Taking the first track outright meant that on a direct
// played container "English" assigned the TrueHD default no Android device
// decodes, or the commentary track when that happened to come first.
//
// Tracks with no language tag are skipped entirely rather than each becoming
// its own row: on a master without LANGUAGE, Android would otherwise turn N
// codec renditions into N "Unknown" rows and wrongly open the button, while
// Apple drops such tracks anyway (its record construction requires a locale).
export function groupAudioTracksByLanguage(
  tracks: AudioTrack[],
): AudioLanguageOption[] {
  // Insertion order is row order: first appearance of each language.
  const representatives = new Map<string, AudioTrack>();
  for (const track of tracks) {
    const language = normalizeLanguageTag(track.language);
    if (!language) continue;
    const current = representatives.get(language);
    if (
      !current ||
      audioTrackPreferenceRank(track) < audioTrackPreferenceRank(current)
    ) {
      representatives.set(language, track);
    }
  }
  return [...representatives].map(([language, track]) => ({
    language,
    label:
      LANGUAGE_NAMES[language] ?? track.label ?? track.language ?? "Unknown",
    track,
  }));
}

// Player-derived audio track state for the watch page controls. Listeners are
// attached manually (rather than via useEvent) because several events feed the
// same state and the track list must reset across replaceAsync episode
// switches.
// `isAudioSelectionAutomatic` only exists on runtimes carrying our
// expo-video patch. Its presence is also what tells us that assigning
// `audioTrack = null` returns the player to automatic selection instead of
// muting it — so it doubles as the capability probe for offering "Auto".
function readAutomaticSelection(player: VideoPlayer | null): boolean | null {
  const value = (player as unknown as { isAudioSelectionAutomatic?: unknown })
    ?.isAudioSelectionAutomatic;
  return typeof value === "boolean" ? value : null;
}

function sameTrackList(a: AudioTrack[], b: AudioTrack[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((track, i) => audioTracksEqual(track, b[i]));
}

// Every state write below goes through a value comparison, because the native
// getters mint a FRESH AudioTrack object on each read and Android's AudioTrack
// has no equality override — so `audioTrackChange` fires on every routine ABR
// switch and `statusChange` re-reads constantly. Storing those raw would give
// a new reference (and therefore a re-render of the whole controls tree) many
// times a second during playback.
function keepIfSameTrack(next: AudioTrack | null) {
  return (prev: AudioTrack | null) =>
    audioTracksEqual(prev, next) ? prev : next;
}

function keepIfSameList(next: AudioTrack[]) {
  return (prev: AudioTrack[]) => (sameTrackList(prev, next) ? prev : next);
}

export function useAudioTracks(player: VideoPlayer | null): {
  availableAudioTracks: AudioTrack[];
  selectedAudioTrack: AudioTrack | null;
  selectAudioTrack: (track: AudioTrack) => void;
  // True while the player is choosing the track itself.
  isAutomaticSelection: boolean;
  // Whether returning to automatic selection is possible on this runtime.
  supportsAutomaticSelection: boolean;
  selectAutomatic: () => void;
} {
  const [availableAudioTracks, setAvailableAudioTracks] = useState<
    AudioTrack[]
  >(() => {
    try {
      return player?.availableAudioTracks ?? [];
    } catch {
      return [];
    }
  });
  const [selectedAudioTrack, setSelectedAudioTrack] =
    useState<AudioTrack | null>(() => {
      try {
        return player?.audioTrack ?? null;
      } catch {
        return null;
      }
    });

  useEffect(() => {
    if (!player) return;

    // Re-seed for this player instance — the lazy initializers above only ran
    // for the first one.
    try {
      setAvailableAudioTracks(
        keepIfSameList(player.availableAudioTracks ?? []),
      );
      setSelectedAudioTrack(keepIfSameTrack(player.audioTrack ?? null));
    } catch {
      setAvailableAudioTracks(keepIfSameList([]));
      setSelectedAudioTrack(keepIfSameTrack(null));
    }

    const subs = [
      // sourceLoad is the canonical load-time source of the track list; it
      // also fires after replaceAsync, resetting state on episode switches.
      player.addListener("sourceLoad", (payload) => {
        setAvailableAudioTracks(keepIfSameList(payload.availableAudioTracks));
        try {
          setSelectedAudioTrack(keepIfSameTrack(player.audioTrack ?? null));
        } catch {
          setSelectedAudioTrack(keepIfSameTrack(null));
        }
      }),
      player.addListener("availableAudioTracksChange", (payload) => {
        setAvailableAudioTracks(keepIfSameList(payload.availableAudioTracks));
      }),
      // Confirms both manual selections and fallback-driven switches.
      player.addListener("audioTrackChange", (payload) => {
        setSelectedAudioTrack(keepIfSameTrack(payload.audioTrack));
      }),
      // Some platforms only populate the list once playback is ready, without
      // firing availableAudioTracksChange — re-read as a backstop.
      player.addListener("statusChange", ({ status }) => {
        if (status !== "readyToPlay") return;
        try {
          setAvailableAudioTracks(
            keepIfSameList(player.availableAudioTracks ?? []),
          );
          setSelectedAudioTrack(keepIfSameTrack(player.audioTrack ?? null));
        } catch {
          // Keep current state if the native read throws.
        }
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [player]);

  const selectAudioTrack = useCallback(
    (track: AudioTrack) => {
      if (!player) return;
      try {
        // Assigning audioTrack switches natively without reloading the source
        // — never replaceAsync here (it would drop position and selection).
        player.audioTrack = track;
        // Optimistic; audioTrackChange confirms (or corrects) it.
        setSelectedAudioTrack(keepIfSameTrack(track));
      } catch (e) {
        console.warn("[useAudioTracks] Failed to select audio track:", e);
      }
    },
    [player],
  );

  // One native read per render, reused for both flags. Selections always move
  // `selectedAudioTrack`, which re-renders and re-reads this — so no extra
  // tick state is needed to keep it fresh.
  const nativeAutomatic = readAutomaticSelection(player);
  const supportsAutomaticSelection = nativeAutomatic !== null;
  // Unpatched runtimes never report a track while auto-selecting, so a null
  // selection is the only available signal there.
  const isAutomaticSelection = nativeAutomatic ?? !selectedAudioTrack;

  const selectAutomatic = useCallback(() => {
    // Guard hard: on an unpatched runtime assigning null DISABLES audio
    // instead of restoring automatic selection, and nothing short of another
    // explicit assignment brings it back.
    if (!player || !supportsAutomaticSelection) return;
    try {
      player.audioTrack = null;
      setSelectedAudioTrack(keepIfSameTrack(null));
    } catch (e) {
      console.warn("[useAudioTracks] Failed to restore automatic audio:", e);
    }
  }, [player, supportsAutomaticSelection]);

  return {
    availableAudioTracks,
    selectedAudioTrack,
    selectAudioTrack,
    isAutomaticSelection,
    supportsAutomaticSelection,
    selectAutomatic,
  };
}
