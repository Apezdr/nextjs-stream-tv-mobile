import type { AudioTrack, VideoPlayer } from "expo-video";
import { useCallback, useEffect, useState, useRef } from "react";

import type { DirectPlayAudioTrack } from "@/src/data/types/directPlay.types";

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

/**
 * The track the player is actually rendering, as far as the app can tell:
 * the reported selection, else the declared default (first track) while the
 * player is on automatic selection.
 */
export function effectiveAudioTrack(
  selectedAudioTrack: AudioTrack | null | undefined,
  availableAudioTracks: AudioTrack[],
): AudioTrack | null {
  return selectedAudioTrack ?? availableAudioTracks[0] ?? null;
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

// The server's per-track verdict (`file.audioTracks[].descriptive`) for the
// container currently playing, when a watch screen has one. It catches what
// the title keywords miss: a commentary track flagged only by its
// disposition. Module-level on purpose — there is one playback context at a
// time, and threading it through every chooser (language rows, the
// codec-error fallback, both controls trees) would touch five components to
// pass a hint.
let verdictAudioTracks: DirectPlayAudioTrack[] | null = null;

export function setVerdictAudioTracks(
  tracks: DirectPlayAudioTrack[] | null | undefined,
): void {
  verdictAudioTracks = tracks && tracks.length > 0 ? tracks : null;
}

function normalizeTitle(title: string | null | undefined): string {
  return (title ?? "").trim().toLowerCase();
}

/**
 * Whether the server marked the container track this player track came from
 * as commentary / audio description. Joins on the track title first (the
 * Matroska Name surfaces as `name` on Android and `label` on Apple), then on
 * language + channel count when that pair is unique in the container.
 */
export function verdictMarksDescriptive(
  track: AudioTrack,
  verdict: DirectPlayAudioTrack[] | null = verdictAudioTracks,
): boolean {
  if (!verdict) return false;
  const titles = [track.name, track.label]
    .map(normalizeTitle)
    .filter((t) => t.length > 0);
  const byTitle = verdict.filter(
    (v) => v.title && titles.includes(normalizeTitle(v.title)),
  );
  if (byTitle.length > 0) {
    // Titles agree: that is the answer. Ambiguous titles ("English" on every
    // track) fall through to the shape match below.
    const flags = new Set(byTitle.map((v) => v.descriptive === true));
    if (flags.size === 1) return byTitle[0].descriptive === true;
  }
  const language = normalizeLanguageTag(track.language);
  const channels = track.channelCount;
  if (!language || channels == null) return false;
  const byShape = verdict.filter(
    (v) =>
      normalizeLanguageTag(v.language) === language && v.channels === channels,
  );
  return byShape.length === 1 && byShape[0].descriptive === true;
}

export function isDescriptiveAudioTrack(
  track: AudioTrack | null | undefined,
): boolean {
  if (!track) return false;
  return (
    DESCRIPTIVE_AUDIO_RE.test(track.name ?? "") ||
    DESCRIPTIVE_AUDIO_RE.test(track.label ?? "") ||
    verdictMarksDescriptive(track)
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
  // Stable row key: the language, or `<language>:descriptive` for a
  // commentary / audio-description row.
  key: string;
  // Normalized primary subtag, e.g. "en". Always non-empty.
  language: string;
  // Human-readable row label.
  label: string;
  // Representative track to assign when this row is chosen.
  track: AudioTrack;
  // True for the commentary / audio-description row of a language.
  descriptive: boolean;
}

function languageName(language: string, track: AudioTrack): string {
  return LANGUAGE_NAMES[language] ?? track.label ?? track.language ?? "Unknown";
}

// The commentary row is named by the track's own title when that title says
// what it is ("English [Commentary]"); a track flagged only by the server's
// verdict gets a generic name.
function descriptiveRowLabel(language: string, track: AudioTrack): string {
  const own = [track.name, track.label].find(
    (text) => text && DESCRIPTIVE_AUDIO_RE.test(text),
  );
  return own?.trim() || `${languageName(language, track)} (Commentary)`;
}

// Codec names for container tracks, from the sample MIME type our expo-video
// patch reports on Android (the only platform that direct-plays containers).
const CONTAINER_CODEC_NAMES: [RegExp, string][] = [
  [/true-?hd|mlp/i, "TrueHD"],
  [/eac3|ec-3/i, "Dolby Digital+"],
  [/\bac3\b|ac-3/i, "Dolby Digital"],
  [/dts-?hd|dts_hd/i, "DTS-HD"],
  [/dts/i, "DTS"],
  [/flac/i, "FLAC"],
  [/opus/i, "Opus"],
  [/vorbis/i, "Vorbis"],
  [/mp4a|aac/i, "AAC"],
  [/mpeg|mp3/i, "MP3"],
  [/raw|pcm/i, "PCM"],
];

function channelLabel(channels: number | null | undefined): string {
  if (channels == null) return "";
  if (channels >= 8) return "7.1";
  if (channels >= 6) return "5.1";
  if (channels === 1) return "Mono";
  return "Stereo";
}

/**
 * A row label for a container track that carries no language: what the
 * viewer can tell apart is the format — "Track 2 · Dolby Digital Stereo".
 */
export function describeContainerAudioTrack(
  track: AudioTrack,
  ordinal: number,
): string {
  const mime = track.sampleMimeType ?? "";
  const codec = CONTAINER_CODEC_NAMES.find(([re]) => re.test(mime))?.[1];
  const format = [codec, channelLabel(track.channelCount)]
    .filter((part): part is string => !!part)
    .join(" ");
  return format ? `Track ${ordinal} · ${format}` : `Track ${ordinal}`;
}

// A track with no language tag from a direct-played container (its id is
// ExoPlayer's plain track number, never an HLS "<GROUP-ID>:<NAME>" pair).
function isUntaggedContainerTrack(track: AudioTrack): boolean {
  return (
    !normalizeLanguageTag(track.language) && audioTrackGroupId(track) === null
  );
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
// Commentary and audio description get their OWN row, right after their
// language, whenever the language also has a main mix: folded into the
// language they share, a commentary track the player happened to pick is
// invisible, unreachable, and impossible to leave. When the only decodable
// track of a language IS the commentary, it represents the language and no
// second row is added.
//
// HLS renditions with no language tag are skipped rather than each becoming
// its own row: on a master without LANGUAGE, Android would otherwise turn N
// codec renditions into N "Unknown" rows and wrongly open the button, while
// Apple drops such tracks anyway (its record construction requires a locale).
// Untagged tracks of a direct-played CONTAINER are different: they are
// distinct audio (a remux with a DTS main and two unlabeled AC-3 stereo
// tracks, one of them the commentary), and skipping them left the viewer with
// no way to leave whatever the player picked. Each gets its own row, named by
// its format, after the language rows.
export function groupAudioTracksByLanguage(
  tracks: AudioTrack[],
): AudioLanguageOption[] {
  // Insertion order is row order: first appearance of each language.
  const representatives = new Map<string, AudioTrack>();
  const descriptives = new Map<string, AudioTrack>();
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
    if (isDescriptiveAudioTrack(track)) {
      const currentDescriptive = descriptives.get(language);
      if (
        !currentDescriptive ||
        audioTrackPreferenceRank(track) <
          audioTrackPreferenceRank(currentDescriptive)
      ) {
        descriptives.set(language, track);
      }
    }
  }
  const options: AudioLanguageOption[] = [];
  const untagged = tracks.filter(isUntaggedContainerTrack);
  for (const [language, track] of representatives) {
    options.push({
      key: language,
      language,
      label: languageName(language, track),
      track,
      descriptive: false,
    });
    const descriptive = descriptives.get(language);
    if (descriptive && !isDescriptiveAudioTrack(track)) {
      options.push({
        key: `${language}:descriptive`,
        language,
        label: descriptiveRowLabel(language, descriptive),
        track: descriptive,
        descriptive: true,
      });
    }
  }
  untagged.forEach((track, i) => {
    options.push({
      key: `track:${track.id ?? i}`,
      language: "",
      label: describeContainerAudioTrack(track, i + 1),
      track,
      descriptive: isDescriptiveAudioTrack(track),
    });
  });
  return options;
}

/**
 * The main mix to move to when the player's automatic selection landed on
 * commentary / audio description: a decodable, non-descriptive track of the
 * same language, the widest one (channel count) first, else the first
 * declared. Null when the language has no such track.
 */
export function preferredMainTrack(
  descriptive: AudioTrack,
  tracks: AudioTrack[],
): AudioTrack | null {
  const language = normalizeLanguageTag(descriptive.language);
  if (!language) return null;
  let best: AudioTrack | null = null;
  for (const track of tracks) {
    if (normalizeLanguageTag(track.language) !== language) continue;
    if (isDescriptiveAudioTrack(track) || !isAudioTrackSupported(track)) {
      continue;
    }
    if (!best || (track.channelCount ?? 0) > (best.channelCount ?? 0)) {
      best = track;
    }
  }
  return best;
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
  // Set once the viewer picks a track for this source; cleared on sourceLoad.
  const userChoseRef = useRef(false);
  // The track list the descriptive-track correction below already handled.
  const correctedListRef = useRef<AudioTrack[] | null>(null);

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
        userChoseRef.current = false;
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

  // Diagnostic: the track list as the player reports it and the rows it
  // yields, once per list. Chatty on TV logs is a known hazard, so this is one
  // compact line rather than one per track.
  useEffect(() => {
    if (!player) return;
    const rows = groupAudioTracksByLanguage(availableAudioTracks);
    const summary = availableAudioTracks
      .map(
        (t) =>
          `${t.id ?? "?"}|${t.language ?? "-"}|${t.name ?? "-"}|${t.label ?? "-"}|${t.channelCount ?? "-"}ch|${t.sampleMimeType ?? "-"}|${t.isSupported === false ? "unsupported" : "ok"}`,
      )
      .join(" ; ");
    console.log(
      `[useAudioTracks] ${availableAudioTracks.length} tracks -> ${rows.length} rows [${rows.map((r) => r.key).join(", ")}] :: ${summary || "(none)"}`,
    );
  }, [player, availableAudioTracks]);

  // Automatic selection can land on commentary: on a direct-played container
  // when the main mix is a codec the device lacks (a DTS main and an AC-3
  // commentary on a phone), on a master when the commentary rendition is the
  // only stereo one. Nothing in the player knows a track titled "English
  // [Commentary]" is not the dialogue, so once per track list, unless the
  // viewer chose a track themselves, move to the language's main mix.
  useEffect(() => {
    if (!player || userChoseRef.current) return;
    if (correctedListRef.current === availableAudioTracks) return;
    const playing = effectiveAudioTrack(
      selectedAudioTrack,
      availableAudioTracks,
    );
    if (!playing || !isDescriptiveAudioTrack(playing)) return;
    const main = preferredMainTrack(playing, availableAudioTracks);
    if (!main) return;
    correctedListRef.current = availableAudioTracks;
    console.log(
      `[useAudioTracks] Automatic selection landed on "${playing.name ?? playing.label}" — moving to "${main.name ?? main.label}"`,
    );
    try {
      player.audioTrack = main;
      setSelectedAudioTrack(keepIfSameTrack(main));
    } catch (e) {
      console.warn(
        "[useAudioTracks] Failed to leave the descriptive track:",
        e,
      );
    }
  }, [player, availableAudioTracks, selectedAudioTrack]);

  const selectAudioTrack = useCallback(
    (track: AudioTrack) => {
      if (!player) return;
      userChoseRef.current = true;
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
