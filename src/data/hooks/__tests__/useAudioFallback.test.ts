import type { AudioTrack } from "expo-video";

import { pickFallbackAudioTrack } from "../useAudioFallback";

import type { HlsAudioGroupInfo } from "@/src/utils/hlsAudioFormats";

// The track surface a patched expo-video reports for a direct-played
// Matroska file on Android: `name` is the container's own track title, the
// only place a commentary track identifies itself.
type AndroidAudioTrack = AudioTrack & { id: string };

const mkvTrack = (
  id: string,
  language: string,
  name: string,
  channelCount: number,
  sampleMimeType: string,
  isSupported = true,
): AndroidAudioTrack => ({
  id,
  language,
  label: name.split(" ")[0],
  name,
  channelCount,
  sampleMimeType,
  isSupported,
});

// The nine-track file the bug was reported on, in container order. The
// TrueHD default is the only English track ahead of the AC-3 5.1 main mix;
// the commentary is the last English track standing.
const TRUEHD = mkvTrack("0", "en", "English", 8, "audio/true-hd");
const AC3_51 = mkvTrack("1", "en", "English", 6, "audio/ac3");
const FR_DTS = mkvTrack("2", "fr", "Français", 8, "audio/vnd.dts.hd", false);
const DE_AC3 = mkvTrack("3", "de", "Deutsch", 6, "audio/ac3");
const ES_AC3 = mkvTrack("4", "es", "Español", 6, "audio/ac3");
const IT_AC3 = mkvTrack("5", "it", "Italiano", 6, "audio/ac3");
const JA_AAC = mkvTrack("6", "ja", "日本語", 2, "audio/mp4a-latm");
const PT_AC3 = mkvTrack("7", "pt", "Português", 6, "audio/ac3");
const COMMENTARY = mkvTrack("8", "en", "English [Commentary]", 2, "audio/ac3");
const MKV_TRACKS = [
  TRUEHD,
  AC3_51,
  FR_DTS,
  DE_AC3,
  ES_AC3,
  IT_AC3,
  JA_AAC,
  PT_AC3,
  COMMENTARY,
];

const pick = (
  tracks: AudioTrack[],
  current: AudioTrack | null,
  tried: string[] = [],
  groups: HlsAudioGroupInfo[] | null = null,
  preferredLanguages = ["en"],
) =>
  pickFallbackAudioTrack(
    tracks,
    current,
    new Set(tried),
    groups,
    preferredLanguages,
  );

describe("pickFallbackAudioTrack on a direct-played container", () => {
  it("walks from the failed default to the 5.1 main mix, never the commentary", () => {
    expect(pick(MKV_TRACKS, TRUEHD)).toBe(AC3_51);
  });

  it("prefers the main mix even when the commentary precedes it in the file", () => {
    const reordered = [TRUEHD, COMMENTARY, FR_DTS, AC3_51];
    expect(pick(reordered, TRUEHD)).toBe(AC3_51);
  });

  it("skips tracks ExoPlayer has declared undecodable while a decodable one remains", () => {
    const tracks = MKV_TRACKS.map((t) =>
      t === TRUEHD ? { ...t, isSupported: false } : t,
    );
    // Nothing is current: the player is on automatic selection.
    expect(pick(tracks, null)?.id).toBe(AC3_51.id);
  });

  it("prefers the film's own audio in another language over commentary in the preferred one", () => {
    const next = pick(MKV_TRACKS, AC3_51, [TRUEHD.id]);
    expect(next).toBe(DE_AC3);
  });

  it("prefers decodable commentary over a track the device cannot decode", () => {
    const tracks = [FR_DTS, COMMENTARY];
    expect(pick(tracks, null)).toBe(COMMENTARY);
  });

  it("still tries undecodable tracks once everything else has failed", () => {
    const decodable = MKV_TRACKS.filter((t) => t !== FR_DTS);
    const next = pick(
      MKV_TRACKS,
      COMMENTARY,
      decodable.map((t) => t.id),
    );
    expect(next).toBe(FR_DTS);
  });

  it("returns null once every track has been tried", () => {
    expect(
      pick(
        MKV_TRACKS,
        COMMENTARY,
        MKV_TRACKS.map((t) => t.id),
      ),
    ).toBeNull();
  });

  it("never re-picks the current track even when it is not in the tried set", () => {
    expect(pick([TRUEHD, AC3_51], AC3_51, [])).toBe(TRUEHD);
    expect(pick([AC3_51], AC3_51, [])).toBeNull();
  });

  it("honours the preferred language order within a pool", () => {
    expect(pick(MKV_TRACKS, TRUEHD, [], null, ["es", "en"])).toBe(ES_AC3);
    expect(pick(MKV_TRACKS, TRUEHD, [], null, ["xx", "en-US"])).toBe(AC3_51);
  });

  it("falls back to the best-ranked track when no preferred language remains", () => {
    // Every English track tried; 5.1 mixes beat the 2ch Japanese one, and
    // the German one is declared first among them.
    const next = pick(MKV_TRACKS, COMMENTARY, [TRUEHD.id, AC3_51.id]);
    expect(next).toBe(DE_AC3);
  });
});

