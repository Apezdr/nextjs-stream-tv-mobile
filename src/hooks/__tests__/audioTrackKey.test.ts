import type { AudioTrack } from "expo-video";

import {
  audioTrackGroupId,
  audioTrackKey,
  audioTracksEqual,
  effectiveAudioLanguage,
  groupAudioTracksByLanguage,
  normalizeLanguageTag,
} from "../useAudioTracks";

// `id` is Android-only at runtime despite being typed as string, so Apple
// tracks are modeled without one.
const appleTrack = (language: string, label: string): AudioTrack =>
  ({ language, label }) as AudioTrack;

describe("audioTrackKey", () => {
  it("uses the id when present (Android)", () => {
    expect(audioTrackKey({ id: "42", language: "en", label: "English" })).toBe(
      "42",
    );
  });

  it("falls back to language+label when id is absent (Apple)", () => {
    expect(audioTrackKey(appleTrack("en", "English"))).toBe("en|English");
  });
});

describe("audioTracksEqual", () => {
  it("matches Apple tracks by language+label", () => {
    expect(
      audioTracksEqual(
        appleTrack("en", "English"),
        appleTrack("en", "English"),
      ),
    ).toBe(true);
    expect(
      audioTracksEqual(
        appleTrack("en", "English"),
        appleTrack("es", "Español"),
      ),
    ).toBe(false);
  });

  it("matches Android tracks by id", () => {
    expect(
      audioTracksEqual(
        { id: "1", language: "en", label: "English" },
        { id: "1", language: "en", label: "English" },
      ),
    ).toBe(true);
    expect(
      audioTracksEqual(
        { id: "1", language: "en", label: "English" },
        { id: "2", language: "en", label: "English (DD+)" },
      ),
    ).toBe(false);
  });

  it("treats nullish operands as equal only when both are the same", () => {
    expect(audioTracksEqual(null, null)).toBe(true);
    expect(audioTracksEqual(undefined, undefined)).toBe(true);
    expect(audioTracksEqual(null, appleTrack("en", "English"))).toBe(false);
    expect(audioTracksEqual(appleTrack("en", "English"), null)).toBe(false);
  });
});

describe("normalizeLanguageTag", () => {
  it("normalizes both separators and case", () => {
    expect(normalizeLanguageTag("en")).toBe("en");
    expect(normalizeLanguageTag("EN")).toBe("en");
    expect(normalizeLanguageTag("en-US")).toBe("en");
    // Apple canonicalizes locale identifiers with an underscore.
    expect(normalizeLanguageTag("en_US")).toBe("en");
    expect(normalizeLanguageTag(null)).toBe("");
  });
});

describe("audioTrackGroupId", () => {
  it("takes the GROUP-ID prefix of an Android format id", () => {
    expect(
      audioTrackGroupId({ id: "aud-ec3:Audio", language: "en", label: "E" }),
    ).toBe("aud-ec3");
  });

  it("returns null when there is no id (Apple) or no colon", () => {
    expect(audioTrackGroupId(appleTrack("en", "English"))).toBeNull();
    expect(
      audioTrackGroupId({ id: "plain", language: "en", label: "E" }),
    ).toBeNull();
    expect(audioTrackGroupId(null)).toBeNull();
  });
});

describe("effectiveAudioLanguage", () => {
  const tracks = [appleTrack("en", "English"), appleTrack("es", "Español")];

  it("uses the explicit selection when the player reports one", () => {
    expect(effectiveAudioLanguage(appleTrack("es", "Español"), tracks)).toBe(
      "es",
    );
  });

  it("falls back to the first track while on automatic selection", () => {
    // player.audioTrack is null until something explicitly assigns a track,
    // which is the normal state during playback.
    expect(effectiveAudioLanguage(null, tracks)).toBe("en");
  });

  it("returns empty when there is nothing to go on", () => {
    expect(effectiveAudioLanguage(null, [])).toBe("");
  });
});

describe("groupAudioTracksByLanguage", () => {
  it("collapses same-language renditions into one option", () => {
    const options = groupAudioTracksByLanguage([
      { id: "aud-aac:Audio", language: "en", label: "English" },
      { id: "aud-ec3:Audio", language: "en", label: "English" },
      { id: "aud-ac3:Audio", language: "en", label: "English" },
    ]);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ language: "en", label: "English" });
    // The representative is the first declared rendition.
    expect(options[0].track.id).toBe("aud-aac:Audio");
  });

  it("skips tracks with no language rather than making Unknown rows", () => {
    expect(
      groupAudioTracksByLanguage([
        { id: "aud-aac:Audio", language: "", label: "" },
        { id: "aud-ec3:Audio", language: "", label: "" },
      ]),
    ).toEqual([]);
  });

  it("labels known languages with their endonym", () => {
    const options = groupAudioTracksByLanguage([
      appleTrack("en", "English"),
      appleTrack("pt", "Portuguese"),
    ]);
    expect(options.map((o) => o.label)).toEqual(["English", "Português"]);
  });
});
