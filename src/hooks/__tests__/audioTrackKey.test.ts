import type { AudioTrack } from "expo-video";

import {
  audioTrackGroupId,
  audioTrackKey,
  audioTrackPreferenceRank,
  audioTracksEqual,
  effectiveAudioLanguage,
  groupAudioTracksByLanguage,
  isAudioTrackSupported,
  isDescriptiveAudioTrack,
  setVerdictAudioTracks,
  verdictMarksDescriptive,
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

describe("isDescriptiveAudioTrack", () => {
  it("reads the container's track title, which Android reports as name", () => {
    // `label` on Android is the locale's display name, never the title.
    expect(
      isDescriptiveAudioTrack({
        id: "8",
        language: "en",
        label: "English",
        name: "English [Commentary]",
      }),
    ).toBe(true);
  });

  it("reads the option display name Apple reports as label", () => {
    expect(
      isDescriptiveAudioTrack(appleTrack("en", "English (Commentary)")),
    ).toBe(true);
  });

  it("matches every keyword the transcoder demotes on, case-insensitively", () => {
    for (const name of [
      "Audio Description",
      "English - Descriptive Video Service",
      "For the visually impaired",
      "DIRECTOR'S COMMENTARY",
    ]) {
      expect(
        isDescriptiveAudioTrack({ language: "en", label: "English", name }),
      ).toBe(true);
    }
  });

  it("leaves main mixes alone", () => {
    expect(isDescriptiveAudioTrack(appleTrack("en", "English"))).toBe(false);
    expect(
      isDescriptiveAudioTrack({
        id: "1",
        language: "en",
        label: "English",
        name: "English (DD+ 5.1)",
      }),
    ).toBe(false);
    expect(isDescriptiveAudioTrack(null)).toBe(false);
  });
});

describe("isAudioTrackSupported", () => {
  it("only fails a track the runtime has explicitly declared undecodable", () => {
    expect(isAudioTrackSupported(appleTrack("en", "English"))).toBe(true);
    expect(
      isAudioTrackSupported({ language: "en", label: "E", isSupported: true }),
    ).toBe(true);
    expect(
      isAudioTrackSupported({ language: "en", label: "E", isSupported: false }),
    ).toBe(false);
  });
});

describe("audioTrackPreferenceRank", () => {
  it("orders decodable main mix, decodable commentary, then undecodable tracks", () => {
    const main = { language: "en", label: "English", name: "English" };
    const commentary = { ...main, name: "English [Commentary]" };
    expect(audioTrackPreferenceRank(main)).toBe(0);
    expect(audioTrackPreferenceRank(commentary)).toBe(1);
    expect(audioTrackPreferenceRank({ ...main, isSupported: false })).toBe(2);
    expect(
      audioTrackPreferenceRank({ ...commentary, isSupported: false }),
    ).toBe(3);
  });
});

describe("groupAudioTracksByLanguage", () => {
  it("represents a language by its decodable main mix, wherever it is declared", () => {
    const truehd = {
      id: "0",
      language: "en",
      label: "English",
      name: "English",
      isSupported: false,
    };
    const commentary = {
      id: "8",
      language: "en",
      label: "English",
      name: "English [Commentary]",
    };
    const ac3 = { id: "1", language: "en", label: "English", name: "English" };
    const options = groupAudioTracksByLanguage([truehd, commentary, ac3]);
    expect(options).toHaveLength(1);
    expect(options[0].track).toBe(ac3);
  });

  it("prefers decodable commentary over a main mix the device cannot decode", () => {
    const truehd = {
      id: "0",
      language: "en",
      label: "English",
      name: "English",
      isSupported: false,
    };
    const commentary = {
      id: "8",
      language: "en",
      label: "English",
      name: "English [Commentary]",
    };
    expect(groupAudioTracksByLanguage([truehd, commentary])[0].track).toBe(
      commentary,
    );
  });

  it("keeps rows in order of first appearance", () => {
    const options = groupAudioTracksByLanguage([
      appleTrack("en", "English (Commentary)"),
      appleTrack("es", "Español"),
      appleTrack("en", "English"),
    ]);
    expect(options.map((o) => o.language)).toEqual(["en", "es"]);
    expect(options[0].track.label).toBe("English");
  });

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

describe("verdictMarksDescriptive (server-side track verdict)", () => {
  const hobbit = [
    {
      index: 0,
      codec: "truehd",
      channels: 8,
      language: "en",
      title: "English [Dolby TrueHD Atmos 7.1]",
      descriptive: false,
    },
    {
      index: 1,
      codec: "ac3",
      channels: 6,
      language: "en",
      title: "English [Dolby Digital EX 5.1]",
      descriptive: false,
    },
    // Flagged by disposition only: the title carries no keyword.
    {
      index: 8,
      codec: "ac3",
      channels: 2,
      language: "en",
      title: "English (Director's track)",
      descriptive: true,
    },
  ];
  afterEach(() => setVerdictAudioTracks(null));

  it("joins on the container title", () => {
    const track = {
      language: "en",
      label: "English",
      name: "English (Director's track)",
      channelCount: 2,
    } as any;
    expect(verdictMarksDescriptive(track, hobbit)).toBe(true);
    const main = {
      language: "en",
      label: "English",
      name: "English [Dolby TrueHD Atmos 7.1]",
      channelCount: 8,
    } as any;
    expect(verdictMarksDescriptive(main, hobbit)).toBe(false);
  });

  it("falls back to a unique language + channel-count match", () => {
    const untitled = {
      language: "en-US",
      label: "English",
      channelCount: 2,
    } as any;
    expect(verdictMarksDescriptive(untitled, hobbit)).toBe(true);
    // Two 6-channel English tracks would be ambiguous; here only one exists,
    // and it is a main mix.
    expect(
      verdictMarksDescriptive(
        { language: "en", channelCount: 6 } as any,
        hobbit,
      ),
    ).toBe(false);
    expect(
      verdictMarksDescriptive(
        { language: "fr", channelCount: 2 } as any,
        hobbit,
      ),
    ).toBe(false);
  });

  it("is consulted by isDescriptiveAudioTrack through the published verdict", () => {
    const track = {
      language: "en",
      label: "English",
      name: "English (Director's track)",
      channelCount: 2,
    } as any;
    expect(isDescriptiveAudioTrack(track)).toBe(false);
    setVerdictAudioTracks(hobbit);
    expect(isDescriptiveAudioTrack(track)).toBe(true);
    setVerdictAudioTracks(null);
    expect(isDescriptiveAudioTrack(track)).toBe(false);
  });
});