describe("pickFallbackAudioTrack on an HLS master", () => {
  const hlsTrack = (
    groupId: string,
    channelCount: number,
    sampleMimeType: string,
  ): AudioTrack => ({
    id: `${groupId}:Audio`,
    language: "en",
    label: "English",
    name: "Audio",
    channelCount,
    sampleMimeType,
  });
  const AAC = hlsTrack("aud-aac", 2, "audio/mp4a-latm");
  const EC3 = hlsTrack("aud-ec3", 6, "audio/eac3");
  const AC3 = hlsTrack("aud-ac3", 6, "audio/ac3");
  const MONO = hlsTrack("aud-mono", 1, "audio/mp4a-latm");

  const group = (
    groupId: string,
    channels: number,
    selectable: boolean,
  ): HlsAudioGroupInfo => ({
    groupId,
    channels,
    joc: false,
    audioCodec: null,
    selectable,
    label: "",
  });
  const GROUPS = [
    group("aud-aac", 2, true),
    group("aud-ec3", 6, true),
    group("aud-ac3", 6, true),
    group("aud-mono", 1, false),
  ];

  it("prefers more channels among otherwise equal renditions", () => {
    expect(pick([AAC, EC3, AC3, MONO], EC3, [], GROUPS)).toBe(AC3);
  });

  it("keeps ties in declared order", () => {
    expect(pick([AC3, EC3], null, [], GROUPS)).toBe(AC3);
  });

  it("tries cellular-only groups last, but still tries them", () => {
    expect(pick([MONO, AAC], null, [], GROUPS)).toBe(AAC);
    expect(pick([MONO, AAC], AAC, [], GROUPS)).toBe(MONO);
  });

  it("orders by declared order alone when no master has been parsed", () => {
    const unpatched = [MONO, AAC].map(
      ({ id, language, label }) => ({ id, language, label }) as AudioTrack,
    );
    expect(pick(unpatched, null, [], null)).toBe(unpatched[0]);
  });
});

describe("pickFallbackAudioTrack on Apple platforms", () => {
  // No id, no decoder verdict, no channel count — only language and the
  // option's display name.
  const appleTrack = (language: string, label: string): AudioTrack =>
    ({ language, label }) as AudioTrack;
  const EN = appleTrack("en", "English");
  const EN_COMMENTARY = appleTrack("en", "English (Commentary)");
  const ES = appleTrack("es", "Español");

  it("walks in declared order with commentary last", () => {
    expect(pick([EN_COMMENTARY, EN, ES], null)).toBe(EN);
    expect(pick([EN_COMMENTARY, EN, ES], EN)).toBe(ES);
    expect(pick([EN_COMMENTARY, EN, ES], ES, ["en|English"])).toBe(
      EN_COMMENTARY,
    );
  });

  it("recognises audio description from the display name", () => {
    const AD = appleTrack("en", "English (Audio Description)");
    expect(pick([AD, ES], null)).toBe(ES);
  });
});
